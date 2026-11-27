// screens.mjs: open the app in a real browser and check it draws and works.
//
// It starts the app and opens each of its screens (the bookshelf, the page
// screen, the reading view, the finish step, the grown-up page) at a phone size
// and at two iPad sizes. It fails if a page doesn't draw, logs an error,
// scrolls sideways, or asks for anything from another site. It also taps the
// writer's keys and picture area with real touches, and checks that books save.
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

let serverIsOff = false;
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

  // Fast typing: the second finger lands before the first lifts. Both letters count, once each.
  const a = await middleOf('[data-key="a"]');
  const b = await middleOf('[data-key="b"]');
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await sleep(30);
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await sleep(30);
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b] });
  await sleep(30);
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  if (await typed() !== 'ab') return `two overlapping taps typed "${await typed()}", not "ab"`;
  // A hardware keyboard (or switch control): Enter on a focused key types it once.
  await evaluate(`document.querySelector('[data-key="c"]').focus()`);
  await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(50);
  if (await typed() !== 'abc') return `Enter on the focused "c" key gave "${await typed()}"`;
  await evaluate(`for (let i = 0; i < 3; i++) document.querySelector('[data-key="backspace"]').click()`);
  if (await typed() !== '') return `three keyboard presses of backspace left "${await typed()}"`;

  // The cursor stands out from the white writing area (3:1 or more).
  const contrast = await evaluate(`(() => {
    const rgb = (color) => color.match(/[\\d.]+/g).slice(0, 3).map(Number);
    const light = (color) => { const [r, g, b] = rgb(color).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const one = light(getComputedStyle(document.querySelector('.writing .cursor')).borderLeftColor);
    const two = light(getComputedStyle(document.querySelector('.writing')).backgroundColor);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  })()`);
  if (contrast < 3) return `the cursor is only ${contrast.toFixed(1)}:1 against the writing area`;

  // Restored words with an emoji: tapping before the letter after it, then typing, keeps the emoji whole.
  await evaluate(`(async () => {
    const { mountWriter } = await import('/src/keyboard.js');
    const box = document.createElement('div');
    box.className = 'emoji-test';
    box.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; height: 400px; display: flex; flex-direction: column; background: #fff; z-index: 9';
    document.body.append(box);
    window.__writer = mountWriter(box, { text: '😀b' });
  })()`);
  const letterB = await evaluate(`(() => { const box = [...document.querySelectorAll('.emoji-test .ch')][1].getBoundingClientRect(); return { x: box.left + 1, y: box.top + box.height / 2 }; })()`);
  await touch(letterB.x, letterB.y);
  const withEmoji = await evaluate(`(() => { document.querySelector('.emoji-test [data-key="x"]').click(); const text = window.__writer.getText(); window.__writer.remove(); document.querySelector('.emoji-test').remove(); return text; })()`);
  if (withEmoji !== '😀xb') return `typing x before the b in "😀b" gave ${JSON.stringify(withEmoji)}`;

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
// Make every IndexedDB transaction hang with no answer at all (some Safari versions do).
const STALL = `IDBDatabase.prototype.realTransaction ??= IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () {
    const request = {};
    const store = { put: () => request, get: () => request, getAll: () => request, delete: () => request, clear: () => request };
    return { objectStore: () => store, abort() {} };
  };`;
/** Every spare copy in localStorage (one key per book). */
const spareKeys = () => evaluate(`Object.keys(localStorage).filter((key) => key.startsWith('tadpole-tales.spare'))`);
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
  if (!(await evaluate(`Object.keys(localStorage).filter((key) => key.startsWith('tadpole-tales.spare')).map((key) => localStorage.getItem(key)).join()`)).includes('"log"')) return 'no spare copy in localStorage after a failed save';
  await open('', 'document.querySelector(".go") !== null'); // a fresh page: saving works again
  if (JSON.stringify(await savedTexts()) !== '["log"]') return `the spare copy was not put back: ${JSON.stringify(await savedTexts())}`;
  if ((await spareKeys()).length) return 'the spare copy stayed after it was saved';

  // Book A fails to save, then the writer types in book B: both are kept for the next load.
  await evaluate(`(async () => { ${STORE} await store.startOver(); ${BREAK}
    store.saveSoon(book.setPageText(book.newBook('made-up-a', 1), 0, 'ant', 1));
    await store.saveNow();
    store.saveSoon(book.setPageText(book.newBook('made-up-b', 2), 0, 'bee', 2));
    await store.saveNow(); })()`);
  await open('', 'document.querySelector(".go") !== null');
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
async function tryHostile() {
  if (!await open('', 'document.querySelector(".go") !== null')) return 'home did not draw';
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
    await sleep(300);
    if (errors.length) return `${address}: ${errors[0]}`;
  }
  if (await evaluate('window.__xss === 1 || document.querySelector("img[src=x]") !== null')) return 'a title or id became HTML';
  return '';
}

// ---------- The picture area (src/stickers.js) ----------

/** Drag a finger from one point to another in small steps. */
async function drag(from, to, steps = 10) {
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await page('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
  }
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(50);
}

/** Every placed sticker: its middle and width on screen, and as parts of the picture. */
const placed = () => evaluate(`(() => {
  const pic = document.querySelector('.picture').getBoundingClientRect();
  return [...document.querySelectorAll('.picture .sticker')].map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width,
      fx: (box.left + box.width / 2 - pic.left) / pic.width, fy: (box.top + box.height / 2 - pic.top) / pic.height,
      inside: box.left >= pic.left - 1 && box.right <= pic.right + 1 && box.top >= pic.top - 1 && box.bottom <= pic.bottom + 1 };
  });
})()`);
const toolsShow = () => evaluate(`getComputedStyle(document.querySelector('.sticker-tools')).visibility !== 'hidden'`);

