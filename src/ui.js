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

/** How much CSS zoom (the tablet rule in styles.css) enlarges `node` on the screen. */
function zoomOf(node) {
  let zoom = 1;
  for (let at = node; at; at = at.parentElement) zoom *= Number(getComputedStyle(at).zoom) || 1;
  return zoom;
}

/**
 * What to divide a tap's screen position by so it matches `node`'s box. Under
 * CSS zoom old Safari measures boxes in un-zoomed pixels and newer browsers in
 * screen pixels (the same sum as `across` in Little Pond).
 */
export const tapScale = (node) => (zoomOf(node) * node.offsetWidth) / node.getBoundingClientRect().width;

/** "1 duckling", "3 ducklings". */
export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

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
