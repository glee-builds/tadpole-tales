// keyboard.js: the writing area and the app's own keyboard, on screen.
//
// There is no text field (no <input>, <textarea> or contenteditable), so the
// phone's own keyboard, autocorrect and paste bubble never appear. The words
// and the cursor live in a typing state (src/typing.js); this file only
// draws them and turns taps into calls to those functions.
//
// Use it from any screen:
//   const writer = mountWriter(box, { text: page.text, onChange: (text) => ... });
//   writer.getText(); writer.setText('...'); writer.remove();

import { make, button } from './ui.js';
import { LIMIT, startTyping, typeKey, backspace, toggleShift, moveCursor, newLine } from './typing.js';

const ROWS = [
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  ['shift', ...'zxcvbnm'.split(''), 'backspace'],
  ['.', ',', '!', '?', "'", '"'],
  ['space', 'enter'],
];

// What a key shows, and what it is called for a screen reader.
const KEYS = {
  shift: ['⇧', 'Capital letter'],
  backspace: ['⌫', 'Delete'],
  space: ['space', 'Space'],
  enter: ['new line ↵', 'New line'],
  '.': ['.', 'Full stop'],
  ',': [',', 'Comma'],
  '!': ['!', 'Exclamation mark'],
  '?': ['?', 'Question mark'],
  "'": ["'", 'Apostrophe'],
  '"': ['"', 'Speech mark'],
};

const HOLD_WAIT = 500; // ms before a held backspace starts repeating
const HOLD_EVERY = 90; // ms between deletes while it is held

/** Add a writing area and keyboard to `parent` (a flex column). See the top of this file. */
export function mountWriter(parent, { text = '', limit = LIMIT, label = 'Your words', onChange } = {}) {
  let state = startTyping(text, limit);

  const area = make('div', 'writing');
  area.setAttribute('role', 'textbox');
  area.setAttribute('aria-readonly', 'true'); // read by screen readers, typed only with the keys below
  area.setAttribute('aria-multiline', 'true');
  area.setAttribute('aria-label', label);

  const keyboard = make('div', 'keyboard');
  let shiftKey;
  for (const row of ROWS) {
    const line = keyboard.appendChild(make('div', 'key-row'));
    for (const key of row) {
      const [shown, name] = KEYS[key] ?? [key, key];
      const node = line.appendChild(button(`key key-${key.length === 1 ? 'char' : key}`, shown));
      node.dataset.key = key;
      if (name !== shown) node.setAttribute('aria-label', name);
      if (key === 'shift') shiftKey = node;
    }
  }

  /** Make a change, redraw, and tell the screen if the words changed. */
  function change(next) {
    const textChanged = next.text !== state.text;
    state = next;
    draw();
    if (textChanged) onChange?.(state.text);
  }

  // One span per character, so a tap can measure where each one is.
  function draw() {
    area.textContent = '';
    [...state.text].forEach((char, i) => {
      if (i === state.cursor) area.append(cursorMark());
      area.append(make('span', 'ch', char));
    });
    if (state.cursor >= state.text.length) area.append(cursorMark());
    area.append(make('span', 'end', '\u200b')); // marks where an empty last line sits
    area.querySelector('.cursor').scrollIntoView({ block: 'nearest' });
    keyboard.classList.toggle('shifted', state.shift);
    shiftKey.setAttribute('aria-pressed', String(state.shift));
  }

  keyboard.addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]')?.dataset.key;
    if (!key) return;
    if (key === 'backspace') {
      if (event.detail === 0) change(backspace(state)); // a screen reader or keyboard "click"; taps are handled on pointerdown
    } else if (key === 'shift') change(toggleShift(state));
    else if (key === 'space') change(typeKey(state, ' '));
    else if (key === 'enter') change(newLine(state));
    else change(typeKey(state, key));
  });

  // Backspace deletes as soon as it is touched, then keeps deleting while held.
  let holding;
  const stopHold = () => clearTimeout(holding);
  keyboard.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-key]')?.dataset.key !== 'backspace') return;
    const repeat = () => { change(backspace(state)); holding = setTimeout(repeat, HOLD_EVERY); };
    stopHold();
    change(backspace(state));
    holding = setTimeout(repeat, HOLD_WAIT);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) keyboard.addEventListener(type, stopHold);
  // A finger sliding off the backspace key also stops it.
  keyboard.addEventListener('pointerout', (event) => { if (event.target.closest('.key-backspace')) stopHold(); });
  keyboard.addEventListener('contextmenu', (event) => event.preventDefault()); // a long press must not open a menu

  area.addEventListener('pointerdown', (event) => change(moveCursor(state, nearestGap(area, event.clientX, event.clientY))));

  parent.append(area, keyboard);
  draw();

  return {
    getText: () => state.text,
    setText(newText) { change(startTyping(newText, limit)); },
    remove() { stopHold(); area.remove(); keyboard.remove(); },
  };
}

/** How much CSS zoom (the tablet rule in styles.css) enlarges `node` on the screen. */
function zoomOf(node) {
  let zoom = 1;
  for (let at = node; at; at = at.parentElement) zoom *= Number(getComputedStyle(at).zoom) || 1;
  return zoom;
}

/**
 * The gap between letters nearest a tap at (x, y): 0 is before the first
 * letter. A tap is in screen pixels; under CSS zoom old Safari measures boxes
 * in un-zoomed pixels and newer browsers in screen pixels, so the tap is
 * scaled to match the boxes (the same sum as `across` in Little Pond).
 */
export function nearestGap(area, x, y) {
  const scale = (zoomOf(area) * area.offsetWidth) / area.getBoundingClientRect().width;
  const tapX = x / scale;
  const tapY = y / scale;
  // Each gap sits at the left edge of the character after it; the end marker is the last gap.
  const gaps = [...area.querySelectorAll('.ch, .end')]
    .map((span, index) => ({ index, box: span.getBoundingClientRect(), breaks: span.textContent === '\n', end: span.classList.contains('end') }))
    .filter(({ box }) => box.height > 0);
  // First the line nearest the tap, then the gap on that line nearest it.
  const lineGap = (box) => Math.max(0, box.top - tapY, tapY - box.bottom);
  const nearestLine = Math.min(...gaps.map(({ box }) => lineGap(box)));
  let best = 0;
  let bestDistance = Infinity;
  for (const { index, box, breaks, end } of gaps) {
    if (lineGap(box) > nearestLine + 1) continue;
    // The right edge of a character is the gap after it (but a new line's right edge is on the next line).
    const edges = breaks || end ? [[box.left, index]] : [[box.left, index], [box.right, index + 1]];
    for (const [edge, gap] of edges) {
      const distance = Math.abs(tapX - edge);
      if (distance < bestDistance) { best = gap; bestDistance = distance; }
    }
  }
  return best;
}

function cursorMark() {
  const mark = make('span', 'cursor');
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}
