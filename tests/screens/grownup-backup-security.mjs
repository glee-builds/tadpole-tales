// grownup-backup-security.mjs: saving and the "not saved" mark, the grown-up page, backup and restore,
// damaged books, the test server's lock, and the app opening offline.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  send, page, errors, evaluate, waitFor, until, origin, PHONE, problems, checkWith, stopServer,
  settle, HOME, open, touch, holdUntil, middleOf,
  press, tapOn, STORE, BREAK, MEND, spareKeys,
  savedTexts, MARK_SHOWS, markShows, saveNow,
} from './lib.mjs';

/** Open the home screen with no books, then the keyboard demo. */
async function freshDemo() {
  if (!await open('', HOME)) throw new Error('home did not draw');
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  const go = await middleOf('.go');
  await touch(go.x, go.y);
  await waitFor('document.querySelector(".keyboard") !== null', 3);
}

/** Save through the keyboard, reload, and find the book; break saving and see the mark. Returns a problem, or ''. */
export async function trySaving() {
  // Type, wait for the save, reload: the book is there.
  await freshDemo();
  await press('f', 'r', 'o', 'g');
  // The page keeps a spare copy of the words until the database has them: the 1-second save is done when the spare is gone.
  if (!await waitFor(`!Object.keys(localStorage).some((key) => key.startsWith('tadpole-tales.spare'))`, 5)) return 'the words were not saved a few seconds after typing';
  if (await markShows()) return 'the "not saved" mark shows after a good save';
  await open('', HOME);
  if (JSON.stringify(await savedTexts()) !== '["frog"]') return `after a reload the saved books are ${JSON.stringify(await savedTexts())}, not ["frog"]`;

  // Reload straight after typing, before the 1-second wait: still kept.
  await freshDemo();
  await press('p', 'o', 'n', 'd');
  await open('', HOME);
  if (JSON.stringify(await savedTexts()) !== '["pond"]') return `reloading at once kept ${JSON.stringify(await savedTexts())}, not ["pond"]`;

  // Every save fails: the mark shows, the spare copy holds the words, and the next load puts them back.
  await freshDemo();
  await evaluate(BREAK);
  await press('l', 'o', 'g');
  if (!await waitFor(MARK_SHOWS, 5)) return 'the "not saved" mark did not show when saving failed';
  if (!await markShows()) return 'the "not saved" mark did not show when saving failed';
  if (!(await evaluate(`Object.keys(localStorage).filter((key) => key.startsWith('tadpole-tales.spare')).map((key) => localStorage.getItem(key)).join()`)).includes('"log"')) return 'no spare copy in localStorage after a failed save';
  await open('', HOME); // a fresh page: saving works again
  if (JSON.stringify(await savedTexts()) !== '["log"]') return `the spare copy was not put back: ${JSON.stringify(await savedTexts())}`;
  if ((await spareKeys()).length) return 'the spare copy stayed after it was saved';

  // Book A fails to save, then the writer types in book B: both are kept for the next load.
  await evaluate(`(async () => { ${STORE} await store.startOver(); ${BREAK}
    store.saveSoon(book.setPageText(book.newBook('made-up-a', 1), 0, 'ant', 1));
    await store.saveNow();
    store.saveSoon(book.setPageText(book.newBook('made-up-b', 2), 0, 'bee', 2));
    await store.saveNow(); })()`);
  await open('', HOME);
  if (JSON.stringify((await savedTexts()).sort()) !== '["ant","bee"]') return `after A then B failed to save, the next load found ${JSON.stringify(await savedTexts())}, not ["ant","bee"]`;
  if ((await spareKeys()).length) return `spare copies stayed after both books saved: ${await spareKeys()}`;

  // saveNow waits for a save already under way, and says whether it worked.
  const inFlight = await evaluate(`(async () => {
    ${STORE}
    let heard;
    const stop = store.onSaveState((state) => { heard = state; });
    store.saveSoon(book.setPageText(book.newBook('made-up-fly', 1), 0, 'fly', 1));
    store.saveNow(); // the 1-second timer's save, under way
    const good = await store.saveNow(); // Refresh's save must wait for it
    if (heard !== 'saved' || good !== true) { stop(); return 'saveNow returned while a save was under way (' + heard + ', ' + good + ')'; }
    ${BREAK}
    store.saveSoon(book.setPageText(book.newBook('made-up-fly', 1), 0, 'flew', 2));
    store.saveNow();
    const bad = await store.saveNow();
    ${MEND}
    stop();
    return heard === 'not-saved' && bad === false ? '' : 'saveNow did not report a failed save under way (' + heard + ', ' + bad + ')';
  })()`);
  if (inFlight) return inFlight;

  // One failure (Safari closed the connection): the save reopens and works.
  const retried = await evaluate(`(async () => {
    ${STORE}
    let fails = 1;
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (fails-- > 0) throw new DOMException('test: connection lost', 'InvalidStateError');
      return real.apply(this, args);
    };
    try { await store.saveBook(book.newBook('retry-test', 1)); } catch { return 'saveBook gave up after one failure'; }
    finally { IDBDatabase.prototype.transaction = real; }
    return (await store.loadBooks()).some((b) => b.id === 'retry-test') ? '' : 'the retried save is not in the database';
  })()`);
  if (retried) return retried;

  // A full disk: saveBook rejects and says "not-saved".
  const full = await evaluate(`(async () => {
    ${STORE}
    const real = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('test: disk full', 'QuotaExceededError'); };
    let heard;
    const stop = store.onSaveState((state) => { heard = state; });
    try { await store.saveBook(book.newBook('full-test', 1)); return 'saveBook did not reject on a full disk'; }
    catch { return heard === 'not-saved' ? '' : 'a full disk did not report not-saved'; }
    finally { IDBObjectStore.prototype.put = real; stop(); }
  })()`);
  if (full) return full;

  // The books can't be read: loadBooks rejects (never an empty list).
  const unread = await evaluate(`(async () => {
    ${STORE} ${BREAK}
    try { await store.loadBooks(); return 'loadBooks gave a list when the database could not be read'; }
    catch { return ''; }
    finally { ${MEND} }
  })()`);
  return unread;
}


