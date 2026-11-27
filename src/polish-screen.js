// polish-screen.js: the "Spelling check" step of finishing a book. One word at a
// time, in its sentence: "Did you mean rock?" with the suggestion or "Keep mine".
// Never automatic, never red, never "wrong"; Skip leaves at any point. Each
// answer is saved before the next word shows. The rules are in polish.js.
//
//   showPolish(screen, { book, names, onBook(book) (may be async), onExit() }) -> { remove }
// onExit runs when the step is over: every word answered, Skip, or nothing to ask
// (also when the word lists can't load). The step then draws nothing at all.

import { make, button } from './ui.js';
import { loadWordLists, wordsToAsk, applySuggestion, WORD_FILES } from './polish.js';

const SLOW = 300; // ms before "Getting ready…" shows; a quick load shows nothing
const AROUND = 60; // characters of a long sentence kept on each side of the word

let lists; // the word lists (1.9 MB), loaded once, and only when this step is reached

/** The two word files, as lists; null when they can't be loaded. */
function loadLists() {
  lists ??= (async () => {
    try {
      const texts = await Promise.all(WORD_FILES.map((file) => fetch(new URL(file, import.meta.url)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))))));
      return loadWordLists(...texts);
    } catch {
      return null;
    }
  })();
  return lists.then((one) => { if (!one) lists = undefined; return one; }); // a failed load is tried again next time
}

/** Every word in the story helpers' "who" answer and the author's name. */
export const namesFrom = (book, author) =>
  [book.plan?.who, author].flatMap((text) => (typeof text === 'string' ? text.split(/[^\p{L}']+/u) : [])).filter(Boolean);

/** [before, word, after]: the item's sentence, cut short if it is long. */
export function sentenceAround(text, item) {
  const before = text.slice(0, item.start);
  const after = text.slice(item.end);
  const from = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1;
  let to = after.search(/[.!?\n]/);
  to = to === -1 ? text.length : item.end + to + 1;
  const s = Math.max(from, item.start - AROUND);
  const e = Math.min(to, item.end + AROUND);
  const [lead, tail] = [s > from ? '…' : '', e < to ? '…' : ''];
  return [lead + text.slice(s, item.start).trimStart(), text.slice(item.start, item.end), text.slice(item.end, e).trimEnd() + tail];
}

export function showPolish(screen, { book, names, onBook, onExit }) {
  let dead = false;
  let items = [];
  let at = 0;
  const box = screen.appendChild(make('div', 'polish'));
  const exit = () => { if (!dead) { dead = true; onExit(); } };

  /** The top row (a calm title, Skip) and a body under it. */
  const frame = () => {
    box.replaceChildren();
    const top = box.appendChild(make('div', 'screen-top finish-top'));
    const heading = top.appendChild(make('h1', 'screen-title', 'Spelling check'));
    heading.setAttribute('tabindex', '-1');
    top.appendChild(button('pill', 'Skip', exit));
    return box;
  };

  const ask = () => {
    if (at >= items.length) { exit(); return; }
    const item = items[at];
    const [before, word, after] = sentenceAround(book.pages[item.pageIndex].text, item);
    frame();
    const card = box.appendChild(make('div', 'finish-card polish-card'));
    const sentence = make('p', 'polish-sentence');
    sentence.append(before, make('mark', 'polish-word', word), after);
    card.append(
      make('p', 'finish-card-icon', '✏️'),
      make('p', 'finish-card-words', `Did you mean ${item.suggestion}?`),
      sentence,
    );
    card.firstChild.setAttribute('aria-hidden', 'true');
    card.appendChild(make('div', 'finish-choices')).append(
      button('pill pill-go', `✓ ${item.suggestion}`, () => answer(true)),
      button('pill', '✋ Keep mine', () => answer(false)),
    );
    card.append(make('p', 'polish-count', `${at + 1} of ${items.length}`));
  };

  let busy = false;
  async function answer(use) {
    if (busy || dead) return;
    busy = true;
    const item = items[at];
    if (use) {
      book = applySuggestion(book, item);
      const shift = item.suggestion.length - item.word.length;
      for (const later of items.slice(at + 1)) { // the words after it on this page moved
        if (later.pageIndex === item.pageIndex && later.start > item.start) { later.start += shift; later.end += shift; }
      }
      try { await onBook(book); } catch { /* the "not saved" mark shows */ }
    }
    busy = false;
    if (dead) return;
    at++;
    try { ask(); } catch { exit(); } // a word that can't be drawn ends the step, never a blank screen
  }

  const slow = setTimeout(() => { if (!dead && !items.length) { frame(); box.append(make('p', 'polish-wait', 'Getting ready…')); } }, SLOW);
  loadLists().then((one) => {
    clearTimeout(slow);
    if (dead) return;
    items = one ? wordsToAsk(book, one, names) : [];
    if (items.length) ask(); else exit(); // nothing to ask, or no lists: skip quietly
  }).catch(exit); // anything that throws still ends the step

  return { remove: () => { dead = true; clearTimeout(slow); box.remove(); } };
}
