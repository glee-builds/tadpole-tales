// polish.js: the spelling "Polish" step after Finish, as plain functions (no screen).
//
// Spelling only: never capitals, punctuation or grammar. It stays quiet when
// unsure. It can only ever SUGGEST a word from data/common-words.txt (a short
// hand-written list of friendly everyday words) or a hand-checked short pair,
// and it only asks about a word that is not known: in data/known-words.txt or
// data/extra-known.txt, or a regular ending/contraction of a known word.

export const WORD_FILES = ['../data/known-words.txt', '../data/common-words.txt', '../data/extra-known.txt'];
export const MAX_ASKED = 8;

// Words under 5 letters get no guessing: too many real words sit one letter
// away. Only these hand-checked slips are ever offered for them (and they win
// over the known list, which has old words like "wen"). Longer slips the
// distance rule would get wrong are here too. Every pair is certain.
export const PAIRS = {
  nite: 'night', nigt: 'night', sno: 'snow', wen: 'when', teh: 'the', wus: 'was', wuz: 'was', thay: 'they',
  sed: 'said', sayd: 'said', frum: 'from', cum: 'come', agen: 'again', agin: 'again', wich: 'which', wat: 'what',
  hav: 'have', luv: 'love', gud: 'good', wud: 'would', cud: 'could', shud: 'should', woud: 'would', coud: 'could',
  rok: 'rock', wont: "won't", dont: "don't", isnt: "isn't", evry: 'every', eny: 'any', sory: 'sorry', funy: 'funny',
  hapy: 'happy', pupy: 'puppy', aple: 'apple', juse: 'juice', enuf: 'enough', piza: 'pizza', bik: 'bike',
  kno: 'know', nu: 'new', wher: 'where', tonite: 'tonight', elefant: 'elephant', snak: 'snake', brav: 'brave', thier: 'their',
};

const pairOf = (word) => (Object.prototype.hasOwnProperty.call(PAIRS, word) ? PAIRS[word] : undefined);

const lines = (text) => String(text ?? '').split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean);

/** Read the word files' text: { known: Set, common: array in order, commonSet: Set, contractions: Map }. */
export function loadWordLists(knownText, commonText, extraText = '') {
  const common = [...new Set(lines(commonText))];
  const commonSet = new Set(common);
  const known = new Set([...lines(knownText), ...common, ...lines(extraText)]);
  const contractions = new Map(); // "didnt" -> ["didn't"]
  for (const word of common) if (word.includes("'")) contractions.set(word.replace(/'/g, ''), [...(contractions.get(word.replace(/'/g, '')) ?? []), word]);
  return { known, common, commonSet, contractions };
}

// A slip that sounds the same: vowels, or c/k/s, s/z, d/t, b/p, g/j, f/v, m/n. Any other letter swap is not allowed.
const SOUNDS = ['aeiouy', 'cks', 'sz', 'dt', 'bp', 'gj', 'fv', 'mn', 'uw'];
const alike = (a, b) => SOUNDS.some((group) => group.includes(a) && group.includes(b));

// How many edits apart: insert, delete, change a letter, or swap two neighbors. Gives up past `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const change = a[i - 1] === b[j - 1] ? 0 : alike(a[i - 1], b[j - 1]) ? 1 : 9;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + change);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// What kind of one-letter slip turns the writer's word into the candidate. The
// order is how likely each is for a young writer: a swap ("freind"), then a
// missing letter ("frend"), then an extra or wrong letter ("verry").
function slipKind(word, candidate) {
  if (candidate.length > word.length) return 1;
  if (candidate.length < word.length) return 2;
  return [...word].filter((c, i) => c !== candidate[i]).length === 2 ? 0 : 2;
}

const hasDoubled = (word) => /(.)\1/.test(word);

