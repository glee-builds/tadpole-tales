// record.js: Tell it. The writer tells a page out loud, then hears it back while typing.
//
// One recording per page, up to 2 minutes; it stops quietly by itself (no
// countdown). Recordings stay on this device (store.js keeps them as plain
// bytes, by book id and page id) and are never in the backup file. No
// speech-to-text: the sound never leaves the device.
//
// The microphone is turned off (every track stopped) the moment recording
// stops: by a tap, by the 2-minute limit, when the app is hidden, or when the
// writer leaves the page. Tell it shows only after a grown-up turns it on
// (the grown-up page), and never on a device that can't record.

import { make, button } from './ui.js';
import { getSetting, saveRecording, loadRecording } from './store.js';

/** The longest recording. An object, so a screen check can shorten it. */
export const limit = { ms: 2 * 60 * 1000 };

// Safari records audio/mp4; most other browsers audio/webm.
const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

/** The first type this browser can record, or '' to let it choose. */
export const pickType = (canRecord) => TYPES.find((type) => canRecord(type)) || '';

/** True if this device can record: MediaRecorder (Safari 14.3 and later) and getUserMedia. */
export const isSupported = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);

/** Show Tell it? Only when a grown-up turned it on and this device can record. */
export async function tellItOn() {
  if (!isSupported()) return false;
  try { return await getSetting('tellIt') === true; } catch { return false; }
}

// ---------- Recording ----------

let active = null; // the recording under way (or asking for the microphone): { end }

/**
 * Start recording. Resolves true once recording, or false if stop() came
 * while the microphone was being asked for. Rejects with the browser's error
 * (NotAllowedError when the microphone is refused). When it stops, for any
 * reason, `onStop({ bytes, type })` is called once (with null if nothing was recorded).
 */
export async function start(onStop) {
  stop();
  let stream = null;
  let recorder = null;
  let timer;
  let ended = false;
  const me = {
    end() {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (active === me) active = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop(); // its last sound comes in onstop
      stream?.getTracks().forEach((track) => track.stop()); // the microphone is off now, not when onstop comes
    },
  };
  active = me;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    me.end();
    throw error;
  }
  if (ended) { // stopped while the question was up: let the microphone go at once
    stream.getTracks().forEach((track) => track.stop());
    return false;
  }
  try {
    const mimeType = pickType((type) => MediaRecorder.isTypeSupported?.(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      me.end(); // stopped by itself (the microphone was taken away): still let it go
      const sound = new Blob(chunks, { type: recorder.mimeType || mimeType });
      onStop(sound.size ? { bytes: await sound.arrayBuffer(), type: sound.type } : null);
    };
    recorder.start();
    timer = setTimeout(me.end, limit.ms);
  } catch (error) {
    me.end();
    throw error;
  }
  return true;
}

/** Stop recording (if it is) and turn the microphone off. Safe to call at any time. */
export function stop() {
  active?.end();
}

// ---------- Playing ----------

let playing = null; // { audio, finish }

/** Play a recording with an <audio> from a Blob URL (revoked when it ends or stops). `onEnd` is called once. Call it inside a tap. */
export function play({ bytes, type }, onEnd) {
  stopPlaying();
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const audio = new Audio(url);
  const finish = () => {
    if (playing?.audio !== audio) return;
    playing = null;
    audio.pause();
    URL.revokeObjectURL(url);
    onEnd();
  };
  playing = { audio, finish };
  audio.onended = finish;
  audio.onerror = finish;
  audio.play().catch(finish);
}

export function stopPlaying() {
  playing?.finish();
}

// The app was hidden (another app, the Home Screen, the lock button): stop at once.
if (typeof document !== 'undefined') {
  const quiet = () => { stop(); stopPlaying(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') quiet(); });
  addEventListener('pagehide', quiet);
}

// ---------- The Tell it buttons on the page screen ----------

/**
 * What the buttons say. `state` is 'idle', 'starting' (asking for the
 * microphone), 'recording' or 'playing'; `has` is true when the page has a recording.
 * `hear` is null when "Hear it" is hidden.
 */
export function tellView(state, has) {
  return {
    tell: state === 'recording' ? '■ Stop' : '🎙 Tell it',
    hear: !has || state === 'recording' || state === 'starting' ? null : state === 'playing' ? '■ Stop' : '▶ Hear it',
  };
}

const REFUSED = ['NotAllowedError', 'SecurityError'];

/**
 * Put the Tell it row in `parent`, for one page. `onSaved` is called after a
 * recording is saved. Returns { remove }, which also stops the microphone and the sound.
 */
export function mountTellIt(parent, { bookId, pageId, onSaved }) {
  const bar = parent.appendChild(make('div', 'tell-bar'));
  const tell = bar.appendChild(button('pill tell-button', '', toggleRecording));
  const hear = bar.appendChild(button('pill tell-hear', '', togglePlaying));
  const note = bar.appendChild(make('p', 'tell-note'));
  note.setAttribute('role', 'status');
  let state = 'idle';
  let sound = null; // this page's recording, { bytes, type }, kept here so "Hear it" can play inside the tap

  function draw() {
    const view = tellView(state, Boolean(sound));
    tell.textContent = view.tell;
    tell.disabled = state === 'starting';
    tell.setAttribute('aria-label', state === 'recording' ? 'Stop recording' : 'Tell it: record this page out loud');
    hear.hidden = !view.hear;
    hear.textContent = view.hear || '';
    hear.setAttribute('aria-label', state === 'playing' ? 'Stop playing' : 'Hear it: play the recording');
    bar.classList.toggle('tell-recording', state === 'recording');
  }
  const say = (words) => { note.textContent = words; };

  loadRecording(bookId, pageId).then((found) => {
    if (found && !sound) { sound = found; draw(); }
  }, () => { /* can't read it: there is just no "Hear it" */ });

  async function toggleRecording() {
    if (state === 'recording') { stop(); return; }
    stopPlaying();
    state = 'starting';
    say('');
    draw();
    try {
      const started = await start(async (got) => {
        state = 'idle';
        say('');
        if (got) sound = got; // a new recording replaces the old one
        draw();
        if (!got) return;
        try {
          await saveRecording(bookId, pageId, got.bytes, got.type);
          onSaved?.();
        } catch {
          say('⚠ The recording was not saved.');
        }
      });
      if (started) {
        state = 'recording';
        say('● Recording');
      }
    } catch (error) {
      state = 'idle';
      say(REFUSED.includes(error?.name)
        ? '🎙 The microphone is off. A grown-up can allow it in Settings.'
        : '🎙 Recording didn\'t work on this device.');
    }
    if (state === 'starting') state = 'idle';
    draw();
  }

  function togglePlaying() {
    if (state === 'playing') { stopPlaying(); return; }
    if (!sound) return;
    state = 'playing';
    draw();
    play(sound, () => { state = 'idle'; draw(); });
  }

  draw();
  return {
    remove() {
      stop();
      stopPlaying();
      bar.remove();
    },
  };
}
