// Tests for src/typing.js: the text and the cursor.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, startTyping, typeKey, backspace, toggleShift, moveCursor, newLine, isFull } from '../src/typing.js';

/** Type every character of `chars` in turn. */
const typeAll = (state, chars) => [...chars].reduce(typeKey, state);

test('a new state is empty, cursor at 0, no shift, limit 300', () => {
  assert.deepEqual(startTyping(), { text: '', cursor: 0, shift: false, limit: 300 });
  assert.equal(LIMIT, 300);
});

test('starting with text puts the cursor at the end', () => {
  assert.deepEqual(startTyping('hi'), { text: 'hi', cursor: 2, shift: false, limit: 300 });
  assert.equal(startTyping('hi', 10).limit, 10);
});

test('typing adds letters at the cursor and moves it on', () => {
  const state = typeAll(startTyping(), 'a frog');
  assert.equal(state.text, 'a frog');
  assert.equal(state.cursor, 6);
});

test('typing with the cursor in the middle puts the letter there', () => {
  let state = moveCursor(startTyping('the dog'), 4);
  state = typeAll(state, 'big ');
  assert.equal(state.text, 'the big dog');
  assert.equal(state.cursor, 8);
});

test('typing at the very start', () => {
  const state = typeKey(moveCursor(startTyping('og'), 0), 'd');
  assert.deepEqual([state.text, state.cursor], ['dog', 1]);
});

test('backspace at the start does nothing', () => {
  const before = moveCursor(startTyping('cat'), 0);
  assert.equal(backspace(before), before);
  assert.equal(backspace(startTyping()).text, '');
});

test('backspace deletes the character before the cursor, in the middle too', () => {
  assert.deepEqual(pick(backspace(startTyping('cat'))), ['ca', 2]);
  assert.deepEqual(pick(backspace(moveCursor(startTyping('cart'), 3))), ['cat', 2]);
  assert.deepEqual(pick(backspace(moveCursor(startTyping('xcat'), 1))), ['cat', 0]);
});
const pick = (state) => [state.text, state.cursor];

test('backspace many times past the start stops at empty', () => {
  let state = startTyping('ab');
  for (let i = 0; i < 5; i++) state = backspace(state);
  assert.deepEqual(pick(state), ['', 0]);
});

test('shift makes the next letter capital, then turns off', () => {
  const state = typeAll(toggleShift(startTyping()), 'dot');
  assert.equal(state.text, 'Dot');
  assert.equal(state.shift, false);
});

test('shift twice turns it back off', () => {
  assert.equal(typeKey(toggleShift(toggleShift(startTyping())), 'a').text, 'a');
});

test('shift is used up by a space or punctuation, which stay the same', () => {
  let state = typeKey(toggleShift(startTyping()), ' ');
  assert.equal(state.shift, false);
  state = typeKey(toggleShift(state), '!');
  assert.deepEqual([state.text, state.shift], [' !', false]);
  state = newLine(toggleShift(state));
  assert.deepEqual([state.text, state.shift], [' !\n', false]);
});

test('shift then backspace: the letter goes, shift stays for the next letter', () => {
  let state = backspace(toggleShift(startTyping('dox')));
  assert.deepEqual([state.text, state.shift], ['do', true]);
  state = typeKey(state, 'g');
  assert.deepEqual([state.text, state.shift], ['doG', false]);
});

test('moving the cursor keeps shift on', () => {
  const state = typeKey(moveCursor(toggleShift(startTyping('ot')), 0), 'd');
  assert.equal(state.text, 'Dot');
});

test('moveCursor stays between 0 and the end of the text', () => {
  const state = startTyping('abc');
  assert.equal(moveCursor(state, -5).cursor, 0);
  assert.equal(moveCursor(state, 99).cursor, 3);
  assert.equal(moveCursor(state, 1.6).cursor, 2);
  assert.equal(moveCursor(state, NaN).cursor, 0);
});

test('a new line is one character and counts toward the limit', () => {
  const state = newLine(startTyping('a', 3));
  assert.deepEqual(pick(state), ['a\n', 2]);
  assert.equal(isFull(newLine(state)), true);
});

test('at the limit nothing more is typed, shift stays on', () => {
  const full = startTyping('x'.repeat(LIMIT));
  assert.equal(isFull(full), true);
  assert.equal(typeKey(full, 'y'), full);
  assert.equal(newLine(full), full);
  const shifted = toggleShift(full);
  assert.equal(typeKey(shifted, 'y').shift, true);
});

test('typing up to the limit stops exactly at it, with the cursor in the middle too', () => {
  let state = typeAll(startTyping('', 5), 'abcdefgh');
  assert.equal(state.text, 'abcde');
  state = typeAll(moveCursor(backspace(state), 1), 'XYZ');
  assert.deepEqual(pick(state), ['aXbcd', 2]);
});

test('delete one at the limit, then one more letter fits', () => {
  const state = typeKey(backspace(startTyping('x'.repeat(LIMIT))), '!');
  assert.equal(state.text.length, LIMIT);
  assert.ok(state.text.endsWith('!'));
});

test('text over the limit is kept whole; only deleting works until it is under', () => {
  let state = startTyping('abcdef', 4);
  assert.equal(state.text, 'abcdef');
  assert.equal(typeKey(state, 'g'), state);
  state = backspace(backspace(backspace(state)));
  assert.equal(typeKey(state, 'z').text, 'abcz');
});

test('functions never change the state passed in', () => {
  const before = startTyping('hello');
  const copy = { ...before };
  typeKey(before, 'x');
  backspace(before);
  toggleShift(before);
  moveCursor(before, 0);
  newLine(before);
  assert.deepEqual(before, copy);
});