/** The one friendly word to suggest for a lowercase, unknown word, or null when there is no single best match. */
function bestMatch(word, lists) {
  if (pairOf(word)) return pairOf(word);
  if (word.length < 5) return null;
  const contraction = lists.contractions.get(word.replace(/'/g, ''));
  if (contraction) return contraction.length === 1 ? contraction[0] : null; // "didnt" is "didn't"
  const reach = word.length >= 7 ? 2 : 1;
  let best = [];
  let bestDistance = reach + 1;
  for (const candidate of lists.common) {
    if (candidate[0] !== word[0] && !(candidate[0] === word[1] && candidate[1] === word[0])) continue; // first letters are rarely wrong
    if (candidate.length < word.length && !hasDoubled(word)) continue; // an extra letter is only likely when it is doubled ("verry")
    const d = distance(word, candidate, reach);
    if (d > reach || d > bestDistance) continue;
    if (d < bestDistance) { bestDistance = d; best = []; }
    best.push({ candidate, kind: d === 1 ? slipKind(word, candidate) : 0 });
  }
  const kind = Math.min(...best.map((match) => match.kind));
  best = best.filter((match) => match.kind === kind);
  return best.length === 1 ? best[0].candidate : null; // any tie stays quiet
}

// Beginnings of a regular word: "kissed" is "kiss", "hoping" is "hope", "tapped" is "tap", "babies" is "baby".
function stems(w) {
  const out = [];
  const cut = (n, add = '') => { if (w.length - n >= 3) out.push(w.slice(0, -n) + add); };
  const twice = (n) => { const b = w.slice(0, -n); if (b.length >= 3 && b[b.length - 1] === b[b.length - 2]) out.push(b.slice(0, -1)); };
  if (w.endsWith('s')) { cut(1); if (w.endsWith('es')) cut(2); if (w.endsWith('ies')) cut(3, 'y'); if (w.endsWith('ves')) { cut(3, 'f'); cut(3, 'fe'); } }
  if (w.endsWith('ed')) { cut(2); cut(1); twice(2); if (w.endsWith('ied')) cut(3, 'y'); }
  if (w.endsWith('ing')) { cut(3); cut(3, 'e'); twice(3); if (w.endsWith('ying')) cut(4, 'ie'); }
  if (w.endsWith('er')) { cut(2); cut(1); twice(2); if (w.endsWith('ier')) cut(3, 'y'); }
  if (w.endsWith('est')) { cut(3); cut(2); if (!w.endsWith('rrest')) twice(3); if (w.endsWith('iest')) cut(4, 'y'); } // "forrest" is not "for" + est
  if (w.endsWith('ly')) { cut(2); cut(1, 'e'); if (w.endsWith('ily')) cut(3, 'y'); }
  return out;
}

const SUFFIXES = ["'s", "'d", "'ve", "'re", "'ll", "'m"];

function isKnown(word, lists) {
  const { known, contractions } = lists;
  if (known.has(word)) return true;
  if (contractions.has(word)) return false; // "thats" is a missing apostrophe, not "that" + s
  if (word.includes("'")) {
    if (word.endsWith("n't")) return known.has(word.slice(0, -3));
    const suffix = SUFFIXES.find((s) => word.endsWith(s));
    return suffix !== undefined && known.has(word.slice(0, -suffix.length));
  }
  return stems(word).some((stem) => known.has(stem));
}

/**
 * Up to 8 words to ask about, across the whole book, in reading order:
 * [{ pageIndex, start, end, word, suggestion }]. `names` are the story helpers' names.
 */
export function wordsToAsk(book, lists, names = []) {
  const skip = new Set(names.map((name) => String(name).toLowerCase()));
  const asked = new Set();
  const out = [];
  for (let pageIndex = 0; pageIndex < book.pages.length && out.length < MAX_ASKED; pageIndex++) {
    const text = book.pages[pageIndex].text ?? '';
    for (const match of text.matchAll(/[\p{L}\p{N}'’]+/gu)) {
      if (out.length >= MAX_ASKED) break;
      const trimmed = match[0].replace(/^['’]+/, '');
      const start = match.index + (match[0].length - trimmed.length);
      const raw = trimmed.replace(/['’]+$/, '');
      if (!/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(raw) || raw.length < 2) continue; // letters only
      if (/^[A-Z]/.test(raw)) continue; // a capital letter: a name or a place
      const word = raw.replace(/’/g, "'");
      if (skip.has(word) || asked.has(word) || isKnown(word, lists)) continue;
      asked.add(word);
      const suggestion = bestMatch(word, lists);
      if (suggestion) out.push({ pageIndex, start, end: start + raw.length, word: raw, suggestion });
    }
  }
  return out;
}

/** A new book with that one word replaced. Nothing else changes (not even the changed time). */
export function applySuggestion(book, item) {
  const page = book.pages[item.pageIndex];
  if (!page || page.text.slice(item.start, item.end) !== item.word) return book; // the text moved on: do nothing
  const text = page.text.slice(0, item.start) + item.suggestion + page.text.slice(item.end);
  return { ...book, pages: book.pages.map((p, i) => (i === item.pageIndex ? { ...p, text } : p)) };
}
