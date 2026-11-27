// screens.mjs: open the app in a real browser and check it draws and works.
//
// It starts the app, opens the home screen at a phone size and at two iPad
// sizes, and fails if the page doesn't draw, logs an error, scrolls sideways,
// or asks for anything from another site.
//
// Run it with:  node tests/screens.mjs
// It needs Google Chrome (GitHub's test computers have it) and nothing else.
// It is not a *.test.js file, so "node --test" doesn't run it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PHONE = { width: 375, height: 667 };
const TABLETS = { 'iPad upright': { width: 768, height: 954 }, 'iPad sideways': { width: 1024, height: 698 } };
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// ---------- A tiny web server for the app's files ----------

const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------- Start Chrome and talk to it ----------

const chromePath = [
  process.env.CHROME,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => path && existsSync(path));
if (!chromePath) {
  console.error('Could not find Google Chrome. Set CHROME to its path.');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'tadpole-tales-screens-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank',
]);
const wsUrl = await new Promise((resolve, reject) => {
  let text = '';
  chrome.stderr.on('data', (chunk) => {
    text += chunk;
    const found = text.match(/DevTools listening on (ws:\/\/\S+)/);
    if (found) resolve(found[1]);
  });
  chrome.on('exit', () => reject(new Error(`Chrome stopped early:\n${text}`)));
  setTimeout(() => reject(new Error('Chrome did not start in 20 seconds')), 20000);
});

const socket = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 1;
const waiting = new Map();
const listeners = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && waiting.has(message.id)) {
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else {
    for (const listener of listeners) listener(message);
  }
};
/** Send Chrome a command and wait for its answer. */
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
await page('Log.enable');
await page('Network.enable');
await page('Emulation.setDeviceMetricsOverride', { ...PHONE, deviceScaleFactor: 2, mobile: true });
await page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); // taps arrive as a finger's, like on a phone

// Problems the page reports while a screen is open.
let errors = [];
let outside = [];
listeners.push((message) => {
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    errors.push(details.exception?.description || details.text);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    errors.push(message.params.entry.text);
  }
  // Any request to a web address that isn't this app's own server.
  if (message.method === 'Network.requestWillBeSent') {
    const url = message.params.request.url;
    if (/^(https?|wss?):/.test(url) && !url.startsWith(origin)) outside.push(url);
  }
});

/** Run JavaScript in the page and get its value back. */
async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Open an address fresh, and wait until `ready` (a JavaScript test) is true. */
async function open(address, ready) {
  errors = [];
  outside = [];
  await page('Page.navigate', { url: 'about:blank' });
  await page('Page.navigate', { url: `${origin}/${address}` });
  for (let tries = 0; tries < 100; tries++) {
    await sleep(100);
    try {
      if (await evaluate(`document.readyState === 'complete' && (${ready})`)) return true;
    } catch { /* the page is still loading */ }
  }
  return false;
}

// ---------- The checks ----------

const problems = [];
let checked = 0;

/** Open a screen and note a problem if it doesn't draw, logs an error, scrolls sideways, or asks another site for something. */
async function checkScreen(label, address) {
  checked++;
  let problem = '';
  try {
    if (!await open(address, 'document.querySelector("h1") !== null')) problem = 'did not draw';
    else {
      await sleep(300); // let the page's own scripts finish
      // screen.width, not innerWidth: a phone's browser widens the page to fit whatever is too wide.
      const wide = await evaluate('document.documentElement.scrollWidth - screen.width');
      if (wide > 0) problem = `is ${wide}px wider than the screen`;
    }
  } catch (error) {
    problem = `broke: ${String(error.message).split('\n')[0]}`;
  }
  for (const error of errors) problem += `${problem ? '; ' : ''}logged an error: ${String(error).split('\n')[0]}`;
  for (const url of outside) problem += `${problem ? '; ' : ''}asked another site for ${url}`;
  if (problem) problems.push(`${label}: ${problem}`);
  console.log(`${problem ? '✗' : '✓'} ${label}`);
}

// ---------- The app's keyboard ----------

/** Touch the screen at (x, y) for `ms` milliseconds, like a finger. */
async function touch(x, y, ms = 40) {
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(ms);
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(30);
}

/** The middle of the first element matching `selector`, in screen pixels. */
const middleOf = (selector) => evaluate(`(() => {
  const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
})()`);

