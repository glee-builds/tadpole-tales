// typing.js: the writer's text and the cursor, as plain functions (no screen).
//
// A typing state is { text, cursor, shift, limit }. `cursor` is the gap the
// next letter goes into: 0 is before the first letter, text.length after the
// last. Every function returns a new state and never changes the one passed in.
//
// The app's keyboard sends one plain character per key (letters, space,
// new line, . , ! ? ' "), never emoji, so text.length is the character count.
// Restored text could still hold an emoji (two UTF-16 units): `cursor` counts
// UTF-16 units, keyboard.js only puts it between whole characters, and
// backspace deletes a whole emoji.

export const LIMIT = 300; // about five short sentences: one page fits one screen

/** A new state with the cursor at the end. Text over the limit is kept whole, never cut. */
export function startTyping(text = '', limit = LIMIT) {
  return { text, cursor: text.length, shift: false, limit };
}

export const isFull = (state) => state.text.length >= state.limit;

/** Put `char` at the cursor. Shift makes a letter capital and is used up by any character. */
export function typeKey(state, char) {
  if (isFull(state)) return state; // shift stays on, ready for after a delete
  const added = state.shift ? char.toUpperCase() : char;
  const text = state.text.slice(0, state.cursor) + added + state.text.slice(state.cursor);
  return { ...state, text, cursor: state.cursor + 1, shift: false };
}

export const newLine = (state) => typeKey(state, '\n');

/** Delete the character before the cursor. Shift is left as it is. */
export function backspace(state) {
  if (state.cursor === 0) return state;
  // An emoji in restored text is two UTF-16 units: delete both.
  const size = /[\uDC00-\uDFFF]/.test(state.text[state.cursor - 1]) && /[\uD800-\uDBFF]/.test(state.text[state.cursor - 2] ?? '') ? 2 : 1;
  const text = state.text.slice(0, state.cursor - size) + state.text.slice(state.cursor);
  return { ...state, text, cursor: state.cursor - size };
}

export const toggleShift = (state) => ({ ...state, shift: !state.shift });

/** Move the cursor to gap `index`, kept between 0 and the end of the text. */
export function moveCursor(state, index) {
  const cursor = Math.max(0, Math.min(state.text.length, Math.round(index) || 0));
  return { ...state, cursor };
}
