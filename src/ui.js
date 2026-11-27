// ui.js: small helpers the app and its games share.

/** A new element, e.g. make('p', 'pond-caption', 'Hello'). */
export function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A button that calls `onClick` when pressed. */
export function button(className, text, onClick) {
  const node = make('button', className, text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/** Play the "not quite" wiggle on `node`, even if it just played. */
export function wiggle(node) {
  node.classList.remove('wiggle');
  void node.offsetWidth; // makes the browser notice the class was removed
  node.classList.add('wiggle');
}

/**
 * A row of dots, one per round. Call update(now): rounds before `now` are
 * done (filled, with a check mark), and `now` is the one on screen.
 */
export function progressDots(count) {
  const node = make('div', 'dots');
  const dots = Array.from({ length: count }, () => node.appendChild(make('span', 'dot')));
  function update(now) {
    dots.forEach((dot, i) => {
      dot.className = 'dot' + (i < now ? ' dot-done' : i === now ? ' dot-now' : '');
      dot.textContent = i < now ? '✓' : '';
    });
  }
  return { node, update };
}

/** "1 duckling", "3 ducklings". */
export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The whole numbers from `low` to `high`: range(2, 5) is [2, 3, 4, 5]. */
export const range = (low, high) => Array.from({ length: high - low + 1 }, (_, i) => low + i);

/**
 * The "not saved" mark: an icon and words, shown only while a save has
 * failed. Use it with store.js: onSaveState(mark.update).
 */
export function saveMark() {
  const node = make('p', 'save-mark', '⚠ Not saved');
  node.setAttribute('role', 'status');
  node.hidden = true;
  return { node, update: (state) => { node.hidden = state !== 'not-saved'; } };
}
