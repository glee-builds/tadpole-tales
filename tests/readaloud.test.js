// Tests for src/readaloud.js. Nothing here makes a sound: the speaker is a fake.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueOf, wordSpan, readAloud } from '../src/readaloud.js';

test('queueOf lists every sentence with its page, skipping empty pages and marks with no letters', () => {
  const q = queueOf(['Hi. Bye!', '', '...\nok', 'x']);
  assert.deepEqual(q.map((s) => [s.pageIndex, s.text]), [[0, 'Hi.'], [0, 'Bye!'], [2, 'ok'], [3, 'x']]);
  assert.deepEqual(queueOf([]), []);
});

test('queueOf keeps offsets into each page, as written', () => {
  const pages = ['the frogg  lyks wotter. ok'];
  for (const s of queueOf(pages)) assert.equal(pages[s.pageIndex].slice(s.start, s.end), s.text);
});

test('wordSpan maps a boundary into the page text', () => {
  const sentence = { start: 10, end: 21, text: 'Pip can hop' };
  assert.deepEqual(wordSpan(sentence, 4, 3), { start: 14, end: 17 });
  assert.deepEqual(wordSpan(sentence, 0, 3), { start: 10, end: 13 });
});

test('wordSpan with no length runs to the next space, or the end', () => {
  const sentence = { start: 0, end: 11, text: 'Pip can hop' };
  assert.deepEqual(wordSpan(sentence, 4), { start: 4, end: 7 });
  assert.deepEqual(wordSpan(sentence, 8), { start: 8, end: 11 });
});

test('wordSpan never goes past the sentence, and ignores bad positions', () => {
  const sentence = { start: 0, end: 3, text: 'Pip' };
  assert.deepEqual(wordSpan(sentence, 1, 50), { start: 1, end: 3 });
  for (const bad of [-1, 3, 99, undefined, NaN, 1.5]) assert.equal(wordSpan(sentence, bad, 1), null);
});

// A fake speechSynthesis: speak() records the utterance; the test plays events by hand.
function fakeDevice({ voices, hidden = false } = {}) {
  const spoken = [];
  const listeners = {};
  const synth = {
    cancels: 0,
    getVoices: () => voices ?? [{ name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'Samantha' }],
    cancel() { this.cancels++; },
    speak: (u) => spoken.push(u),
  };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.window = {
    speechSynthesis: synth,
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: (n) => { delete listeners[n]; },
  };
  globalThis.document = {
    hidden,
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: (n) => { delete listeners[n]; },
  };
  return { spoken, synth, listeners };
}

test('speaks one sentence at a time and calls onDone after the last', () => {
  const { spoken } = fakeDevice();
  const log = [];
  readAloud(['Hi. Bye.', 'Last one'], {
    onSentence: (page, s) => log.push(`s${page}:${s.text}`),
    onDone: () => log.push('done'),
  });
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, 'Hi.');
  spoken[0].onend();
  assert.equal(spoken.length, 2);
  spoken[1].onend();
  spoken[2].onend();
  assert.deepEqual(spoken.map((u) => u.text), ['Hi.', 'Bye.', 'Last one']);
  assert.deepEqual(log, ['s0:Hi.', 's0:Bye.', 's1:Last one', 'done']);
});

test('onWord is called only for word boundaries', () => {
  const { spoken } = fakeDevice();
  const words = [];
  readAloud(['Pip can hop.'], { onWord: (p, a, b) => words.push([p, a, b]) });
  spoken[0].onboundary({ name: 'sentence', charIndex: 0 });
  assert.deepEqual(words, []);
  spoken[0].onboundary({ name: 'word', charIndex: 4, charLength: 3 });
  assert.deepEqual(words, [[0, 4, 7]]);
});

test('stop() cancels, speaks nothing more, and does not call onDone', () => {
  const { spoken, synth, listeners } = fakeDevice();
  let done = false;
  const stop = readAloud(['One. Two.'], { onDone: () => { done = true; } });
  const before = synth.cancels;
  stop();
  assert.equal(synth.cancels, before + 1);
  spoken[0].onend();
  assert.equal(spoken.length, 1);
  assert.equal(done, false);
  assert.deepEqual(Object.keys(listeners), []); // listeners removed
  stop(); // a second call does nothing
  assert.equal(synth.cancels, before + 1);
});

test('the page being hidden stops reading and calls onDone once', () => {
  const { spoken, listeners } = fakeDevice();
  let done = 0;
  readAloud(['One. Two.'], { onDone: () => done++ });
  listeners.visibilitychange(); // still visible: nothing
  assert.equal(done, 0);
  document.hidden = true;
  listeners.visibilitychange();
  assert.equal(done, 1);
  spoken[0].onend();
  assert.equal(spoken.length, 1);
});

test('with no on-device voice it says nothing and finishes at once', () => {
  const { spoken } = fakeDevice({ voices: [{ name: 'Online', lang: 'en-US', localService: false }] });
  let done = false;
  const stop = readAloud(['Hello.'], { onDone: () => { done = true; } });
  assert.equal(spoken.length, 0);
  assert.equal(done, true);
  stop();
});

test('with no speech support it says nothing and finishes at once', () => {
  delete globalThis.window;
  let done = false;
  readAloud(['Hello.'], { onDone: () => { done = true; } });
  assert.equal(done, true);
});
