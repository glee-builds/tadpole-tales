// polish.js: the spelling "Polish" step after Finish, as plain functions (no screen).
//
// Spelling only: never capitals, punctuation or grammar. It stays quiet when
// unsure. It can only ever SUGGEST a word from data/common-words.txt (a short
// hand-written list of friendly everyday words), and it only asks about a word
// that is not in data/known-words.txt.

export const WORD_FILES = ['../data/known-words.txt', '../data/common-words.txt'];
export const MAX_ASKED = 8;
const CLEAR_WINNER = 1000; // a tie is settled only for a word within this many of the list's start

const lines = (text) => String(text ?? '').split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean);

/** Read the two word files' text: { known: Set, common: array in order, commonSet: Set, rank: Map }. */
export function loadWordLists(knownText, commonText) {
  const common = [...new Set(lines(commonText))];
  const commonSet = new Set(common);
  const known = new Set([...lines(knownText), ...common]);
  const rank = new Map(common.map((word, i) => [word, i]));
  return { known, common, commonSet, rank };
}

// How many edits apart: insert, delete, change a letter, or swap two neighbors. Gives up past `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// What kind of one-letter slip turns the writer's word into the candidate. The
// order is how likely each is for a young writer: a swap ("teh"), then a
// missing letter ("frend"), then an extra or wrong letter ("verry", "thay").
function slipKind(word, candidate) {
  if (candidate.length > word.length) return 1;
  if (candidate.length < word.length) return 2;
  return [...word].filter((c, i) => c !== candidate[i]).length === 2 ? 0 : 2;
}

/** The one friendly word to suggest for a lowercase word, or null when there is no single best match. */
function bestMatch(word, lists) {
  const reach = word.length >= 7 ? 2 : 1;
  let best = [];
  let bestDistance = reach + 1;
  lists.common.forEach((candidate, rank) => {
    if (candidate.length < 4 && candidate.length < word.length) return; // "agen" is not "age"
    if (candidate[0] !== word[0] && !(candidate[0] === word[1] && candidate[1] === word[0])) return; // first letters are rarely wrong
    const d = distance(word, candidate, reach);
    if (d > reach || d > bestDistance) return;
    if (d < bestDistance) { bestDistance = d; best = []; }
    best.push({ candidate, rank, kind: d === 1 ? slipKind(word, candidate) : 0 });
  });
  if (!best.length) return null;
  const kind = Math.min(...best.map((match) => match.kind));
  best = best.filter((match) => match.kind === kind); // still in list order
  if (best.length === 1) return best[0].candidate;
  const [first, second] = best;
  // A tie: only a clearly more common word wins, otherwise stay quiet.
  return first.rank < CLEAR_WINNER && (second.rank >= CLEAR_WINNER || first.rank * 5 <= second.rank) ? first.candidate : null;
}

const isKnown = (word, known) =>
  known.has(word) || (word.endsWith('s') && known.has(word.slice(0, -1))) || (word.endsWith("'s") && known.has(word.slice(0, -2)));

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
      if (skip.has(word) || asked.has(word) || isKnown(word, lists.known)) continue;
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
