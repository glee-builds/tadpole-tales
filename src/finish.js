// finish.js: what comes after "Finish": the book's title, the author name
// (only the first time) and the cover.
//
// The book is already finished and saved before this screen opens, and every
// step saves as it goes (through onBook and onAuthor), so closing the app at
// any step loses nothing. Each step has one button: "Skip" while nothing is
// there yet, and "Next" or "Done" once something is.
//
//   showFinish(screen, { book, author, onBook(book), onAuthor(name), onDone() })

import { make, button } from './ui.js';
import { mountWriter } from './keyboard.js';
import { mountPicture } from './stickers.js';
import { TITLE_LIMIT, setTitle, setCoverStickers } from './book.js';

export const NAME_LIMIT = 20;

export function showFinish(screen, { book, author, onBook, onAuthor, onDone }) {
  let writer = null;
  let picture = null;
  const steps = ['title', ...(author ? [] : ['name']), 'cover'];
  let at = 0;

  /** Draw step `at`: a heading and its button on top, then the step itself. */
  function draw() {
    writer?.remove();
    picture?.remove();
    writer = picture = null;
    screen.replaceChildren();
    const step = steps[at];
    const top = screen.appendChild(make('div', 'screen-top finish-top'));
    const heading = top.appendChild(make('h1', 'screen-title', {
      title: 'What\'s your book called?',
      name: 'What\'s your author name?',
      cover: 'Add stickers to your cover',
    }[step]));
    const go = top.appendChild(button('pill', 'Skip', next));
    /** One button: "Skip" while empty, then "Next" or "Done". */
    const label = (has) => {
      go.textContent = has ? (at === steps.length - 1 ? '✓ Done' : 'Next ›') : 'Skip';
      go.classList.toggle('pill-go', has);
    };
    heading.setAttribute('tabindex', '-1');

    if (step === 'title') {
      label(Boolean(book.title));
      writer = mountWriter(screen, {
        text: book.title, limit: TITLE_LIMIT, label: 'Your book\'s title',
        onChange: (text) => { book = setTitle(book, text, Date.now()); onBook(book); label(Boolean(text.trim())); },
      });
    } else if (step === 'name') {
      label(false);
      writer = mountWriter(screen, {
        text: '', limit: NAME_LIMIT, label: 'Your author name',
        onChange: (text) => { author = text.trim(); onAuthor(author); label(Boolean(author)); },
      });
    } else {
      const cover = screen.appendChild(make('div', 'finish-cover'));
      cover.append(make('p', 'finish-title', book.title.trim() || 'My book'));
      picture = mountPicture(cover, {
        stickers: book.cover?.stickers ?? [],
        editable: true,
        onChange: (stickers) => { book = setCoverStickers(book, stickers, Date.now()); onBook(book); label(stickers.length > 0); },
      });
      if (author) picture.node.after(make('p', 'finish-by', `by ${author}`));
      label((book.cover?.stickers ?? []).length > 0);
    }
  }

  function next() {
    if (at < steps.length - 1) { at++; draw(); } else onDone();
  }

  draw();
  return { remove() { writer?.remove(); picture?.remove(); screen.replaceChildren(); } };
}
