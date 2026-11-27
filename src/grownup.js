// grownup.js: the grown-up page, opened by holding its button for 2 seconds.
//
// It has a device check (what this phone or iPad can really do), a way to
// delete a book, and "start over". Backup and restore come in task 1.8.
// This is not a writer screen, so a file picker is allowed here later.

import { make, button } from './ui.js';
import { loadBooks, deleteBook, startOver } from './store.js';

// ---------- Install first ----------

// On iOS a browser tab and the home-screen app keep separate storage, and
// Safari can clear a tab's storage after a week without use.
export const INSTALL_NOTE = 'Add to Home Screen to keep books safe.';
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- The hold button ----------

/**
 * Call `onOpen` once `target` has been held for `ms`, so a writer's quick
 * taps never land on the grown-up page. (Copied from Little Pond.)
 */
export function holdToOpen(target, onOpen, ms = 2000) {
  let timer;
  const stop = () => {
    clearTimeout(timer);
    target.classList.remove('holding');
  };
  target.addEventListener('pointerdown', () => {
    target.classList.add('holding');
    timer = setTimeout(() => { stop(); onOpen(); }, ms);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(type, stop);
  target.addEventListener('contextmenu', (event) => event.preventDefault()); // a long press must not open a menu
  // A keyboard or screen-reader press (no pointer) opens it right away.
  target.addEventListener('click', (event) => { if (event.detail === 0) onOpen(); });
}

// ---------- The device check ----------

const SENTENCE = 'The little frog sat on a log and sang a song to the moon.';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const answer = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

let recording = null; // the last 3-second recording, for "Play it back"

async function saveCheck() {
  const name = 'tadpole-tales-check'; // a throwaway database, never the books
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore('check');
  const db = await answer(opening);
  try {
    const write = db.transaction('check', 'readwrite');
    write.objectStore('check').put('a frog on a log', 'test');
    await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onabort = () => reject(write.error); });
    const back = await answer(db.transaction('check').objectStore('check').get('test'));
    return back === 'a frog on a log'
      ? { ok: true, detail: 'saved a record and read it back' }
      : { ok: false, detail: 'read back something different' };
  } finally {
    db.close();
    indexedDB.deleteDatabase(name);
  }
}

async function persistCheck() {
  if (!navigator.storage?.persist) return { ok: false, detail: 'this browser can\'t ask to keep its storage' };
  return await navigator.storage.persist()
    ? { ok: true, detail: 'granted: the browser won\'t clear the books to free space' }
    : { ok: false, detail: 'not granted: the browser may clear the books when space is short' };
}

function homeScreenCheck() {
  return isInstalled()
    ? { ok: true, detail: 'running from the Home Screen' }
    : { ok: false, detail: `running in a browser tab. ${INSTALL_NOTE}` };
}

// Speaks a sentence and counts the word timings ("boundary" events) that
// will light up each word as it is read. Must start inside the tap.
function speakCheck() {
  if (!('speechSynthesis' in window)) return { ok: false, detail: 'no speech on this device' };
  return new Promise((resolve) => {
    let words = 0;
    let other = 0;
    let done = false;
    const finish = (problem) => {
      if (done) return;
      done = true;
      if (problem) resolve({ ok: false, detail: `didn't speak (${problem})` });
      else if (words) resolve({ ok: true, detail: `spoke, with ${words} word timings` });
      else resolve({ ok: false, detail: `spoke, but gave no word timings (${other} other timings), so words can't light up` });
    };
    const line = new SpeechSynthesisUtterance(SENTENCE);
    line.lang = 'en-US';
    line.onboundary = (event) => { if (event.name === 'word') words++; else other++; };
    line.onend = () => finish();
    line.onerror = (event) => finish(event.error || 'error');
    setTimeout(() => { speechSynthesis.cancel(); finish('no answer in 15 seconds'); }, 15000);
    speechSynthesis.cancel();
    speechSynthesis.speak(line);
  });
}