/** Add, drag, size and remove stickers in the demo, with real touches. Returns a problem, or ''. */
async function tryStickers() {
  await open('', 'document.querySelector(".go") !== null');
  await evaluate(`(async () => { ${STORE} await store.startOver();
    let one = book.setPageText(book.newBook('made-up-pic-1', 1000), 0, 'page a', 1000);
    one = book.setPageText(book.addPage(one, 0, 1000), 1, 'page b', 1000);
    await store.saveBook(book.setPageText(book.addPage(one, 1, 1000), 2, 'page c', 1000));
  })()`);
  if (!await open('#book/made-up-pic-1/0', 'document.querySelector(".keyboard") !== null')) return 'the page screen did not draw';
  // Write mode shows a small picture; tapping it opens Picture mode, with no keyboard.
  await tapOn('.picture-slot');
  if (!await waitFor('document.querySelector(".tray-sticker .emoji") !== null', 3)) return 'tapping the small picture did not open Picture mode';
  if (await evaluate('document.querySelector(".keyboard") !== null')) return 'the keyboard shows in Picture mode';
  await sleep(200);
  if (await evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length')) return 'a text field is on the screen';
  const shape = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return box.width / box.height; })()`);
  if (Math.abs(shape - 4 / 3) > 0.02) return `the picture is ${shape.toFixed(2)}:1, not 4:3`;

  // Tap the tray three times: three stickers, and the newest one shows its buttons.
  const tray = await middleOf('.tray-sticker');
  for (let i = 0; i < 3; i++) await touch(tray.x, tray.y);
  if ((await placed()).length !== 3) return `three taps on the tray placed ${(await placed()).length} stickers`;
  if (!await toolsShow()) return 'a new sticker does not show its buttons';

  // Drag the top sticker 60px right and 30px down: it follows the finger (this checks the tablet zoom sums).
  const before = (await placed())[2];
  await drag({ x: before.x, y: before.y }, { x: before.x + 60, y: before.y + 30 });
  const after = (await placed())[2];
  if (Math.abs(after.x - before.x - 60) > 2 || Math.abs(after.y - before.y - 30) > 2) {
    return `a 60, 30 drag moved the sticker ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`;
  }

  // Two taps move a sticker: it is selected now, so tap an empty spot in the picture.
  const spot = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return { x: box.left + box.width * 0.15, y: box.top + box.height * 0.85 }; })()`);
  await touch(spot.x, spot.y);
  const tapped = (await placed())[2];
  if (Math.abs(tapped.x - spot.x) > 3 || Math.abs(tapped.y - spot.y) > 3) return `the second tap put the sticker at ${Math.round(tapped.x)}, ${Math.round(tapped.y)}, not ${Math.round(spot.x)}, ${Math.round(spot.y)}`;
  if (!await toolsShow()) return 'the sticker lost its buttons after a two-tap move';
  // Tap the sticker again: it is let go and the buttons hide. Tap once more: they show.
  await touch(tapped.x, tapped.y);
  if (await toolsShow()) return 'tapping the selected sticker did not hide the buttons';
  await touch(tapped.x, tapped.y);
  if (!await toolsShow()) return 'tapping a sticker did not show its buttons';
  // Bigger, then remove.
  const tools = await evaluate(`[...document.querySelectorAll('.sticker-tool')].map((b) => ({ words: b.textContent, tall: b.offsetHeight }))`);
  if (tools.some((tool) => tool.tall < 48)) return `a sticker button is less than 48px tall: ${JSON.stringify(tools)}`;
  const bigger = await evaluate(`(() => { const box = [...document.querySelectorAll('.sticker-tool')].find((b) => b.textContent.includes('Bigger')).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await touch(bigger.x, bigger.y);
  const grown = (await placed())[2];
  if (Math.abs(grown.width / after.width - 1.5) > 0.05) return `"Bigger" made the sticker ${(grown.width / after.width).toFixed(2)} times as wide, not 1.5`;
  const remove = await evaluate(`(() => { const box = [...document.querySelectorAll('.sticker-tool')].find((b) => b.textContent.includes('Remove')).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await touch(remove.x, remove.y);
  if ((await placed()).length !== 2) return `"Remove" left ${(await placed()).length} stickers, not 2`;
  if (await toolsShow()) return 'the buttons still show after the sticker was removed';

  // Up to 12, and no more.
  for (let i = 0; i < 11; i++) await touch(tray.x, tray.y);
  if ((await placed()).length !== 12) return `the tray let ${(await placed()).length} stickers on, not 12`;
  if (await evaluate('document.querySelector(".sticker-full").hidden')) return 'no "12 is the most" note at 12 stickers';

  // Drag one far past the bottom right: it stops at the edge. Nothing spills outside the picture.
  const last = (await placed())[11];
  await drag({ x: last.x, y: last.y }, { x: await evaluate('innerWidth - 2'), y: await evaluate('innerHeight - 2') });
  const end = await placed();
  if (end.some((s) => !s.inside)) return 'a sticker spills outside the picture';
  if (end[11].fx < 0.85 || end[11].fy < 0.8) return `dragging past the corner left the sticker at ${end[11].fx.toFixed(2)}, ${end[11].fy.toFixed(2)}`;

  const beforeReload = await placed();
  // Saved on the page: reload and see them, in Write mode's small picture and in Picture mode.
  await sleep(1500);
  await open('#book/made-up-pic-1/0', 'document.querySelector(".keyboard") !== null');
  if (!await waitFor(`document.querySelectorAll('.picture .sticker').length === 12`, 3)) return `after a reload Write mode's picture has ${await evaluate(`document.querySelectorAll('.picture .sticker').length`)} stickers, not 12`;
  if (await evaluate(`document.querySelectorAll('.picture button').length`)) return "Write mode's small picture has buttons";
  await tapButton('Picture');
  await waitFor(`document.querySelectorAll('.picture .sticker').length === 12`, 3);
  const kept = await placed();
  if (kept.some((k, i) => Math.abs(k.x - beforeReload[i].x) > 2 || Math.abs(k.y - beforeReload[i].y) > 2)) return 'the stickers are not where they were after a reload';
  if (await evaluate(`document.querySelectorAll('.picture .sticker').length`) !== 12) return 'the stickers did not come back';

  // Move page: page 1 later puts it second, and the stickers go with it. The ends are off.
  if (!await isDisabled('Move earlier')) return 'Move earlier should be off on page 1';
  await tapButton('Move later');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 3'`, 3)) return 'Move later did not go to page 2';
  if ((await placed()).length !== 12) return 'the stickers did not move with the page';
  await tapButton('Move later');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  if (!await isDisabled('Move later')) return 'Move later should be off on the last page';
  await sleep(1500);
  await open('#book/made-up-pic-1/2', 'document.querySelector(".keyboard") !== null');
  const order = await evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); return one.pages.map((p) => p.text + ':' + p.stickers.length).join(); })()`);
  if (order !== 'page b:0,page c:0,page a:12') return `after moving page 1 to the end and a reload the pages are "${order}"`;
  await tapButton('Picture');
  await waitFor('document.querySelector(".tray-sticker") !== null', 3);

  const fit = await evaluate(`(() => ({
    scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
    small: [...document.querySelectorAll('.tray-sticker, .pill, .mode-choice')].filter((b) => b.offsetParent !== null && (b.offsetWidth < 48 || b.offsetHeight < 48)).map((b) => b.textContent + b.offsetWidth + 'x' + b.offsetHeight).join(),
  }))()`);
  if (fit.scrolls) return 'the page scrolls';
  if (fit.small) return `${fit.small} buttons are smaller than 48px`;

  // The read-only picture puts a sticker in the same place.
  const reading = await evaluate(`(async () => {
    const { mountPicture, loadStickerList } = await import('/src/stickers.js');
    const [first] = await loadStickerList();
    const box = document.createElement('div');
    box.style.cssText = 'position: fixed; left: 0; top: 0; width: 200px';
    document.body.append(box);
    mountPicture(box, { stickers: [{ id: first.id, x: 0.25, y: 0.6, size: 1 }] });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pic = box.querySelector('.picture').getBoundingClientRect();
    const s = box.querySelector('.sticker').getBoundingClientRect();
    const result = { buttons: box.querySelectorAll('button').length, fx: (s.left + s.width / 2 - pic.left) / pic.width, fy: (s.top + s.height / 2 - pic.top) / pic.height };
    box.remove();
    return result;
  })()`);
  if (reading.buttons) return 'the read-only picture has buttons';
  if (Math.abs(reading.fx - 0.25) > 0.02 || Math.abs(reading.fy - 0.6) > 0.02) return `the read-only picture put 0.25, 0.6 at ${reading.fx.toFixed(2)}, ${reading.fy.toFixed(2)}`;
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

// ---------- Books: shelf, page screen, reading view (src/app.js, src/reading.js) ----------

/** Tap the first button whose words contain `label`. */
async function tapButton(label) {
  const n = await evaluate(`[...document.querySelectorAll('button')].findIndex((b) => b.offsetParent !== null && b.textContent.includes(${JSON.stringify(label)}))`);
  if (n < 0) throw new Error(`no button says "${label}"`);
  await tapOn('button', n);
}

const heading = () => evaluate(`document.querySelector('h1:not([hidden])') && [...document.querySelectorAll('h1')].find((h) => h.offsetParent !== null)?.textContent`);
const noFields = () => evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length === 0');
const isDisabled = (label) => evaluate(`[...document.querySelectorAll('button')].find((b) => b.offsetParent !== null && b.textContent.includes(${JSON.stringify(label)}))?.disabled`);
const reloaded = () => waitFor('window.__same === undefined', 5);

/** What is wrong with how the screen fits, or ''. The books list may scroll inside itself; the page may not. */
const fitProblem = () => evaluate(`(() => {
  if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth) return 'the page scrolls';
  const buttons = [...document.querySelectorAll('button, a.book-open')].filter((node) => node.offsetParent !== null && !node.matches('.tray-sticker')); // the tray scrolls inside itself, checked below
  const tray = document.querySelector('.sticker-tray');
  if (tray && tray.getBoundingClientRect().bottom > innerHeight + 0.5) return 'the sticker tray is off the bottom of the screen';
  const short = buttons.filter((node) => node.offsetHeight < 48);
  if (short.length) return short.length + ' buttons are shorter than 48px: ' + short.map((node) => node.textContent.trim()).join(', ');
  const low = buttons.filter((node) => !node.matches('.tray-sticker') && node.getBoundingClientRect().bottom > innerHeight + 0.5);
  if (low.length) return 'off the bottom of the screen: ' + low.map((node) => node.textContent.trim()).join(', ');
  const text = document.querySelector('.read-text');
  if (text) {
    const box = document.querySelector('.read-page');
    if (box.scrollHeight > box.clientHeight + 1) return 'the reading view needs to scroll';
    if (parseFloat(getComputedStyle(text).fontSize) < 20) return 'the reading view words are smaller than 20px';
  }
  if (document.querySelector('.keyboard') && document.querySelector('.writing').scrollHeight > document.querySelector('.writing').clientHeight + 1) return 'the words do not fit the writing area';
  return '';
})()`);

/** Make a 3-page book on the app's keys, then find it, finish it, read it, and refresh. Returns a problem, or ''. */
async function tryBooks() {
  if (!await open('', 'document.querySelector(".go") !== null')) return 'home did not draw';
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  await open('', 'document.querySelector(".go") !== null');
  if (!await waitFor(`document.querySelector('.books-note')?.textContent.includes('No books yet')`)) return 'an empty shelf does not say so';
  if (await heading() !== 'Your books') return `the heading is "${await heading()}", not "Your books"`;
  if (!await evaluate(`document.querySelector('.install-note').textContent.includes('Add to Home Screen')`)) return 'no install note in a browser tab';
  if (!await evaluate(`[...document.querySelectorAll('.shelf-foot button')].some((b) => b.textContent === '↻ Refresh')`)) return 'no Refresh button';

  // Backing out of a new book before writing anything leaves no empty book.
  await tapOn('.go');
  if (!await waitFor('document.querySelector(".keyboard") !== null', 3)) return 'Make a new book did not open the page screen';
  await tapOn('.back');
  await sleep(1500);
  if ((await savedTexts()).length) return 'an empty book was saved';

  // Three pages, on the app's own keys.
  await tapOn('.go');
  await waitFor('document.querySelector(".keyboard") !== null', 3);
  if (await heading() !== 'Page 1 of 1') return `the page screen says "${await heading()}"`;
  if (!await noFields()) return 'a text field is on the page screen';
  if (!await isDisabled('Prev') || !await isDisabled('Remove')) return 'Prev and Remove should be off on a one-page book';
  await press('p', 'i', 'p');
  await tapButton('Add page');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3)) return 'Add page did not open page 2';
  await press('h', 'o', 'p', 's');
  await tapButton('Add page');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  await press('h', 'o', 'm', 'e');
  if (await typed() !== 'home') return `page 3 holds "${await typed()}"`;

  // Remove page 3 and put it back.
  await tapButton('Remove');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3)) return 'Remove did not leave 2 pages';
  await tapButton('Put page back');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3)) return 'Put page back did not bring page 3 back';
  if (await typed() !== 'home') return `the put-back page holds "${await typed()}"`;
  // Two removes in a row: Remove stays on, and each "Put page back" brings back the latest one.
  await tapButton('Remove');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3);
  if (await isDisabled('Remove')) return 'Remove went off after one remove';
  await tapButton('Remove');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 1 of 1'`, 3)) return 'a second Remove did not leave 1 page';
  if (!await isDisabled('Remove')) return 'Remove should be off on the last page';
  await tapButton('Put page back');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3);
  if (await typed() !== 'hops') return `the first put-back brought back "${await typed()}", not the latest removed page`;
  await tapButton('Put page back');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  if (await typed() !== 'home') return `the second put-back brought back "${await typed()}"`;
  if (await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`)) return 'the put-back bar stayed with nothing to put back';
  await tapButton('Prev');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 3'`, 3);
  if (await typed() !== 'hops') return `page 2 holds "${await typed()}"`;
  await tapOn('.back');
  if (!await waitFor(`document.querySelectorAll('.book-card').length === 1`, 3)) return 'the shelf has no card for the new book';
  const card = await evaluate(`document.querySelector('.book-card').textContent`);
  if (!card.includes('Keep going') || !card.includes('3 pages') || !card.includes('pip')) return `the card says "${card}"`;

  // Reload: still there, first, with "Keep going". Open it again.
  await open('', 'document.querySelector(".book-card") !== null');
  if (!await evaluate(`document.querySelector('.book-card').textContent.includes('Keep going')`)) return 'after a reload the book is not marked "Keep going"';
  await tapOn('.book-card');
  await waitFor('document.querySelector(".keyboard") !== null', 3);
  if (await typed() !== 'pip') return `the saved page 1 holds "${await typed()}"`;

  // Finish: back on the shelf, no longer "Keep going".
  await tapButton('Finish');
  if (!await waitFor(`location.hash.startsWith('#finish/') && document.querySelector('.keyboard') !== null`, 3)) return 'Finish did not open the title step';
  // Skip every step (title, author name, cover): the book is still finished, and no name was kept.
  for (const step of ['called', 'author name', 'cover']) {
    if (!await waitFor(`document.querySelector('.screen h1').textContent.includes(${JSON.stringify(step)})`, 3)) return `no "${step}" step`;
    await tapButton('Skip');
  }
  if (!await waitFor(`location.hash === '' && document.querySelector('.book-card')?.textContent.includes('Finished')`, 3)) return 'Skipping every step did not leave the book finished on the shelf';
  if (await heading() !== 'Your books') return `skipping the name gave the heading "${await heading()}"`;

  // Reading view.
  await tapOn('.book-card');
  if (!await waitFor(`document.querySelector('.read-page') !== null`, 3)) return 'a finished book did not open in the reading view';
  if (!await noFields()) return 'a text field is on the reading view';
  const readPage = () => evaluate(`document.querySelector('.read-page').textContent + '|' + document.querySelector('.read-count').textContent`);
  if (await readPage() !== 'pip|Page 1 of 3') return `reading page 1 shows "${await readPage()}"`;
  if (!await isDisabled('Previous')) return 'Previous should be off on page 1';
  await tapButton('Next');
  await tapButton('Next');
  if (await readPage() !== 'home|Page 3 of 3') return `reading page 3 shows "${await readPage()}"`;
  if (!await isDisabled('Next')) return 'Next should be off on the last page';
  await tapButton('Close');
  if (!await waitFor(`location.hash === '' && document.querySelectorAll('.book-card').length === 1`, 3)) return 'Close did not go back to the shelf';

  // The name makes the heading.
  await evaluate(`(async () => { ${STORE} await store.setSetting('author', 'Pip'); })()`);
  await open('', 'document.querySelector(".book-card") !== null');
  if (!await waitFor(`document.querySelector('h1').textContent === 'Books by Pip'`)) return 'the heading is not "Books by Pip"';

  // Refresh saves first, then reloads. `window.__same` goes away only when the page reloads.
  const change = (text) => evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); store.saveSoon(book.setPageText(one, 0, ${JSON.stringify(text)}, Date.now())); window.__same = true; })()`);
  await change('pip swam');
  await tapOn('.refresh-button');
  if (!await reloaded()) return 'Refresh did not reload';
  if (JSON.stringify(await savedTexts()) !== '["pip swam"]') return `Refresh reloaded before saving: ${JSON.stringify(await savedTexts())}`;

  // A failed save: no reload, and the "not saved" mark shows. Mended, Refresh saves and reloads.
  await change('pip dived');
  await evaluate(BREAK);
  await tapOn('.refresh-button');
  await sleep(1500);
  if (!await evaluate('window.__same === true')) return 'Refresh reloaded although the save failed';
  if (!await markShows()) return 'no "not saved" mark after a failed Refresh';
  if (await evaluate(`document.querySelector('.refresh-button').disabled`)) return 'Refresh stayed switched off after a failed save';
  await evaluate(MEND);
  await tapOn('.refresh-button');
  if (!await reloaded()) return 'Refresh did not reload once saving worked again';
  if (JSON.stringify(await savedTexts()) !== '["pip dived"]') return `after the mended Refresh the book holds ${JSON.stringify(await savedTexts())}`;

  // The database never answers: Refresh gives up in time, stays, and shows the mark.
  await change('pip ran');
  await evaluate(STALL);
  await tapOn('.refresh-button');
  if (!await waitFor(`!document.querySelector('.refresh-button').disabled`, 25)) return 'Refresh waited for ever on a save the database never answered';
  if (!await evaluate('window.__same === true')) return 'Refresh reloaded although the save never finished';
  if (!await markShows()) return 'no "not saved" mark after the database never answered';
  await evaluate(MEND);
  return '';
}

/** A book from a newer version: on the shelf with a note, never opened, never changed. Returns a problem, or ''. */
async function tryNewer() {
  if (!await open('', 'document.querySelector(".go") !== null')) return 'home did not draw';
  const record = { id: 'made-up-newer', format: 99, changed: 5, title: 'From later', chapters: ['one'] };
  await evaluate(`(async () => { ${STORE} await store.startOver(); await store.saveBook(${JSON.stringify(record)}); })()`);
  if (!await open('', 'document.querySelector(".book-card") !== null')) return 'a newer book is not on the shelf';
  const card = await evaluate(`document.querySelector('.book-card').textContent`);
  if (!card.includes('newer version') || !card.includes('Refresh')) return `the newer book's card says "${card}"`;
  if (await evaluate(`document.querySelector('.book-card a, .book-card button') !== null`)) return 'the newer book can be opened or edited from the shelf';
  if (!await open('#book/made-up-newer/0', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the page screen opened a newer book';
  if (!await open('#finish/made-up-newer', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the finish screen opened a newer book';
  if (!await open('#read/made-up-newer', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the reading view opened a newer book';
  if (!await open('#grown-ups', 'document.querySelectorAll(".gu-book").length === 1')) return 'the grown-up page does not list the newer book';
  const kept = await evaluate(`(async () => { ${STORE} return (await store.loadBooks())[0]; })()`);
  if (JSON.stringify(kept) !== JSON.stringify(record)) return `the newer book changed: ${JSON.stringify(kept)}`;
  return '';
}

const SHOTS_AT = (name) => process.env.SHOTS && page('Page.captureScreenshot', { format: 'png' })
  .then(({ data }) => writeFileSync(join(process.env.SHOTS, `${name}-${PHONE_NOW}.png`), Buffer.from(data, 'base64')));
let PHONE_NOW = 0;

/** Finish a book: title, author name (first time only), cover; skip on a second book; closing mid-step; Edit. Returns a problem, or ''. */
async function tryFinish() {
  await open('', 'document.querySelector(".go") !== null');
  PHONE_NOW = await evaluate('innerWidth');
  const seed = (id, text) => evaluate(`(async () => { ${STORE} await store.saveBook(book.setPageText(book.addPage(book.setPageText(book.newBook(${JSON.stringify(id)}, 1000), 0, ${JSON.stringify(text)}, 1000), 0, 1000), 1, 'It ended.', 1000)); })()`);
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  await seed('made-up-fin-1', 'A frog sat down.');
  if (!await open('#book/made-up-fin-1/0', 'document.querySelector(".keyboard") !== null')) return 'the page screen did not draw';
  await tapButton('Finish');

  // Title step, on the app's keys.
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.keyboard')`, 3)) return 'no title step';
  if (!await noFields()) return 'a text field is on the title step';
  if (await evaluate(`document.querySelector('.finish-top button').textContent`) !== 'Skip') return 'an empty title should offer Skip';
  await press('t', 'r', 'e', 'e');
  if (await typed() !== 'tree') return `the title holds "${await typed()}"`;
  if (!(await evaluate(`document.querySelector('.finish-top button').textContent`)).includes('Next')) return 'a typed title should offer Next';
  let problem = await fitProblem();
  if (problem) return `title step: ${problem}`;
  await tapButton('Next');

  // The name, asked once.
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('author name')`, 3)) return 'no author name step on the first book';
  await press('p', 'i', 'p');
  problem = await fitProblem();
  if (problem) return `name step: ${problem}`;
  await tapButton('Next');

  // The cover: the title, a sticker, "by pip".
  if (!await waitFor(`document.querySelector('.finish-cover .tray-sticker') !== null`, 3)) return 'no cover step';
  if (!await noFields()) return 'a text field is on the cover step';
  const cover = await evaluate(`document.querySelector('.finish-cover').textContent`);
  if (!cover.includes('tree') || !cover.includes('by pip')) return `the cover says "${cover}"`;
  const tray = await middleOf('.tray-sticker');
  await touch(tray.x, tray.y);
  if (!await waitFor(`document.querySelectorAll('.finish-cover .picture .sticker').length === 1`, 2)) return 'a tray tap did not put a sticker on the cover';
  await sleep(300);
  problem = await fitProblem();
  if (problem) return `cover step: ${problem}`;
  await SHOTS_AT('cover-step');
  await tapButton('Done');

  // The shelf: kind message, "Books by pip", the cover with its sticker, Edit.
  if (!await waitFor(`location.hash === '' && document.querySelector('.book-card')`, 3)) return 'Done did not go back to the shelf';
  if (!await evaluate(`document.querySelector('.shelf-message')?.textContent.includes('Your book is on the shelf!')`)) return 'no kind message on the shelf';
  const shelfNow = `document.querySelector('h1').textContent === 'Books by pip' && document.querySelector('.book-card .cover-title').textContent === 'tree' && document.querySelectorAll('.book-card .cover .sticker').length === 1`;
  if (!await waitFor(shelfNow, 3)) return 'the shelf does not show "Books by pip" and the cover';
  // Reload: same.
  await open('', 'document.querySelector(".book-card .cover .sticker") !== null');
  if (!await waitFor(shelfNow, 3)) return 'after a reload the shelf does not show "Books by pip" and the cover';
  problem = await fitProblem();
  if (problem) return `shelf: ${problem}`;
  await SHOTS_AT('shelf');
  const kept = await evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); return [one.finished, one.title, one.cover?.stickers.length, await store.getSetting('author')].join('|'); })()`);
  if (kept !== 'true|tree|1|pip') return `the saved book is "${kept}"`;

  // Edit opens the pages; Finish again asks for the title (already filled in) and not for the name.
  await tapButton('Edit');
  if (!await waitFor(`location.hash === '#book/made-up-fin-1/0' && document.querySelector('.keyboard')`, 3)) return 'Edit did not open the pages';
  await tapButton('Finish');
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.writing .ch')`, 3)) return 'Edit then Finish did not show the title again';
  if (await typed() !== 'tree') return `the title step shows "${await typed()}"`;
  await tapButton('Next');
  if (!await waitFor(`document.querySelector('.finish-cover')`, 3)) return 'the name was asked a second time';
  await tapButton('Done');
  await waitFor(`location.hash === ''`, 3);

  // Closing the app mid-step: a second book, title typed, then the app opens again with nothing lost.
  await seed('made-up-fin-2', 'The moon came out.');
  await open('#book/made-up-fin-2/0', 'document.querySelector(".keyboard") !== null');
  await tapButton('Finish');
  await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called')`, 3);
  await press('m', 'o', 'o', 'n');
  await open('', 'document.querySelectorAll(".book-card").length === 2');
  const two = await evaluate(`(async () => { ${STORE} const b = (await store.loadBooks()).find((one) => one.id === 'made-up-fin-2'); return b.finished + '|' + b.title; })()`);
  if (two !== 'true|moon') return `closing mid-step left the book as "${two}"`;
  return '';
}

/** With SHOTS=<folder>, save a screenshot of the screen on show. */
async function shot(name, width) {
  if (!process.env.SHOTS) return;
  const { data } = await page('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(process.env.SHOTS, `${name.replace(/[ ,]+/g, '-')}-${width}.png`), Buffer.from(data, 'base64'));
}

/** Every screen fits at this size: the shelf, a full page, a page, the reading view. Returns a problem, or ''. */
async function tryFits() {
  await open('', 'document.querySelector(".go") !== null');
  await evaluate(`(async () => { ${STORE} await store.startOver();
    const long = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. '.repeat(5).slice(0, 300);
    const ids = (await (await fetch('/data/stickers.json')).json()).slice(0, 12).map((s) => s.id);
    let one = book.setPageText(book.newBook('made-up-fit-1', 1000), 0, long, 1000);
    one.pages[0].stickers = ids.map((id, i) => ({ id, x: 0.12 + (i % 4) * 0.25, y: 0.2 + Math.floor(i / 4) * 0.3, size: 1 }));
    one = book.setPageText(book.addPage(one, 0, 1000), 1, 'Two fish had a party.', 1000);
    await store.saveBook(one);
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-fit-2', 2000), 0, 'A snail raced a leaf.', 2000), finished: true, title: 'The Big Rock' });
    await store.saveBook(book.setPageText(book.newBook('made-up-fit-3', 3000), 0, 'The moon fell in the pond and made a splash.', 3000));
  })()`);
  const width = await evaluate('innerWidth');
  for (const [name, address, ready] of [
    ['the shelf', '', '[...document.querySelectorAll(".book-card")].length === 3'],
    ['a full page', '#book/made-up-fit-1/0', 'document.querySelector(".keyboard") !== null'],
    ['a short page', '#book/made-up-fit-1/1', 'document.querySelector(".keyboard") !== null'],
    ['the reading view', '#read/made-up-fit-1', 'document.querySelector(".read-page") !== null'],
  ]) {
    if (!await open(address, ready)) return `${name} did not draw`;
    await sleep(300);
    const problem = await fitProblem();
    if (problem) return `${name}: ${problem}`;
    if (name === 'the reading view') {
      await waitFor('document.querySelectorAll(".read-art .sticker").length === 12', 3);
      if (await evaluate('document.querySelectorAll(".read-art .sticker").length') !== 12) return 'the reading view does not show the 12 stickers';
      if (!await evaluate('document.querySelector(".read-voice").offsetHeight >= 48 || document.querySelector(".read-voice").hidden')) return 'Read to me is shorter than 48px';
      const problem2 = await fitProblem();
      if (problem2) return `${name} with its stickers: ${problem2}`;
    }
    if (name !== 'the shelf' && !await noFields()) return `${name} has a text field`;
    if (name === 'a full page') { // the picture keeps a sensible size even on a full page, with a put-back bar showing
      const size = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return { w: box.width, h: box.height }; })()`);
      if (size.h < 50 || size.w < 66) return `the picture on a full page is only ${Math.round(size.w)} x ${Math.round(size.h)}`;
    }
    await shot(name, width);
  }
  // A page with a put-back bar: still fits.
  if (!await open('#book/made-up-fit-1/1', 'document.querySelector(".keyboard") !== null')) return 'the put-back page did not draw';
  await tapButton('Remove');
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`, 3);
  await sleep(300);
  const barProblem = await fitProblem();
  if (barProblem) return `with the put-back bar: ${barProblem}`;
  await shot('put-back bar', width);
  // Picture mode, on a full page and on a page of a short book.
  for (const [name, address] of [['picture mode', '#book/made-up-fit-1/0'], ['picture mode, last page', '#book/made-up-fit-1/1']]) {
    if (!await open(address, 'document.querySelector(".keyboard") !== null')) return `${name} did not draw`;
    await tapButton('Picture');
    if (!await waitFor('document.querySelector(".tray-sticker .emoji") !== null', 3)) return `${name} did not open`;
    await sleep(300);
    const problem = await fitProblem();
    if (problem) return `${name}: ${problem}`;
    if (!await noFields()) return `${name} has a text field`;
    await shot(name, width);
  }
  return '';
}


// A pretend voice, put in the page before it loads (headless Chrome cannot speak).
const FAKE_VOICE = `(() => {
  window.__spoken = []; window.__cancels = 0;
  class Utter { constructor(text) { this.text = text; } }
  window.SpeechSynthesisUtterance = Utter;
  let timer = 0;
  const synth = {
    getVoices: () => [{ name: 'Ava', lang: 'en-US', localService: true, voiceURI: 'Ava' }],
    cancel() { window.__cancels++; clearTimeout(timer); },
    speak(u) {
      window.__spoken.push(u.text);
      if (window.__words) timer = setTimeout(() => u.onboundary?.({ name: 'word', charIndex: 0, charLength: 3 }), 60);
      timer = setTimeout(() => u.onend?.(), 250);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
})()`;
const NO_VOICE = `(() => { delete window.speechSynthesis; delete Window.prototype.speechSynthesis; })()`;

/** "Read to me": underlines sentences in order, turns the page, Stop and a hand-turn stop it; hidden with no voice. */
async function tryReadAloud() {
  await open('', 'document.querySelector(".go") !== null');
  await evaluate(`(async () => { ${STORE} await store.startOver();
    let b = book.setPageText(book.newBook('made-up-read-1', 1000), 0, 'The frog sat. The frog hopped!', 1000);
    b = book.setPageText(book.addPage(b, 0, 1000), 1, 'Then it swam.', 1000);
    await store.saveBook({ ...b, finished: true });
  })()`);
  const ready = 'document.querySelector(".read-page") !== null';
  const label = () => evaluate(`document.querySelector('.read-voice').textContent`);
  const now = () => evaluate(`document.querySelector('.read-now, .read-word')?.textContent ?? ''`);
  const watch = `window.__seen = []; new MutationObserver(() => { const t = document.querySelector('.read-now')?.textContent; if (t && window.__seen.at(-1) !== t) window.__seen.push(t); }).observe(document.body, { subtree: true, childList: true });`;

  // Sentences in order, then the page turns by itself, and at the end the button is back.
  let script = (await page('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_VOICE })).identifier;
  if (!await open('#read/made-up-read-1', ready)) return 'the reading view did not draw';
  if (await evaluate(`document.querySelector('.read-voice').hidden`)) return 'Read to me is hidden although there is a voice';
  if (await label() !== '🔊 Read to me') return `the button says "${await label()}"`;
  await evaluate(watch);
  await tapButton('Read to me');
  if (await label() !== '⏹ Stop') return 'the button did not become Stop';
  if (!await waitFor(`document.querySelector('.read-count').textContent === 'Page 2 of 2'`, 4)) return 'reading did not turn the page';
  if (!await waitFor(`document.querySelector('.read-voice').textContent === '🔊 Read to me'`, 4)) return 'the button did not come back at the end';
  const seen = JSON.stringify(await evaluate('window.__seen'));
  if (seen !== '["The frog sat.","The frog hopped!","Then it swam."]') return `underlined ${seen}`;
  if (await now()) return 'an underline was left after reading';

  // Stop stops it, and nothing more is spoken.
  await tapButton('Previous');
  await evaluate('window.__spoken.length = 0');
  await tapButton('Read to me');
  if (!await waitFor(`document.querySelector('.read-now')?.textContent === 'The frog sat.'`, 2)) return 'the first sentence was not underlined';
  await tapButton('Stop');
  if (await label() !== '🔊 Read to me' || await now()) return 'Stop did not clear the button and the underline';
  await sleep(600);
  if (await evaluate('window.__spoken.length') !== 1) return `${await evaluate('window.__spoken.length')} sentences were spoken around Stop`;

  // Turning a page by hand stops it.
  await tapButton('Read to me');
  await waitFor(`document.querySelector('.read-now') !== null`, 2);
  await tapButton('Next');
  if (await label() !== '🔊 Read to me' || await now()) return 'turning a page by hand did not stop reading';
  // Closing the book stops it.
  await evaluate('window.__cancels = 0');
  await tapButton('Read to me');
  await tapButton('Close');
  if (await evaluate('window.__cancels') < 1) return 'closing the book did not stop the voice';

  // Word timing, when the device sends it: the word is underlined, not the sentence.
  await open('#read/made-up-read-1', ready);
  await evaluate('window.__words = true');
  await tapButton('Read to me');
  if (!await waitFor(`document.querySelector('.read-word')?.textContent === 'The' && !document.querySelector('.read-now')`, 3)) return 'the word was not underlined when word timing came';
  await tapButton('Stop');
  await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });

  // No voice: the button is hidden.
  script = (await page('Page.addScriptToEvaluateOnNewDocument', { source: NO_VOICE })).identifier;
  const shown = await open('#read/made-up-read-1', ready) && !await evaluate(`document.querySelector('.read-voice').hidden`);
  await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  if (shown) return 'Read to me shows on a device with no voice';
  return '';
}

try {
  await checkScreen('Home (phone)', '');
  await checkWith('Books: make a 3-page book, reload, finish, read it, Refresh saves first', tryBooks);
  await checkWith('Every screen fits (phone)', tryFits);
  await checkWith('Read to me: underlines in order, turns the page, Stop, hand-turn, no voice (phone)', tryReadAloud);
  await checkWith('Finish: title, author name, cover, shelf, Edit, close mid-step (phone)', tryFinish);
  await checkWith('Saving: save, reload, spare copies per book, saveNow waits, retry once, "not saved" mark, unreadable books', trySaving);
  await checkWith('A book from a newer version: shown with a note, never opened or changed', tryNewer);
  await checkWith('Damaged books: the good book still shows; page, reading and grown-up screens draw', tryHostile);
  await checkWith('Grown-up page: hold to open, every device check, delete a book, start over', tryGrownup);
  await checkWith('Backup: back up, start over, restore, restore again, broken file', tryBackup);
  await checkKeyboard('Keyboard: type, tap to move the cursor, hold backspace, 300 fit (phone)');
  await checkWith('Picture mode: add, drag, two-tap move, bigger, remove, 12 limit, save, reorder pages (phone)', tryStickers);
  for (const [tablet, size] of Object.entries(TABLETS)) {
    await page('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: true });
    await checkScreen(`Home (${tablet})`, '');
    await checkKeyboard(`Keyboard (${tablet})`);
    await checkWith(`Picture mode (${tablet})`, tryStickers);
    await checkWith(`Every screen fits (${tablet})`, tryFits);
    await checkWith(`Finish (${tablet})`, tryFinish);
  }

  // Offline: save a book, let the service worker keep every file, stop the server, reload.
  await page('Emulation.setDeviceMetricsOverride', { ...PHONE, deviceScaleFactor: 2, mobile: true });
  await open('', 'document.querySelector("h1") !== null');
  await evaluate(`(async () => { ${STORE} await store.startOver();
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-offline-1', 1000), 0, 'The frog sat still.', 1000), finished: true, title: 'Offline Frog' }); })()`);
  const kept = await evaluate(`(async () => {
    await navigator.serviceWorker.ready;
    for (let tries = 0; tries < 100; tries++) {
      const names = await caches.keys();
      const count = names.length ? (await (await caches.open(names[0])).keys()).length : 0;
      if (count >= 20) return count;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  })()`);
  if (!kept) problems.push('Offline: the service worker did not keep the app\'s files');
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  serverIsOff = true;
  await checkWith('Offline: the shelf and a saved book open with the server off', async () => {
    if (!await open('', 'document.querySelectorAll(".book-card").length === 1')) return 'the shelf did not draw offline';
    await tapOn('.book-card');
    if (!await waitFor(`document.querySelector('.read-page')?.textContent === 'The frog sat still.'`, 3)) return 'the saved book did not open offline';
    return '';
  });
} catch (error) {
  problems.push(`stopped early: ${String(error.message).split('\n')[0]}`);
} finally {
  socket.close();
  chrome.kill();
  if (!serverIsOff) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  await sleep(300);
  rmSync(downloads, { recursive: true, force: true });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; the folder is temporary */ }
}

if (problems.length) {
  console.error(`\n${problems.length} of ${checked} screens have a problem:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${checked} checks pass: screens draw, fit, log no errors, and the writer's keys, pictures and saving work.`);