const grownupOpen = 'location.hash === "#grown-ups" && !document.querySelector(".grownups").hidden';

/** A tap doesn't open the grown-up page, a 2-second hold does; every check reports; delete and start over ask first. */
export async function tryGrownup() {
  if (!await open('', 'document.querySelector(".hold-button") !== null')) return 'home did not draw';
  await evaluate(`(async () => { ${STORE} await store.startOver();
    await store.saveBook(book.setPageText(book.newBook('made-up-1', 1), 0, 'A duck found a hat.', 1));
    await store.saveBook(book.setPageText(book.newBook('made-up-2', 2), 0, 'The moon fell in the pond.', 2)); })()`);
  if (!await evaluate(`document.querySelector('.install-note').textContent.includes('Home Screen')`)) return 'no "Add to Home Screen" note in a browser tab';

  await tapOn('.hold-button', 0, 300); // a short tap: the finger stays down 300ms, well under the 2 seconds it takes
  if (await evaluate(grownupOpen)) return 'a short tap opened the grown-up page';
  const hold = await middleOf('.hold-button');
  if (!await holdUntil(hold.x, hold.y, grownupOpen)) return 'holding for 2 seconds did not open the grown-up page';
  const wide = await evaluate('document.documentElement.scrollWidth - innerWidth');
  if (wide > 0) return `the grown-up page is ${wide}px wider than the screen`;

  // Every check, each started by its own tap, gives an answer (headless Chrome has no microphone or voice).
  const count = await evaluate('document.querySelectorAll(".gu-check button").length');
  if (count !== 8) return `${count} device checks, not 8`;
  for (let n = 0; n < count; n++) {
    await tapOn('.gu-check button', n);
    if (!await waitFor(`/^[✓✗]/.test(document.querySelectorAll('.gu-result')[${n}].textContent)`, 35)) {
      return `check ${n + 1} gave no answer: "${await evaluate(`document.querySelectorAll('.gu-result')[${n}].textContent`)}"`;
    }
  }
  const lines = await evaluate(`document.querySelector('.gu-copy').textContent.split('\\n').length`);
  if (lines !== 8) return `the results to copy have ${lines} lines, not 8`;
  if (!await evaluate(`document.querySelector('.gu-copy').textContent.includes('✓ Save and reread')`)) return 'save and reread did not pass';

  // Delete one book: it asks first, then only that book goes.
  if (!await waitFor(`document.querySelectorAll('.gu-book').length === 2`)) return 'the page does not list the 2 books';
  await tapOn('.gu-book .plain-button');
  if (await evaluate(`document.querySelectorAll('.gu-book').length`) !== 2) return 'Delete did not ask first';
  await tapOn('.gu-book .gu-danger');
  if (!await waitFor(`document.querySelectorAll('.gu-book').length === 1`)) return 'Yes, delete did not delete the book';
  if (JSON.stringify(await savedTexts()) !== '["A duck found a hat."]') return `the wrong book was deleted: ${JSON.stringify(await savedTexts())}`;

  // Start over: asks first, then the shelf is empty.
  await tapOn('.grownups > .gu-ask .plain-button');
  await tapOn('.grownups > .gu-ask .gu-danger');
  if (!await waitFor(`document.querySelector('.gu-books').textContent === 'No books yet.'`)) return 'start over left books on the page';
  if ((await savedTexts()).length) return 'start over left books in the database';

  await tapOn('.grownups .back');
  if (!await waitFor('location.hash === "" && !document.querySelector(".shelf").hidden', 2)) return 'Back did not go to the bookshelf';
  return '';
}


