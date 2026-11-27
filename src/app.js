// app.js: starts Tadpole Tales.

import { make, button } from './ui.js';
import { mountWriter } from './keyboard.js';

// The service worker (sw.js) saves the app's files so it opens without
// internet. If the phone can't run one, the app works as before, online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline mode is off:', error));
}

// Temporary: "Make a new book" opens the keyboard to try it out, until the
// real page screen arrives (task 1.7 in docs/phase-1-plan.md removes this).
const shelf = document.querySelector('.shelf');
document.querySelector('.go').addEventListener('click', () => {
  const screen = make('main', 'screen try-keys');
  const top = screen.appendChild(make('div', 'screen-top'));
  const back = top.appendChild(button('back', '←', () => { screen.remove(); shelf.hidden = false; }));
  back.setAttribute('aria-label', 'Back');
  top.append(make('h2', '', 'Try the keys'));
  mountWriter(screen, { label: 'Your words' });
  shelf.hidden = true;
  document.body.append(screen);
});
