// app.js: starts Tadpole Tales.

import { make, button, saveMark } from './ui.js';
import { mountWriter } from './keyboard.js';
import { newBook, setPageText } from './book.js';
import { saveSoon, saveNow, onSaveState } from './store.js';

// The service worker (sw.js) saves the app's files so it opens without
// internet. If the phone can't run one, the app works as before, online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline mode is off:', error));
}

// Temporary: "Make a new book" opens the keyboard to try it out, until the
// real page screen arrives (task 1.7 in docs/phase-1-plan.md removes this).
// What is typed is saved as a one-page book, so saving can be tried too.
const shelf = document.querySelector('.shelf');
document.querySelector('.go').addEventListener('click', () => {
  let book = newBook(crypto.randomUUID(), Date.now());
  const screen = make('main', 'screen try-keys');
  const top = screen.appendChild(make('div', 'screen-top'));
  const mark = saveMark();
  const stopWatching = onSaveState(mark.update);
  const back = top.appendChild(button('back', '←', () => {
    saveNow();
    stopWatching();
    screen.remove();
    shelf.hidden = false;
  }));
  back.setAttribute('aria-label', 'Back');
  top.append(make('h2', '', 'Try the keys'), mark.node);
  mountWriter(screen, {
    label: 'Your words',
    onChange: (text) => {
      book = setPageText(book, 0, text, Date.now());
      saveSoon(book);
    },
  });
  shelf.hidden = true;
  document.body.append(screen);
});
