// store.js: keeps books on this device. The only file that talks to IndexedDB.
//
// IndexedDB is the browser's own database. Ours is called `tadpole-tales`:
//   books       one record per book (see src/book.js), keyed by its id
//   recordings  one Tell it recording per page: { id: '<book id>/<page id>', bytes, type },
//               the sound as plain bytes (an ArrayBuffer) and its mime type. Never in a backup.
//   settings    { key, value }: author, progress, lastBackup, tellIt (true once a grown-up turns Tell it on)
//
// Saving happens by itself. A screen calls saveSoon(book) after every change;
// the book is saved 1 second after the last change, and at once when the app
// goes to the background. Straight away, a spare copy of that book also goes
// in localStorage, so a save the phone cut off is put back on the next load.
//
// If a save fails, the database is opened again and the save tried once more.
// If that fails too, onSaveState callbacks hear 'not-saved', so the screen can
// show it. Nothing here ever throws away a book it couldn't save.

import { upgradeBook } from './book.js';

const NAME = 'tadpole-tales';
const VERSION = 1;
const SPARE = 'tadpole-tales.spare'; // + '.<book id>'; the bare key is the one spare Phase 1 kept, still read
const WAIT = 1000;      // ms after the last change before saving
const OPEN_WAIT = 5000; // ms to wait for the database to open
const RUN_WAIT = 5000;  // ms to wait for one read or write

const pending = new Map(); // book id -> the newest copy waiting to be saved
let timer; // the saveSoon timer

// ---------- Opening the database ----------

let opening = null; // a promise of the open database, shared by every caller

function open() {
  opening ??= new Promise((resolve, reject) => {
    let late = false;
    // Some Safari versions never answer an open request: give up after a while.
    const timer = setTimeout(() => { late = true; reject(new Error('the database did not open')); }, OPEN_WAIT);
    const request = indexedDB.open(NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('recordings', { keyPath: 'id' }); // made in Phase 1, so Tell it needed no database upgrade
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (late) return db.close(); // opened after we gave up: don't keep a second connection
      db.onclose = forget; // Safari can close the connection while the app is in the background
      // A newer version of the app (in another tab) wants to change the database: let it.
      db.onversionchange = () => { db.close(); forget(); };
      resolve(db);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error); }; // e.g. private mode in some browsers
  });
  // A failed open is not kept, so the next try opens it again.
  opening.catch(forget);
  return opening;
}

/** Drop the connection, so the next call opens a fresh one. */
function forget() {
  opening?.then((db) => db.close()).catch(() => {});
  opening = null;
}

/** Do one thing in one store, and wait until it is safely written (or read), at most RUN_WAIT. */
async function run(storeName, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    // Throws InvalidStateError if Safari closed the connection without saying so.
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    // Safari can leave a transaction with no answer at all: give up, so the queue moves on.
    const timer = setTimeout(() => {
      try { transaction.abort(); } catch { /* already over */ }
      reject(new Error('the database did not answer'));
    }, RUN_WAIT);
    transaction.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
    transaction.onabort = () => { clearTimeout(timer); reject(transaction.error ?? new Error('not saved')); }; // QuotaExceededError lands here
  });
}

/** Try a job; if it fails, open the database again and try once more. */
async function twice(job) {
  try {
    return await job();
  } catch {
    // Safari can lose its database connection in the background
    // ("Connection to Indexed Database server lost"): a fresh one often works.
    forget();
    return job();
  }
}

// Writes go one after another, so an older copy of a book can never be
// written over a newer one (even when the first try had to be retried).
let queue = Promise.resolve();
function inTurn(job) {
  const done = queue.then(() => twice(job));
  queue = done.catch(() => {});
  return done;
}

// ---------- Save state, for the "not saved" mark ----------

let state = 'saved';
const watchers = new Set();
function setState(next) {
  if (next === state) return;
  state = next;
  for (const callback of watchers) callback(state);
}

/** Call `callback('saved' | 'saving' | 'not-saved')` now and on each change. Returns a function that stops it. */
export function onSaveState(callback) {
  watchers.add(callback);
  callback(state);
  return () => watchers.delete(callback);
}

// ---------- The spare copies in localStorage, one per book ----------

/** Every readable spare copy, as [{ key, book }]. */
function readSpares() {
  const spares = [];
  try {
    for (const key of Object.keys(localStorage)) {
      if (key !== SPARE && !key.startsWith(`${SPARE}.`)) continue;
      try { spares.push({ key, book: upgradeBook(JSON.parse(localStorage.getItem(key))) }); } catch { /* unreadable: left as it is */ }
    }
  } catch { /* localStorage is off */ }
  return spares;
}

function writeSpare(book) {
  try { localStorage.setItem(`${SPARE}.${book.id}`, JSON.stringify(book)); } catch { /* full or off: IndexedDB still saves */ }
}

function clearSpare(key) {
  try { localStorage.removeItem(key); } catch { /* off */ }
}

/** Remove the spares of book `id`, or only those no newer than `changed`. */
function dropSpares(id, changed = Infinity) {
  for (const { key, book } of readSpares()) {
    if (book.id === id && book.changed <= changed) clearSpare(key);
  }
}

// ---------- Books ----------

let asked = false;
let saving = 0; // saves under way
const failed = new Set(); // ids of books whose last save failed: the mark stays until each of them saves

function showState() {
  setState(failed.size ? 'not-saved' : saving ? 'saving' : 'saved');
}

