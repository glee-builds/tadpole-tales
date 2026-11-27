// Tests for src/record.js (Tell it) and the recording keys in src/store.js, with a pretend microphone.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingKey, bookKeys } from '../src/store.js';
import { limit, pickType, isSupported, tellView, start, stop } from '../src/record.js';

/** A pretend microphone and recorder. `tracks` lists every track handed out. */
function fakeDevice({ refuse = false, types = ['audio/webm'] } = {}) {
  const tracks = [];
  let ask;
  const asked = new Promise((resolve) => { ask = resolve; });
  class FakeRecorder {
    static isTypeSupported = (type) => types.includes(type);
    constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType || ''; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['sound'], { type: this.mimeType }) });
        this.onstop();
      });
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          await asked;
          if (refuse) throw new DOMException('no', 'NotAllowedError');
          const track = { stopped: false, stop() { this.stopped = true; } };
          tracks.push(track);
          return { getTracks: () => [track] };
        },
      },
    },
  });
  globalThis.MediaRecorder = FakeRecorder;
  return { tracks, answer: () => ask() };
}

/** Wait for onStop: resolves its argument. */
const stopped = () => {
  let done;
  const promise = new Promise((resolve) => { done = resolve; });
  return { promise, onStop: done };
};

test('a recording is kept by book id and page id, and one book\'s keys never reach another\'s', () => {
  assert.equal(recordingKey('b-1', 'p0'), 'b-1/p0');
  const [low, high] = bookKeys('b-1');
  const inside = (key) => key >= low && key < high;
  assert.ok(inside(recordingKey('b-1', 'p0')));
  assert.ok(inside(recordingKey('b-1', 'zz_9-x')));
  for (const other of ['b-10/p0', 'b-1x/p0', 'b-/p0', 'b-1', 'b-2/p0', 'a/p0']) assert.ok(!inside(other), other);
});

test('the recording type: audio/mp4 on Safari, audio/webm elsewhere, or the browser\'s own', () => {
  assert.equal(pickType((type) => ['audio/mp4', 'audio/webm'].includes(type)), 'audio/mp4');
  assert.equal(pickType((type) => type.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(pickType(() => false), '');
  assert.equal(limit.ms, 120000);
});

test('which buttons show', () => {
  assert.deepEqual(tellView('idle', false), { tell: '🎙 Tell it', hear: null });
  assert.deepEqual(tellView('idle', true), { tell: '🎙 Tell it', hear: '▶ Hear it' });
  assert.deepEqual(tellView('starting', true), { tell: '🎙 Tell it', hear: null });
  assert.deepEqual(tellView('recording', true), { tell: '■ Stop', hear: null });
  assert.deepEqual(tellView('playing', true), { tell: '🎙 Tell it', hear: '■ Stop' });
});

test('Tell it is only possible with both MediaRecorder and getUserMedia', () => {
  fakeDevice();
  assert.equal(isSupported(), true);
  delete globalThis.MediaRecorder;
  assert.equal(isSupported(), false);
  fakeDevice();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  assert.equal(isSupported(), false);
});

test('a tap on Stop: the recording comes back and the microphone is off', async () => {
  const device = fakeDevice({ types: ['audio/mp4'] });
  const done = stopped();
  device.answer();
  assert.equal(await start(done.onStop), true);
  assert.equal(device.tracks[0].stopped, false);
  stop();
  assert.equal(device.tracks[0].stopped, true); // at once, not when the recorder says it has stopped
  const got = await done.promise;
  assert.equal(got.type, 'audio/mp4');
  assert.equal(new TextDecoder().decode(got.bytes), 'sound');
  assert.ok(got.bytes instanceof ArrayBuffer);
});

test('after 2 minutes it stops by itself, and not before', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const device = fakeDevice();
  const done = stopped();
  device.answer();
  await start(done.onStop);
  t.mock.timers.tick(119999);
  assert.equal(device.tracks[0].stopped, false);
  t.mock.timers.tick(1);
  assert.equal(device.tracks[0].stopped, true);
  assert.ok((await done.promise).bytes.byteLength);
});

test('stopped while the microphone question is up: the microphone is let go as soon as it comes', async () => {
  const device = fakeDevice();
  const done = stopped();
  const starting = start(done.onStop);
  stop(); // the writer left the page
  device.answer();
  assert.equal(await starting, false);
  assert.equal(device.tracks[0].stopped, true);
});

test('a second start stops the first recording first', async () => {
  const device = fakeDevice();
  device.answer();
  const first = stopped();
  await start(first.onStop);
  await start(() => {});
  assert.equal(device.tracks[0].stopped, true);
  assert.equal(device.tracks[1].stopped, false);
  await first.promise;
  stop();
  assert.equal(device.tracks[1].stopped, true);
});

test('a refused microphone rejects with NotAllowedError and leaves nothing running', async () => {
  const device = fakeDevice({ refuse: true });
  device.answer();
  await assert.rejects(start(() => assert.fail('onStop must not be called')), { name: 'NotAllowedError' });
  stop(); // nothing to stop: no error
  assert.equal(device.tracks.length, 0);
});
