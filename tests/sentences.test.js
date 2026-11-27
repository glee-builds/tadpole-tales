// Tests for src/sentences.js. Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences } from '../src/sentences.js';

const texts = (text) => splitSentences(text).map((s) => s.text);

test('ends at . ! ? and keeps the mark', () => {
  assert.deepEqual(texts('Pip hops. Pip jumps! Where is Pip?'), ['Pip hops.', 'Pip jumps!', 'Where is Pip?']);
});

test('runs of marks are one end', () => {
  assert.deepEqual(texts('What?! No way... Yes!!!'), ['What?!', 'No way...', 'Yes!!!']);
});

test('a closing quote right after the mark stays with the sentence', () => {
  assert.deepEqual(texts('"Hi!" said Pip.'), ['"Hi!"', 'said Pip.']);
  assert.deepEqual(texts('Pip said "no." Then left.'), ['Pip said "no."', 'Then left.']);
});

test('no punctuation at all is one sentence', () => {
  assert.deepEqual(splitSentences('pip went to the pond'), [{ start: 0, end: 20, text: 'pip went to the pond' }]);
});

test('a new line ends a sentence even with no punctuation', () => {
  assert.deepEqual(texts('one\ntwo\r\nthree.'), ['one', 'two', 'three.']);
});

test('only new lines, only spaces, or nothing gives no sentences', () => {
  assert.deepEqual(splitSentences('\n\n\n'), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(undefined), []);
});

test('spaces at either side are not part of a sentence, and offsets point into the original', () => {
  const text = '  Hi there   \n  Bye.   ';
  const found = splitSentences(text);
  assert.deepEqual(found.map((s) => s.text), ['Hi there', 'Bye.']);
  for (const s of found) assert.equal(text.slice(s.start, s.end), s.text);
  assert.equal(found[0].start, 2);
});

test('marks with no words are their own piece, and no piece is empty', () => {
  assert.deepEqual(texts('...'), ['...']);
  assert.deepEqual(texts('Hm. ?'), ['Hm.', '?']);
  assert.ok(splitSentences('a. . b').every((s) => s.text.length > 0));
});

test("the writer's spelling is untouched", () => {
  assert.deepEqual(texts('the frogg lyks wotter. ok'), ['the frogg lyks wotter.', 'ok']);
});

test('300 characters: offsets are exact, in order, and nothing but spaces is left out', () => {
  const text = 'Pip is a tadpole! Pip swims. '.repeat(11).slice(0, 300);
  assert.equal(text.length, 300);
  const found = splitSentences(text);
  let at = 0;
  for (const s of found) {
    assert.equal(text.slice(s.start, s.end), s.text);
    assert.equal(text.slice(at, s.start).trim(), ''); // only spaces between sentences
    at = s.end;
  }
  assert.equal(text.slice(at).trim(), '');
});
