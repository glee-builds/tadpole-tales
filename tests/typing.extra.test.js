// More tests for src/typing.js: long runs of random key presses, and edge cases.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMIT, startTyping, typeKey, backspace, toggleShift, moveCursor, newLine } from '../src/typing.js';

/** A small seeded random number generator (mulberry32), so a failing run can be repeated. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [...'abcdefghijklmnopqrstuvwxyz', ' ', '.', ',', '!', '?', "'", '"'];

/** Make `steps` random key presses from `seed`, checking the rules after each one. */
function pressRandomly(seed, steps, limit) {
  const rand = seeded(seed);
  let state = startTyping('', limit);
  for (let i = 0; i < steps; i++) {
    const roll = rand();
    if (roll < 0.6) state = typeKey(state, KEYS[Math.floor(rand() * KEYS.length)]);
    else if (roll < 0.7) state = newLine(state);
    else if (roll < 0.85) state = backspace(state);
    else if (roll < 0.9) state = toggleShift(state);
    else state = moveCursor(state, Math.floor(rand() * (state.text.length + 6)) - 3);

    const where = `seed ${seed}, step ${i}`;
    assert.ok(Number.isInteger(state.cursor), `cursor is a whole number (${where})`);
    assert.ok(state.cursor >= 0 && state.cursor <= state.text.length, `cursor inside the text (${where})`);
    assert.ok(state.text.length <= limit, `text within the limit (${where})`);
    assert.equal(typeof state.shift, 'boolean', `shift is on or off (${where})`);
  }
  return state;
}

test('long random key presses never leave the cursor outside the text or go over the limit', () => {
  for (let seed = 1; seed <= 20; seed++) pressRandomly(seed, 2000, LIMIT);
});

test('random presses with a small limit keep hitting the full state and stay inside it', () => {
  for (let seed = 1; seed <= 50; seed++) pressRandomly(seed, 500, 7);
});

test('the same seed always gives the same text (so a failure can be repeated)', () => {
  const first = pressRandomly(42, 1000, LIMIT);
  const again = pressRandomly(42, 1000, LIMIT);
  assert.deepEqual(first, again);
});

test('a new line, then delete it: the text and cursor are back where they were', () => {
  const before = startTyping('ab');
  const after = backspace(newLine(before));
  assert.deepEqual([after.text, after.cursor], ['ab', 2]);
});

test('delete across a line break joins the two lines', () => {
  const state = moveCursor(startTyping('one\ntwo'), 4); // cursor at the start of "two"
  const next = backspace(state);
  assert.deepEqual([next.text, next.cursor], ['onetwo', 3]);
});

test('typing after a line break puts letters on the new line', () => {
  const state = typeKey(typeKey(newLine(startTyping('hi')), 'y'), 'o');
  assert.deepEqual([state.text, state.cursor], ['hi\nyo', 5]);
});

test('shift then a punctuation key: the mark is kept, shift is used up, the next letter is small', () => {
  let state = typeKey(toggleShift(startTyping('stop')), '.');
  assert.deepEqual([state.text, state.shift], ['stop.', false]);
  state = typeKey(state, 'x');
  assert.deepEqual([state.text, state.shift], ['stop.x', false]);
});

test('shift then a question mark, then a capital after it', () => {
  let state = typeKey(toggleShift(startTyping('ok')), '?');
  state = typeKey(toggleShift(state), 'y');
  assert.deepEqual([state.text, state.shift], ['ok?Y', false]);
});

test('shift on the last place before the limit makes that last letter capital, then full', () => {
  const state = typeKey(toggleShift(startTyping('x'.repeat(LIMIT - 1))), 'a');
  assert.equal(state.text.slice(-1), 'A');
  assert.equal(state.text.length, LIMIT);
  assert.equal(state.shift, false);
});

test('backspace deletes an emoji from a restored page whole, never half of it', () => {
  const state = backspace(startTyping('a😀'));
  assert.equal(state.text, 'a');
  assert.equal(state.cursor, 1);
});