const downloads = mkdtempSync(join(tmpdir(), 'tadpole-tales-downloads-'));

/** Pick `path` in the grown-up page's restore file picker, and wait for what it says. */
async function restoreFrom(path) {
  const { result } = await page('Runtime.evaluate', { expression: `document.querySelector('.gu-pick input')` });
  await page('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
  await waitFor(`/^[✓⚠]/.test(document.querySelector('.gu-pick + .gu-note').textContent)`, 5);
  return evaluate(`document.querySelector('.gu-pick + .gu-note').textContent`);
}

/** Back up two books, start over, restore them, restore again, and try a broken file. Returns a problem, or ''. */
export async function tryBackup() {
  if (!await open('', 'document.querySelector(".hold-button") !== null')) return 'home did not draw';
  await evaluate(`(async () => { ${STORE} await store.startOver();
    await store.saveBook(book.setPageText(book.newBook('made-up-3', 3), 0, 'A snail raced a leaf.', 3));
    await store.saveBook(book.setPageText(book.newBook('made-up-4', 4), 0, 'Two fish had a party.', 4));
    await store.setSetting('author', 'Pip'); })()`);
  await evaluate(`location.hash = 'grown-ups'`);
  if (!await waitFor(`[...document.querySelectorAll('.grownups button')].some((b) => b.textContent === 'Back up all books' && !b.disabled)`)) return 'the Back up button never became ready';
  if (!await evaluate(`document.querySelector('.grownups').textContent.includes('No backup yet.')`)) return 'the page does not say there is no backup yet';

  // Headless Chrome has no share sheet on every computer: use the download, as an older iPad would.
  await evaluate(`navigator.canShare = undefined`);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  const backupIndex = await evaluate(`[...document.querySelectorAll('.grownups button')].findIndex((b) => b.textContent === 'Back up all books')`);
  await tapOn('.grownups button', backupIndex);
  const name = await until(() => readdirSync(downloads).find((file) => file.endsWith('.json')));
  if (!name) return 'Back up did not save a file';
  if (!/^tadpole-tales-backup-\d{4}-\d\d-\d\d\.json$/.test(name)) return `the backup is called ${name}`;
  if (!await waitFor(`document.querySelector('.grownups').textContent.includes('Last backup:')`)) return 'the page does not show the date of the last backup';
  const file = join(downloads, name);

  // Start over (it offers a backup first), then restore: both books come back, with the name.
  await tapOn('.grownups > .gu-ask .plain-button');
  if (!await evaluate(`[...document.querySelectorAll('.grownups > .gu-ask button')].some((b) => b.textContent === 'Back up first')`)) return 'start over does not offer a backup first';
  await tapOn('.grownups > .gu-ask .gu-danger');
  if (!await waitFor(`document.querySelector('.gu-books').textContent === 'No books yet.'`)) return 'start over did not empty the shelf';
  let said = await restoreFrom(file);
  if (!said.startsWith('✓ Added 2 books.')) return `restoring said "${said}"`;
  const texts = (await savedTexts()).sort();
  if (JSON.stringify(texts) !== '["A snail raced a leaf.","Two fish had a party."]') return `after restoring the books are ${JSON.stringify(texts)}`;
  if (await evaluate(`(async () => { ${STORE} return store.getSetting('author'); })()`) !== 'Pip') return 'the name did not come back';

  // Restoring the same file again adds nothing.
  said = await restoreFrom(file);
  if (!said.startsWith('✓ Added 0 books. 2 books already on the shelf')) return `restoring twice said "${said}"`;
  if ((await savedTexts()).length !== 2) return `restoring twice left ${(await savedTexts()).length} books`;

  // A cut-short file is turned away and changes nothing.
  const broken = join(downloads, 'broken.json');
  writeFileSync(broken, readFileSync(file, 'utf8').slice(0, 40));
  said = await restoreFrom(broken);
  if (!said.startsWith('⚠ This file is damaged')) return `a broken file said "${said}"`;
  if ((await savedTexts()).length !== 2) return 'a broken file changed the shelf';

  // One book won't save (the database turns it away): it is counted, and the books after it are still added.
  const three = join(downloads, 'three.json');
  const make = (id, text) => ({ format: 1, id, created: 1, changed: 1, finished: false, title: '', cover: null, pages: [{ text, stickers: [] }] });
  writeFileSync(three, JSON.stringify({ app: 'tadpole-tales', backup: 1, books: [make('made-up-5', 'One.'), make('made-up-fail', 'Two.'), make('made-up-6', 'Three.')] }));
  await evaluate(`IDBObjectStore.prototype.realPut ??= IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...rest) {
      if (value?.id === 'made-up-fail') throw new DOMException('test: will not save', 'DataError');
      return IDBObjectStore.prototype.realPut.call(this, value, ...rest);
    };`);
  said = await restoreFrom(three);
  await evaluate(`IDBObjectStore.prototype.put = IDBObjectStore.prototype.realPut;`);
  if (!said.startsWith('✓ Added 2 books.') || !said.includes('1 book in the file couldn\'t be read')) return `a book that would not save said "${said}"`;
  if ((await savedTexts()).length !== 4) return `after one book would not save the shelf has ${(await savedTexts()).length} books, not 4`;
  return '';
}

/** Damaged books on the device: the good book still shows, and nothing logs an error. Returns a problem, or ''. */
export async function tryHostile() {
  if (!await open('', HOME)) return 'home did not draw';
  const good = { format: 1, id: 'made-up-good', created: 1, changed: 2, finished: false, title: 'Good book', cover: null, pages: [{ text: 'hello', stickers: [] }] };
  const bad = [
    { ...good, id: 7 },
    { ...good, id: 'made-up-t1', pages: [{ text: 123, stickers: 'abc' }] },
    { ...good, id: 'made-up-c1', finished: true, cover: { stickers: [null, { id: 'frog', x: 'oops', y: 0.5, size: 1 }] } },
    { ...good, id: 'h1"><img src=x onerror=window.__xss=1>', title: '<img src=x onerror=window.__xss=1>' },
  ];
  // Written straight into the database, past saveBook, as a damaged record would be.
  await evaluate(`(async () => { ${STORE} await store.startOver(); await store.saveBook(${JSON.stringify(good)});
    const db = await new Promise((resolve) => { const r = indexedDB.open('tadpole-tales'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('books', 'readwrite');
    for (const record of ${JSON.stringify(bad)}) tx.objectStore('books').put(record);
    await new Promise((resolve) => { tx.oncomplete = resolve; }); db.close(); })()`);
  if (!await open('', 'document.querySelectorAll(".book-card").length >= 1')) return 'the shelf drew no books';
  const titles = await evaluate(`[...document.querySelectorAll('.book-card .cover-title')].map((node) => node.textContent).sort().join('|')`);
  if (!titles.includes('Good book')) return `the good book is not on the shelf: ${titles}`;
  for (const address of ['#book/made-up-t1/0', '#read/made-up-c1', '#grown-ups']) {
    if (!await open(address, 'document.querySelector(".keyboard, .read-page, .gu-book") !== null')) return `${address} did not draw`;
    await settle();
    if (errors.length) return `${address}: ${errors[0]}`;
  }
  if (await evaluate('window.__xss === 1 || document.querySelector("img[src=x]") !== null')) return 'a title or id became HTML';
  return '';
}

/** The test server only hands out the app's own files, never one from outside the repo. Returns a problem, or ''. */
export async function tryServerLock() {
  for (const path of ['/..%2f..%2f..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/src/..%2f..%2f..%2fetc/passwd']) {
    const { status } = await fetch(`${origin}${path}`);
    if (status !== 403 && status !== 404) return `${path} answered ${status}`;
  }
  return '';
}

/** Save a book, let the service worker keep every file, stop the server, and open the app and the book anyway. */
export async function checkOffline() {
  await page('Emulation.setDeviceMetricsOverride', { ...PHONE, deviceScaleFactor: 2, mobile: true });
  await open('', 'document.querySelector("h1") !== null');
  await evaluate(`(async () => { ${STORE} await store.startOver();
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-offline-1', 1000), 0, 'The frog sat still.', 1000), finished: true, title: 'Offline Frog' }); })()`);
  const kept = await waitFor(`(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    return names.length > 0 && (await (await caches.open(names[0])).keys()).length >= 20;
  })()`, 10);
  if (!kept) problems.push('Offline: the service worker did not keep the app\'s files');
  await stopServer();
  await checkWith('Offline: the shelf and a saved book open with the server off', async () => {
    // The writer's one book (Tadpole's example books may show too, if the lesson files were saved).
    if (!await open('', 'document.querySelectorAll(".book-card:not(.example-card)").length === 1')) return 'the shelf did not draw offline';
    await tapOn('.book-card:not(.example-card)');
    if (!await waitFor(`document.querySelector('.read-page')?.textContent === 'The frog sat still.'`, 3)) return 'the saved book did not open offline';
    return '';
  });
}

/** Remove the folder the backup check downloads into. */
export const removeDownloads = () => rmSync(downloads, { recursive: true, force: true });
