// grownup.js: the grown-up page, opened by holding its button for 2 seconds.
//
// It has a device check (what this phone or iPad can really do), the Tell it
// switch, backup and restore, a way to delete a book, and "start over". This is not a writer
// screen, so the file picker for restoring is allowed here (and only here).

import { make, button, plural } from './ui.js';
import { loadBooks, saveBook, deleteBook, startOver, getSetting, setSetting } from './store.js';
import { makeBackup, backupName, readBackup, mergeBooks, isNewer, bookTitle, BACKUP_LIMIT } from './book.js';
import { isSupported as canRecord } from './record.js';

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
  const start = button('pill plain-button', label, () => { start.hidden = true; ask.hidden = false; });
  ask.hidden = true;
  ask.append(
    make('p', '', question),
    ...extras,
    button('pill plain-button', 'Cancel', () => { ask.hidden = true; start.hidden = false; }),
    button('pill plain-button gu-danger', yesLabel, () => { ask.hidden = true; start.hidden = false; onYes(); }),
  );
  box.append(start, ask);
  return box;
}

const shortDate = (time) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** Draw the grown-up page into `root`. `onBack` leaves it. */
export function showGrownup(root, { onBack }) {
  root.replaceChildren();
  const top = root.appendChild(make('div', 'screen-top'));
  const back = top.appendChild(button('back', '←', onBack));
  back.setAttribute('aria-label', 'Back');
  top.append(make('h1', '', 'For grown-ups'));

  // Install first.
  if (!isInstalled()) root.append(make('p', 'gu-note gu-warn', `⚠ ${INSTALL_NOTE}`));
  root.append(make('p', 'gu-note', 'Books are kept only on this device. Removing the app\'s icon from the Home Screen deletes its books.'));

  drawDeviceCheck(root);
  const tellIt = drawTellIt(root);
  const backup = drawBackup(root, () => books.draw());
  const books = drawBooks(root, backup.setFile);

  // Start over.
  root.append(make('h2', '', 'Start over'));
  root.append(askFirst(
    'Start over…',
    'This deletes every book and setting on this device. It can\'t be undone.',
    'Yes, delete everything',
    async () => {
      try {
        await startOver();
        books.said.textContent = '✓ Everything was deleted.';
      } catch {
        books.said.textContent = '⚠ Couldn\'t delete everything. Try again.';
      }
      books.draw();
      tellIt.read(); // start over turns Tell it off
    },
    [button('pill plain-button', 'Back up first', backup.backUp)],
  ));
}

