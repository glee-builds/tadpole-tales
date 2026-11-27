// store.js: keeps books on this device. The only file that talks to IndexedDB.
//
// IndexedDB is the browser's own database. Ours is called `tadpole-tales`:
//   books       one record per book (see src/book.js), keyed by its id
//   recordings  empty until Phase 4
//   settings    { key, value }: author, progress, lastBackup, tellIt
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
const SPARE = 'tadpole-tales.spare';
const WAIT = 1000;      // ms after the last change before saving
const OPEN_WAIT = 5000; // ms to wait for the database to open

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
      db.createObjectStore('recordings', { keyPath: 'id' });
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

/** Do one thing in one store, and wait until it is safely written (or read). */
async function run(storeName, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    // Throws InvalidStateError if Safari closed the connection without saying so.
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('not saved')); // QuotaExceededError lands here
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

// ---------- The spare copy in localStorage ----------

function readSpare() {
  try {
    return upgradeBook(JSON.parse(localStorage.getItem(SPARE)));
  } catch {
    return null; // none, unreadable, or localStorage is off
  }
}

function writeSpare(book) {
  try { localStorage.setItem(SPARE, JSON.stringify(book)); } catch { /* full or off: IndexedDB still saves */ }
}

/** Remove the spare if it is this book and no newer than `book`. */
function dropSpare(book) {
  const spare = readSpare();
  if (spare && spare.id === book.id && spare.changed <= book.changed) {
    try { localStorage.removeItem(SPARE); } catch { /* off */ }
  }
}

// ---------- Books ----------

let asked = false;
let saving = 0; // saves under way

/** Save a book now. On failure it reopens the database and tries once more, then rejects. */
export async function saveBook(book) {
  saving++;
  setState('saving');
  try {
    await inTurn(() => run('books', 'readwrite', (books) => books.put(book)));
  } catch (error) {
    saving--;
    setState('not-saved');
    throw error;
  }
  saving--;
  dropSpare(book);
  if (!saving) setState('saved');
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
  // The spare copy is newer if the last save didn't finish: put it back.
  const spare = readSpare();
  if (spare) {
    const index = books.findIndex((book) => book.id === spare.id);
    if (index === -1 || spare.changed > books[index].changed) {
      books.splice(index === -1 ? books.length : index, 1, spare);
      await saveBook(spare).catch(() => {}); // if this fails the spare stays for next time
    } else {
      dropSpare(books[index]);
    }
  }
  return books;
}

/** Delete one book for good (the grown-up page asks first). */
export async function deleteBook(id) {
  if (pending?.id === id) pending = null;
  if (readSpare()?.id === id) { try { localStorage.removeItem(SPARE); } catch { /* off */ } }
  await inTurn(() => run('books', 'readwrite', (books) => books.delete(id)));
}

/** Delete every book, recording and setting (the grown-up page asks first). */
export async function startOver() {
  clearTimeout(timer);
  pending = null;
  try { localStorage.removeItem(SPARE); } catch { /* off */ }
  for (const name of ['books', 'recordings', 'settings']) {
    await inTurn(() => run(name, 'readwrite', (store) => store.clear()));
  }
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

let pending = null; // the book waiting to be saved
let timer;

/** Save `book` 1 second after the last call. Keeps a spare copy at once. */
export function saveSoon(book) {
  if (pending && pending.id !== book.id) saveNow(); // another book is waiting: save it first
  pending = book;
  writeSpare(book);
  clearTimeout(timer);
  timer = setTimeout(saveNow, WAIT);
}

/** Save at once whatever is waiting. */
export async function saveNow() {
  clearTimeout(timer);
  const book = pending;
  if (!book) return;
  pending = null;
  try {
    await saveBook(book);
  } catch {
    pending ??= book; // try again on the next change or when the app goes to the background
  }
}

// The phone can close a home-screen app at any time after it goes to the background.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  addEventListener('pagehide', saveNow);
}

/** Ask the browser not to clear our storage when space is short. Resolves true or false. */
export async function askToPersist() {
  try {
    return Boolean(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}
