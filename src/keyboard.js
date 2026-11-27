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

import { make, button, tapScale } from './ui.js';
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

  // One span per character, so a tap can measure where each one is. `gaps[i]`
  // is the cursor (in UTF-16 units, as typing.js counts) before span i, so an
  // emoji in restored text is one span and the cursor never lands inside it.
  let gaps = [];
  function draw() {
    area.textContent = '';
    gaps = [];
    let at = 0;
    let drawn = false;
    for (const char of state.text) {
      if (!drawn && at >= state.cursor) { area.append(cursorMark()); drawn = true; }
      gaps.push(at);
      area.append(make('span', 'ch', char));
      at += char.length;
    }
    gaps.push(at);
    if (!drawn) area.append(cursorMark());
    area.append(make('span', 'end', '\u200b')); // marks where an empty last line sits
    area.querySelector('.cursor').scrollIntoView({ block: 'nearest' });
    keyboard.classList.toggle('shifted', state.shift);
    shiftKey.setAttribute('aria-pressed', String(state.shift));
  }

  function press(key) {
    if (key === 'backspace') change(backspace(state));
    else if (key === 'shift') change(toggleShift(state));
    else if (key === 'space') change(typeKey(state, ' '));
    else if (key === 'enter') change(newLine(state));
    else change(typeKey(state, key));
  }

  // Keys act on touch-down: when two fast touches overlap, iOS often sends no
  // click, and letters were lost. The click that follows a touch is skipped;
  // a click with no touch before it (Enter or Space on a focused key, or a
  // screen reader) still presses the key.
  const pressed = new Set(); // keys a touch went down on, each until its click (touches overlap, so clicks can come in any order)
  let holding;
  const stopHold = () => clearTimeout(holding);
  keyboard.addEventListener('pointerdown', (event) => {
    const node = event.target.closest('[data-key]');
    if (!node || event.button > 0) return;
    pressed.add(node);
    event.preventDefault(); // no mouse events, focus or text selection from the touch
    press(node.dataset.key);
    if (node.dataset.key !== 'backspace') return;
    // Backspace keeps deleting while held.
    const repeat = () => { press('backspace'); holding = setTimeout(repeat, HOLD_EVERY); };
    stopHold();
    holding = setTimeout(repeat, HOLD_WAIT);
  });
  keyboard.addEventListener('click', (event) => {
    const node = event.target.closest('[data-key]');
    if (!node) return;
    if (pressed.delete(node)) return; // already pressed on touch-down
    press(node.dataset.key);
  });
  keyboard.addEventListener('keydown', () => pressed.clear()); // a key press is never the end of a touch
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) keyboard.addEventListener(type, stopHold);
  // A finger sliding off the backspace key also stops it.
  keyboard.addEventListener('pointerout', (event) => { if (event.target.closest('.key-backspace')) stopHold(); });
  keyboard.addEventListener('contextmenu', (event) => event.preventDefault()); // a long press must not open a menu

  area.addEventListener('pointerdown', (event) => change(moveCursor(state, gaps[nearestGap(area, event.clientX, event.clientY)])));

  parent.append(area, keyboard);
  draw();

  return {
    getText: () => state.text,
    setText(newText) { change(startTyping(newText, limit)); },
    remove() { stopHold(); area.remove(); keyboard.remove(); },
  };
}

/**
 * The gap between letters nearest a tap at (x, y): 0 is before the first
 * letter. A tap is in screen pixels, so it is scaled to match the boxes (tapScale).
 */
export function nearestGap(area, x, y) {
  const scale = tapScale(area);
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