/** The device check: one button per check, and a block of results to copy. */
function drawDeviceCheck(root) {
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
    const go = button('pill plain-button', check.name, async () => {
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
  const copy = button('pill plain-button', 'Copy results', async () => {
    try {
      await navigator.clipboard.writeText(copyText.textContent);
      copied.textContent = '✓ Copied.';
    } catch {
      copied.textContent = 'Couldn\'t copy. Press and hold the text above to copy it.';
    }
  });
  drawCopy();
  root.append(copyText, copy, copied);
}

/** The Tell it switch: off until a grown-up turns it on, and always off on a device that can't record. Returns { read }, which shows the saved setting again. */
function drawTellIt(root) {
  root.append(
    make('h2', '', 'Tell it'),
    make('p', 'gu-note', 'Recordings stay on this device. They are not in backups.'),
  );
  let on = false;
  const toggle = button('pill plain-button gu-switch', '', async () => {
    toggle.disabled = true;
    try {
      await setSetting('tellIt', !on);
      on = !on;
      said.textContent = '';
    } catch {
      said.textContent = '⚠ Couldn\'t change it. Try again.';
    }
    draw();
  });
  toggle.setAttribute('role', 'switch');
  const said = make('p', 'gu-note');
  said.setAttribute('role', 'status');
  const draw = () => {
    toggle.textContent = `Tell it (record your voice): ${on ? 'On' : 'Off'}`;
    toggle.setAttribute('aria-checked', String(on));
    toggle.disabled = !canRecord();
  };
  const read = () => { if (canRecord()) getSetting('tellIt').then((value) => { on = value === true; draw(); }, () => {}); };
  draw();
  read();
  if (!canRecord()) said.textContent = 'This device can\'t record sound, so Tell it stays off.';
  root.append(toggle, said);
  return { read };
}

/**
 * Back up and restore. `onRestored` runs after a restore (the book list draws
 * again). Returns { backUp, setFile }: the shelf's books are made into a file
 * ahead of time (setFile), so the share sheet opens inside the tap (iOS needs that).
 */
function drawBackup(root, onRestored) {
  root.append(
    make('h2', '', 'Back up and restore'),
    make('p', 'gu-note', 'A backup is one file with every book. Save it somewhere safe, such as Files or iCloud Drive. Restoring only adds books that aren\'t on the shelf; it never changes or removes one.'),
  );
  const last = root.appendChild(make('p', 'gu-note'));
  const showLast = (when) => { last.textContent = when ? `Last backup: ${shortDate(when)}` : 'No backup yet.'; };
  getSetting('lastBackup').then(showLast, () => showLast());
  let file = null;
  const backUp = async () => {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else download(file);
    } catch (error) {
      if (error.name === 'AbortError') { said.textContent = 'The backup was not saved.'; return; } // the share sheet was closed
      download(file); // the share sheet refused: download instead
    }
    const when = new Date().toISOString();
    await setSetting('lastBackup', when).catch(() => {});
    showLast(when);
    said.textContent = `✓ Backup made: ${file.name}`;
  };
  const backupButton = button('pill plain-button', 'Back up all books', backUp);
  backupButton.disabled = true;
  // The file picker sits inside a label, so a tap opens it without help from script.
  const pick = make('label', 'pill plain-button gu-pick', 'Restore from a file…');
  const chooser = pick.appendChild(make('input'));
  chooser.type = 'file';
  chooser.accept = '.json,application/json';
  chooser.addEventListener('change', async () => {
    const chosen = chooser.files[0];
    chooser.value = ''; // so the same file can be picked again
    if (!chosen) return;
    said.textContent = '… restoring';
    said.textContent = await restore(chosen);
    onRestored();
  });
  const said = make('p', 'gu-note');
  said.setAttribute('role', 'status');
  root.append(backupButton, pick, said);
  return {
    backUp,
    setFile(next) { file = next; backupButton.disabled = !file; },
  };
}

/**
 * The books, each with a Delete button. Returns { draw, said }: `draw()` lists
 * the books again, `said` is the line that tells how a delete went.
 * `onFile(file)` gets the backup file made from the books each time.
 */
function drawBooks(root, onFile) {
  root.append(make('h2', '', 'Books'));
  const shelf = root.appendChild(make('ul', 'gu-books'));
  const said = root.appendChild(make('p', 'gu-note'));
  said.setAttribute('role', 'status');
  async function draw() {
    let books;
    try {
      books = await loadBooks();
    } catch {
      shelf.replaceChildren(make('li', 'gu-warn', '⚠ Couldn\'t open the books on this device.'));
      return;
    }
    onFile(await backupFile(books).catch(() => null));
    books.sort((a, b) => b.changed - a.changed);
    shelf.replaceChildren(...books.map((book) => {
      const row = make('li', 'gu-book');
      row.append(
        make('span', '', isNewer(book) ? 'A book made with a newer version of the app' : `${bookTitle(book, 40) || 'A book with no words yet'} · ${plural(book.pages.length, 'page')} · ${shortDate(book.changed)}`),
        askFirst('Delete…', 'Delete this book? It can\'t be undone.', 'Yes, delete', async () => {
          try {
            await deleteBook(book.id);
            said.textContent = '✓ The book was deleted.';
          } catch {
            said.textContent = '⚠ The book couldn\'t be deleted. Try again.';
          }
          draw();
        }),
      );
      return row;
    }));
    if (!books.length) shelf.append(make('li', '', 'No books yet.'));
  }
  draw();
  return { draw, said };
}

/** Every book and setting a backup holds, as a file ready to share. */
async function backupFile(books) {
  const now = Date.now();
  const backup = makeBackup({ books, author: await getSetting('author'), progress: await getSetting('progress') }, now);
  return new File([JSON.stringify(backup)], backupName(now), { type: 'application/json' });
}

/** Save `file` with the browser's download, where there is no share sheet. */
function download(file) {
  const url = URL.createObjectURL(file);
  const link = make('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); // the browser reads the file after click() returns
}

/** Add the books in a backup file that aren't on the shelf. Resolves a sentence saying what happened. */
async function restore(chosen) {
  let found;
  try {
    // Read no more than a backup can be, so a huge file can't use up the iPad's memory (readBackup turns it away).
    found = readBackup(await chosen.slice(0, BACKUP_LIMIT + 1).text());
  } catch (error) {
    return `⚠ ${error.message} Nothing was changed.`;
  }
  let shelf;
  try {
    shelf = await loadBooks();
  } catch {
    return '⚠ Couldn\'t open the books on this device, so nothing was restored.';
  }
  const { add, skipped } = mergeBooks(shelf, found.books);
  // Each book is saved on its own: one that won't save is counted, and the rest are still added.
  let added = 0;
  let unreadable = found.unreadable;
  for (const book of add) {
    try {
      await saveBook(book);
      added++;
    } catch {
      unreadable++;
    }
  }
  let settingsSaved = true;
  try {
    // The name and lesson progress come back only if this device has none.
    if (found.author && !(await getSetting('author'))) await setSetting('author', found.author);
    if (Object.keys(found.progress).length && !(await getSetting('progress'))) await setSetting('progress', found.progress);
  } catch {
    settingsSaved = false;
  }
  return [
    `${added || !add.length ? '✓' : '⚠'} Added ${plural(added, 'book')}.`,
    skipped ? `${plural(skipped, 'book')} already on the shelf ${skipped === 1 ? 'was' : 'were'} left as ${skipped === 1 ? 'it was' : 'they were'}.` : '',
    unreadable ? `${plural(unreadable, 'book')} in the file couldn't be read.` : '',
    settingsSaved ? '' : 'The name couldn\'t be restored. Try again: books already added are skipped.',
  ].filter(Boolean).join(' ');
}