/** Save a book now. On failure it reopens the database and tries once more, then rejects. */
export async function saveBook(book) {
  saving++;
  showState();
  try {
    await inTurn(() => run('books', 'readwrite', (books) => books.put(book)));
  } catch (error) {
    saving--;
    failed.add(book.id);
    showState();
    throw error;
  }
  saving--;
  failed.delete(book.id);
  dropSpares(book.id, book.changed);
  showState();
  if (!asked) { asked = true; askToPersist(); }
}

/**
 * Every book, through upgradeBook. Rejects if the books can't be read: the
 * caller must then say so, never show an empty shelf. A record that can't be
 * read as a book stays in the database and is left off the list.
 */
export async function loadBooks() {
  const records = await twice(() => run('books', 'readonly', (books) => books.getAll()));
  const books = [];
  for (const record of records) {
    try { books.push(upgradeBook(record)); } catch { /* kept, not shown */ }
  }
  // A spare copy is newer if the last save of that book didn't finish: put it back.
  for (const { book: spare } of readSpares()) {
    const index = books.findIndex((book) => book.id === spare.id);
    if (index === -1 || spare.changed > books[index].changed) {
      books.splice(index === -1 ? books.length : index, 1, spare);
      await saveBook(spare).catch(() => {}); // if this fails the spare stays for next time
    } else {
      dropSpares(spare.id, books[index].changed);
    }
  }
  return books;
}

/** Delete one book for good, with its recordings (the grown-up page asks first). */
export async function deleteBook(id) {
  pending.delete(id);
  dropSpares(id);
  await deleteRecordings(id); // first: if this fails, the book is still there to delete again
  await inTurn(() => run('books', 'readwrite', (books) => books.delete(id)));
  failed.delete(id); // a deleted book has nothing left to save
  showState();
}

/** Delete every book, recording and setting (the grown-up page asks first). */
export async function startOver() {
  clearTimeout(timer);
  pending.clear();
  for (const { key } of readSpares()) clearSpare(key);
  for (const name of ['recordings', 'books', 'settings']) { // recordings first: a voice is never left behind
    await inTurn(() => run(name, 'readwrite', (store) => store.clear()));
  }
  failed.clear();
  showState();
}

// ---------- Tell it recordings ----------
//
// Kept by book id and page id (not the page's place), so moving a page keeps
// its recording. Ids never hold '/', so '<book id>/' starts only that book's keys.

export const recordingKey = (bookId, pageId) => `${bookId}/${pageId}`;

/** Every key of one book's recordings lies in this range ('0' comes right after '/'). */
export const bookKeys = (bookId) => [`${bookId}/`, `${bookId}0`];

/** Keep a page's recording, in place of the one before. `bytes` is an ArrayBuffer: some iPads lose Blobs kept in IndexedDB. */
export function saveRecording(bookId, pageId, bytes, type) {
  return inTurn(() => run('recordings', 'readwrite', (store) => store.put({ id: recordingKey(bookId, pageId), bytes, type })));
}

/** A page's recording as { bytes, type }, or undefined. Rejects if it can't be read. */
export async function loadRecording(bookId, pageId) {
  const record = await twice(() => run('recordings', 'readonly', (store) => store.get(recordingKey(bookId, pageId))));
  return record && { bytes: record.bytes, type: record.type };
}

/** Delete a book's recordings, except those of the pages in `keep` (page ids): a page removed and not put back loses its recording. */
export function deleteRecordings(bookId, keep = []) {
  const kept = new Set(keep.map((pageId) => recordingKey(bookId, pageId)));
  return inTurn(() => run('recordings', 'readwrite', (store) => {
    const found = store.getAllKeys(IDBKeyRange.bound(...bookKeys(bookId), false, true));
    found.onsuccess = () => found.result.filter((key) => !kept.has(key)).forEach((key) => store.delete(key));
    return found;
  }));
}

// ---------- Settings ----------

/** A setting's value, or undefined if it isn't set. */
export async function getSetting(key) {
  const record = await twice(() => run('settings', 'readonly', (settings) => settings.get(key)));
  return record?.value;
}

export function setSetting(key, value) {
  return inTurn(() => run('settings', 'readwrite', (settings) => settings.put({ key, value })));
}

// ---------- Saving by itself ----------

/** Save `book` 1 second after the last call. Keeps a spare copy at once. */
export function saveSoon(book) {
  pending.set(book.id, book);
  writeSpare(book);
  clearTimeout(timer);
  timer = setTimeout(saveNow, WAIT);
}

/**
 * Save at once whatever is waiting, and wait for any save already under way.
 * Resolves true if everything is saved, false if not (the mark then shows).
 */
export async function saveNow() {
  clearTimeout(timer);
  const books = [...pending.values()];
  pending.clear();
  await Promise.all(books.map(async (book) => {
    try {
      await saveBook(book);
    } catch {
      // Try again on the next change or when the app goes to the background (unless a newer copy is waiting).
      if (!pending.has(book.id)) pending.set(book.id, book);
    }
  }));
  await queue; // a save the timer started has landed too (the queue never rejects)
  return state !== 'not-saved';
}

// The phone can close a home-screen app at any time after it goes to the background.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  addEventListener('pagehide', saveNow);
}

/** Ask the browser not to clear our storage when space is short. Resolves true or false. */
async function askToPersist() {
  try {
    return Boolean(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}