async function recordCheck() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return { ok: false, detail: 'this browser can\'t record sound' };
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    .filter((type) => MediaRecorder.isTypeSupported?.(type));
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    return { ok: false, detail: error.name === 'NotAllowedError' ? 'the microphone is not allowed' : `no microphone (${error.name})` };
  }
  try {
    const recorder = new MediaRecorder(stream, types[0] ? { mimeType: types[0] } : {});
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    await sleep(3000);
    recorder.stop();
    await stopped;
    recording = new Blob(chunks, { type: recorder.mimeType });
    const kinds = `can record: ${types.join(', ') || 'none named'}`;
    return recording.size
      ? { ok: true, detail: `recorded 3 seconds as ${recording.type || 'an unnamed type'} (${Math.ceil(recording.size / 1024)} KB); ${kinds}` }
      : { ok: false, detail: `the recording was empty; ${kinds}` };
  } finally {
    stream.getTracks().forEach((track) => track.stop()); // never leave the microphone on
  }
}

async function playCheck() {
  if (!recording?.size) return { ok: false, detail: 'record first, then tap this' };
  const url = URL.createObjectURL(recording);
  const audio = new Audio(url);
  try {
    const ended = new Promise((resolve) => { audio.onended = () => resolve(true); setTimeout(() => resolve(false), 6000); });
    await audio.play(); // starts inside the tap: phones block sound that isn't
    return await ended ? { ok: true, detail: 'played the recording to the end' } : { ok: false, detail: 'started playing but didn\'t finish' };
  } finally {
    audio.pause();
    URL.revokeObjectURL(url);
  }
}

function shareCheck() {
  const file = new File(['x'], 'x.json', { type: 'application/json' });
  if (!navigator.canShare) return { ok: false, detail: 'no share sheet: backups will download instead' };
  return navigator.canShare({ files: [file] })
    ? { ok: true, detail: 'the share sheet can save a backup file' }
    : { ok: false, detail: 'the share sheet can\'t take files: backups will download instead' };
}

const browserCheck = () => ({ ok: true, detail: navigator.userAgent });

/** Every check. Each one is started by its own tap, since sound and the microphone need one. */
export const DEVICE_CHECKS = [
  { name: 'Save and reread', run: saveCheck },
  { name: 'Keep storage', run: persistCheck },
  { name: 'Home Screen', run: homeScreenCheck },
  { name: 'Read aloud', run: speakCheck },
  { name: 'Record 3 seconds', run: recordCheck },
  { name: 'Play it back', run: playCheck },
  { name: 'Save a file', run: shareCheck },
  { name: 'Browser', run: browserCheck },
];

/** Run one check: resolves { name, ok, detail } and never rejects. */
export async function runCheck({ name, run }) {
  try {
    // run() starts before the first await, so it is still inside the tap.
    const result = await Promise.race([run(), sleep(30000).then(() => ({ ok: false, detail: 'no answer in 30 seconds' }))]);
    return { name, ...result };
  } catch (error) {
    return { name, ok: false, detail: `${error?.name || 'Error'}: ${error?.message || 'failed'}` };
  }
}

// ---------- The page ----------

/** A button that asks a second time before doing something that can't be undone. */
export function askFirst(label, question, yesLabel, onYes, extras = []) {
  const box = make('div', 'gu-ask');
  const ask = make('div', 'gu-confirm');
  const start = button('plain-button', label, () => { start.hidden = true; ask.hidden = false; });
  ask.hidden = true;
  ask.append(
    make('p', '', question),
    ...extras,
    button('plain-button', 'Cancel', () => { ask.hidden = true; start.hidden = false; }),
    button('plain-button gu-danger', yesLabel, () => { ask.hidden = true; start.hidden = false; onYes(); }),
  );
  box.append(start, ask);
  return box;
}

const shortDate = (time) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** The book's first words, so a grown-up can tell which book it is. */
function bookName(book) {
  const words = (book.title || book.pages.map((page) => page.text).join(' ')).replace(/\s+/g, ' ').trim();
  return words ? (words.length > 40 ? `${words.slice(0, 40)}…` : words) : 'A book with no words yet';
}

