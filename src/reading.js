// reading.js: the reading view. One page at a time, in big type.
// No voice yet; reading aloud comes later (task 2.4).

import { make, button } from './ui.js';

/** Draw `book` into `root` (a flex column that fills the screen). `onClose` leaves it. */
export function showReading(root, book, { onClose }) {
  let index = 0;
  root.replaceChildren();

  const top = root.appendChild(make('div', 'screen-top'));
  const close = top.appendChild(button('pill', '✕ Close', onClose));
  close.setAttribute('aria-label', 'Close the book');
  top.append(make('h1', 'screen-title', book.title || 'Your book'));

  const page = root.appendChild(make('div', 'read-page'));
  page.setAttribute('aria-live', 'polite');

  const nav = root.appendChild(make('div', 'read-nav'));
  const previous = nav.appendChild(button('pill', '‹ Previous', () => show(index - 1)));
  const count = nav.appendChild(make('p', 'read-count'));
  count.style.margin = '0';
  const next = nav.appendChild(button('pill', 'Next ›', () => show(index + 1)));

  function show(to) {
    index = Math.min(Math.max(to, 0), book.pages.length - 1);
    const text = book.pages[index].text;
    page.className = text ? 'read-page' : 'read-page read-empty';
    page.textContent = text || 'This page has no words yet.';
    page.scrollTop = 0;
    count.textContent = `Page ${index + 1} of ${book.pages.length}`;
    previous.disabled = index === 0;
    next.disabled = index === book.pages.length - 1;
  }
  show(0);
}