/** Tap each of the app's keys in turn, by its data-key. */
async function press(...keys) {
  for (const key of keys) {
    const { x, y } = await middleOf(`[data-key=${JSON.stringify(key)}]`);
    await touch(x, y);
  }
}

// The words in the writing area, and which gap the cursor is in.
const typed = () => evaluate(`[...document.querySelectorAll('.writing .ch')].map((span) => span.textContent).join('')`);
const cursorAt = () => evaluate(`(() => {
  const all = [...document.querySelector('.writing').children];
  return all.slice(0, all.indexOf(document.querySelector('.writing .cursor'))).filter((span) => span.matches('.ch')).length;
})()`);

/** Open the keyboard from the home screen and try it with real taps. Returns a problem, or ''. */
async function tryKeyboard() {
  if (!await open('', 'document.querySelector(".go") !== null')) return 'home did not draw';
  await sleep(200);
  const go = await middleOf('.go');
  await touch(go.x, go.y);
  await sleep(200);
  if (!await evaluate('document.querySelector(".keyboard") !== null')) return 'the keyboard did not open';
  if (await evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length')) return 'a text field is on the screen';

  await press('shift', 'd', 'o', 't', 'space', 's', 'w', 'a', 'm');
  if (await typed() !== 'Dot swam') return `typing "Dot swam" gave "${await typed()}"`;
  if (await evaluate('document.querySelector(".writing").textContent.replace(/\\u200b/g, "")') !== 'Dot swam') return 'the words are not in the writing area for a screen reader';

  // Tap just right of the "t": the cursor goes after it.
  const t = await evaluate(`(() => { const box = document.querySelectorAll('.writing .ch')[2].getBoundingClientRect(); return { x: box.right - 2, y: box.top + box.height / 2 }; })()`);
  await touch(t.x, t.y);
  await press('s');
  if (await typed() !== 'Dots swam') return `tapping after "Dot" then "s" gave "${await typed()}"`;
  // Tap the left part of the "D": the cursor goes before it.
  const d = await evaluate(`(() => { const box = document.querySelector('.writing .ch').getBoundingClientRect(); return { x: box.left + box.width * 0.3, y: box.top + box.height / 2 }; })()`);
  await touch(d.x, d.y);
  if (await cursorAt() !== 0) return `tapping the left of the first letter put the cursor at ${await cursorAt()}`;
  // Tap the empty space below the words: the cursor goes to the end.
  const below = await evaluate(`(() => { const box = document.querySelector('.writing').getBoundingClientRect(); return { x: box.left + box.width - 10, y: box.bottom - 10 }; })()`);
  await touch(below.x, below.y);
  if (await cursorAt() !== 9) return `tapping below the words put the cursor at ${await cursorAt()}, not the end`;

  // One short tap on backspace deletes one letter; holding it keeps deleting.
  await press('backspace');
  if (await typed() !== 'Dots swa') return `one tap on backspace gave "${await typed()}"`;
  const back = await middleOf('[data-key="backspace"]');
  await touch(back.x, back.y, 1500);
  if (await typed() !== '') return `holding backspace left "${await typed()}"`;

  // A full page (300 characters) fits in the writing area without scrolling.
  await evaluate(`(() => {
    const words = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. ';
    for (const char of words.repeat(5).slice(0, 305)) {
      const key = char === ' ' ? 'space' : /[A-Z]/.test(char) ? 'shift' : char;
      document.querySelector('[data-key="' + (key === '"' ? '\\\\"' : key) + '"]').click();
      if (key === 'shift') document.querySelector('[data-key="' + char.toLowerCase() + '"]').click();
    }
  })()`);
  if ((await typed()).length !== 300) return `the 300 limit let ${(await typed()).length} characters in`;
  // Tap the left edge of letter 150, in the middle of the page: the cursor goes before it.
  const mid = await evaluate(`(() => { const box = document.querySelectorAll('.writing .ch')[150].getBoundingClientRect(); return { x: box.left + 1, y: box.top + box.height / 2 }; })()`);
  await touch(mid.x, mid.y);
  if (await cursorAt() !== 150) return `tapping letter 150 put the cursor at ${await cursorAt()}`;

  const fit = await evaluate(`(() => {
    const writing = document.querySelector('.writing');
    const keys = [...document.querySelectorAll('.key')];
    const bottom = document.querySelector('.keyboard').getBoundingClientRect().bottom;
    return {
      scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
      offScreen: bottom > innerHeight + 0.5,
      short: keys.filter((key) => key.offsetHeight < 48).length,
      overflow: writing.scrollHeight > writing.clientHeight + 1,
    };
  })()`);
  if (fit.scrolls) return 'the page scrolls';
  if (fit.offScreen) return 'the keyboard goes off the bottom of the screen';
  if (fit.short) return `${fit.short} keys are less than 48px tall`;
  if (fit.overflow) return '300 characters do not fit in the writing area';
  return '';
}

/** Run tryKeyboard at the current size and note any problem. */
async function checkKeyboard(label) {
  checked++;
  let problem;
  try {
    problem = await tryKeyboard();
  } catch (error) {
    problem = `broke: ${String(error.message).split('\n')[0]}`;
  }
  for (const error of errors) problem += `${problem ? '; ' : ''}logged an error: ${String(error).split('\n')[0]}`;
  for (const url of outside) problem += `${problem ? '; ' : ''}asked another site for ${url}`;
  if (problem) problems.push(`${label}: ${problem}`);
  console.log(`${problem ? '✗' : '✓'} ${label}`);
}

// ---------- Saving (src/store.js) ----------

// In the page: store.js and book.js, the same copies the app uses.
const STORE = `const store = await import('/src/store.js'); const book = await import('/src/book.js');`;
// Make every IndexedDB transaction fail (as when Safari drops the connection), or put it right.
const BREAK = `IDBDatabase.prototype.realTransaction ??= IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () { throw new DOMException('test: connection lost', 'InvalidStateError'); };`;
const MEND = `IDBDatabase.prototype.transaction = IDBDatabase.prototype.realTransaction;`;
/** The text of page 1 of every saved book, read fresh from the database. */
const savedTexts = () => evaluate(`(async () => { ${STORE} return (await store.loadBooks()).map((b) => b.pages[0].text); })()`);
const markShows = () => evaluate(`(() => { const mark = document.querySelector('.save-mark'); return Boolean(mark && !mark.hidden && mark.textContent.includes('Not saved')); })()`);

/** Open the home screen with no books, then the keyboard demo. */
async function freshDemo() {
  if (!await open('', 'document.querySelector(".go") !== null')) throw new Error('home did not draw');
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  const go = await middleOf('.go');
  await touch(go.x, go.y);
  await sleep(100);
}

/** Save through the keyboard, reload, and find the book; break saving and see the mark. Returns a problem, or ''. */
async function trySaving() {
  // Type, wait for the save, reload: the book is there.
  await freshDemo();
  await press('f', 'r', 'o', 'g');
  await sleep(1500);
  if (await markShows()) return 'the "not saved" mark shows after a good save';
  await open('', 'document.querySelector(".go") !== null');
  if (JSON.stringify(await savedTexts()) !== '["frog"]') return `after a reload the saved books are ${JSON.stringify(await savedTexts())}, not ["frog"]`;

  // Reload straight after typing, before the 1-second wait: still kept.
  await freshDemo();
  await press('p', 'o', 'n', 'd');
  await open('', 'document.querySelector(".go") !== null');
  if (JSON.stringify(await savedTexts()) !== '["pond"]') return `reloading at once kept ${JSON.stringify(await savedTexts())}, not ["pond"]`;

  // Every save fails: the mark shows, the spare copy holds the words, and the next load puts them back.
  await freshDemo();
  await evaluate(BREAK);
  await press('l', 'o', 'g');
  await sleep(1500);
  if (!await markShows()) return 'the "not saved" mark did not show when saving failed';
  if (!(await evaluate(`localStorage.getItem('tadpole-tales.spare') || ''`)).includes('"log"')) return 'no spare copy in localStorage after a failed save';
  await open('', 'document.querySelector(".go") !== null'); // a fresh page: saving works again
  if (JSON.stringify(await savedTexts()) !== '["log"]') return `the spare copy was not put back: ${JSON.stringify(await savedTexts())}`;
  if (await evaluate(`localStorage.getItem('tadpole-tales.spare')`) !== null) return 'the spare copy stayed after it was saved';

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

// ---------- The grown-up page (src/grownup.js) ----------

/** Scroll `selector` into view and tap its middle (the nth match). */
async function tapOn(selector, n = 0, ms = 40) {
  const { x, y } = await evaluate(`(() => {
    const node = document.querySelectorAll(${JSON.stringify(selector)})[${n}];
    node.scrollIntoView({ block: 'center' });
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await touch(x, y, ms);
}

/** Wait up to `seconds` for a JavaScript test to be true. */
async function waitFor(test, seconds = 5) {
  for (let i = 0; i < seconds * 10; i++) {
    if (await evaluate(test)) return true;
    await sleep(100);
  }
  return false;
}

const grownupOpen = 'location.hash === "#grown-ups" && !document.querySelector(".grownups").hidden';

/** A tap doesn't open the grown-up page, a 2-second hold does; every check reports; delete and start over ask first. */
async function tryGrownup() {
  if (!await open('', 'document.querySelector(".hold-button") !== null')) return 'home did not draw';
  await evaluate(`(async () => { ${STORE} await store.startOver();
    await store.saveBook(book.setPageText(book.newBook('made-up-1', 1), 0, 'A duck found a hat.', 1));
    await store.saveBook(book.setPageText(book.newBook('made-up-2', 2), 0, 'The moon fell in the pond.', 2)); })()`);
  if (!await evaluate(`document.querySelector('.install-note').textContent.includes('Home Screen')`)) return 'no "Add to Home Screen" note in a browser tab';

  await tapOn('.hold-button', 0, 300);
  await sleep(300);
  if (await evaluate(grownupOpen)) return 'a short tap opened the grown-up page';
  await tapOn('.hold-button', 0, 2300);
  if (!await waitFor(grownupOpen, 2)) return 'holding for 2 seconds did not open the grown-up page';
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

// ---------- Backup and restore (src/grownup.js, src/book.js) ----------

const downloads = mkdtempSync(join(tmpdir(), 'tadpole-tales-downloads-'));

/** Pick `path` in the grown-up page's restore file picker, and wait for what it says. */
async function restoreFrom(path) {
  const { result } = await page('Runtime.evaluate', { expression: `document.querySelector('.gu-pick input')` });
  await page('DOM.setFileInputFiles', { files: [path], objectId: result.objectId });
  await waitFor(`/^[✓⚠]/.test(document.querySelector('.gu-pick + .gu-note').textContent)`, 5);
  return evaluate(`document.querySelector('.gu-pick + .gu-note').textContent`);
}

/** Back up two books, start over, restore them, restore again, and try a broken file. Returns a problem, or ''. */
async function tryBackup() {
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
  let name;
  for (let i = 0; i < 50 && !name; i++) {
    await sleep(100);
    name = readdirSync(downloads).find((file) => file.endsWith('.json'));
  }
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
  return '';
}

/** Run a check that returns a problem (or ''), and note it. */
async function checkWith(label, check) {
  checked++;
  let problem;
  try {
    problem = await check();
  } catch (error) {
    problem = `broke: ${String(error.message).split('\n')[0]}`;
  }
  for (const error of errors) problem += `${problem ? '; ' : ''}logged an error: ${String(error).split('\n')[0]}`;
  for (const url of outside) problem += `${problem ? '; ' : ''}asked another site for ${url}`;
  if (problem) problems.push(`${label}: ${problem}`);
  console.log(`${problem ? '✗' : '✓'} ${label}`);
}

try {
  await checkScreen('Home (phone)', '');
  await checkWith('Saving: save, reload, spare copy, retry once, "not saved" mark, unreadable books', trySaving);
  await checkWith('Grown-up page: hold to open, every device check, delete a book, start over', tryGrownup);
  await checkWith('Backup: back up, start over, restore, restore again, broken file', tryBackup);
  await checkKeyboard('Keyboard: type, tap to move the cursor, hold backspace, 300 fit (phone)');
  for (const [tablet, size] of Object.entries(TABLETS)) {
    await page('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: true });
    await checkScreen(`Home (${tablet})`, '');
    await checkKeyboard(`Keyboard (${tablet})`);
  }
} catch (error) {
  problems.push(`stopped early: ${String(error.message).split('\n')[0]}`);
} finally {
  socket.close();
  chrome.kill();
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await sleep(300);
  rmSync(downloads, { recursive: true, force: true });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; the folder is temporary */ }
}

if (problems.length) {
  console.error(`\n${problems.length} of ${checked} screens have a problem:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${checked} checks pass: screens draw, fit, log no errors, and the keyboard works.`);