/** Draw the grown-up page into `root`. `onBack` leaves it. */
export function showGrownup(root, { onBack }) {
  root.replaceChildren();
  const top = root.appendChild(make('div', 'screen-top'));
  const back = top.appendChild(button('back', '←', onBack));
  back.setAttribute('aria-label', 'Back');
  top.append(make('h1', '', 'For grown-ups'));

  // Install first.
  const keep = make('p', 'gu-note', 'Books are kept only on this device. Removing the app\'s icon from the Home Screen deletes its books.');
  if (!isInstalled()) root.append(make('p', 'gu-note gu-warn', `⚠ ${INSTALL_NOTE}`));
  root.append(keep);

  // The device check.
  root.append(make('h2', '', 'Device check'), make('p', 'gu-note', 'Tap each check. Sound and the microphone need a tap to start.'));
  const results = new Map();
  const copyText = make('pre', 'gu-copy');
  const drawCopy = () => {
    copyText.textContent = DEVICE_CHECKS
      .map(({ name }) => results.get(name))
      .filter(Boolean)
      .map(({ name, ok, detail }) => `${ok ? '✓' : '✗'} ${name}: ${detail}`)
      .join('\n') || 'No checks run yet.';
  };
  const list = root.appendChild(make('ul', 'gu-checks'));
  for (const check of DEVICE_CHECKS) {
    const row = list.appendChild(make('li', 'gu-check'));
    const result = make('span', 'gu-result', 'not checked yet');
    const go = button('plain-button', check.name, async () => {
      go.disabled = true;
      result.textContent = '… checking';
      const found = await runCheck(check);
      results.set(check.name, found);
      result.textContent = `${found.ok ? '✓' : '✗'} ${found.detail}`;
      result.className = `gu-result ${found.ok ? 'gu-yes' : 'gu-no'}`;
      go.disabled = false;
      drawCopy();
    });
    row.append(go, result);
  }
  const copied = make('p', 'gu-note');
  copied.setAttribute('role', 'status');
  const copy = button('plain-button', 'Copy results', async () => {
    try {
      await navigator.clipboard.writeText(copyText.textContent);
      copied.textContent = '✓ Copied.';
    } catch {
      copied.textContent = 'Couldn\'t copy. Press and hold the text above to copy it.';
    }
  });
  drawCopy();
  root.append(copyText, copy, copied);

  // Delete a book.
  root.append(make('h2', '', 'Books'));
  const shelf = root.appendChild(make('ul', 'gu-books'));
  const said = make('p', 'gu-note');
  said.setAttribute('role', 'status');
  root.append(said);
  async function drawBooks() {
    let books;
    try {
      books = await loadBooks();
    } catch {
      shelf.replaceChildren(make('li', 'gu-warn', '⚠ Couldn\'t open the books on this device.'));
      return;
    }
    books.sort((a, b) => b.changed - a.changed);
    shelf.replaceChildren(...books.map((book) => {
      const row = make('li', 'gu-book');
      row.append(
        make('span', '', `${bookName(book)} · ${book.pages.length} page${book.pages.length === 1 ? '' : 's'} · ${shortDate(book.changed)}`),
        askFirst('Delete…', 'Delete this book? It can\'t be undone.', 'Yes, delete', async () => {
          try {
            await deleteBook(book.id);
            said.textContent = '✓ The book was deleted.';
          } catch {
            said.textContent = '⚠ The book couldn\'t be deleted. Try again.';
          }
          drawBooks();
        }),
      );
      return row;
    }));
    if (!books.length) shelf.append(make('li', '', 'No books yet.'));
  }
  drawBooks();

  // Start over.
  root.append(make('h2', '', 'Start over'));
  root.append(askFirst(
    'Start over…',
    'This deletes every book and setting on this device. It can\'t be undone.',
    'Yes, delete everything',
    async () => {
      try {
        await startOver();
        said.textContent = '✓ Everything was deleted.';
      } catch {
        said.textContent = '⚠ Couldn\'t delete everything. Try again.';
      }
      drawBooks();
    },
  ));
}
