// lib.mjs: what every screen check shares: a tiny web server for the app, headless Chrome
// and the helpers to talk to it (open a screen, wait for something, touch, type, tap).
// tests/screens.mjs is the one command; the checks themselves are in the other files here.
//
// Waiting: never for a fixed time. Use waitFor (or open) with a JavaScript test that is
// true when the thing you are waiting for has happened. The few sleeps left say why.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PHONE = { width: 375, height: 667 };
export const TABLETS = { 'iPad upright': { width: 768, height: 954 }, 'iPad sideways': { width: 1024, height: 698 } };

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// ---------- A tiny web server for the app's files ----------

// The lesson files are not in the app yet (the wording pull request adds them), so by default the
// server answers 404 for them, as the real site does. lessons.mjs turns this on to serve the fixtures.
export const lessonFiles = { on: false };
const LESSON_URL = /^\/data\/(lessons|examples)\.json$/;

let serverIsOff = false;
export const server = createServer(async (request, response) => {
  let file;
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    file = resolve(ROOT, LESSON_URL.test(path)
      ? (lessonFiles.on ? `tests/fixtures/${path.slice(6)}` : 'no-such-file') // /data/lessons.json -> tests/fixtures/lessons.json
      : `.${path.endsWith('/') ? `${path}index.html` : path}`);
  } catch { /* a broken %-escape */ }
  if (!file || !file.startsWith(ROOT)) { // e.g. /..%2f..%2fetc/passwd: nothing outside the repo
    response.writeHead(403).end('not allowed');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
export const origin = `http://127.0.0.1:${server.address().port}`;


/** Stop the web server (once). The offline check calls it early, on purpose. */
export async function stopServer() {
  if (serverIsOff) return;
  serverIsOff = true;
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}

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

export const profile = mkdtempSync(join(tmpdir(), 'tadpole-tales-screens-'));
export const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank',
]);
const wsUrl = await new Promise((resolve, reject) => {
  let text = '';
  const giveUp = setTimeout(() => reject(new Error('Chrome did not start in 20 seconds')), 20000);
  chrome.stderr.on('data', (chunk) => {
    text += chunk;
    const found = text.match(/DevTools listening on (ws:\/\/\S+)/);
    if (found) { clearTimeout(giveUp); resolve(found[1]); } // (a timer left running would keep the script alive for 20 seconds)
  });
  chrome.on('exit', () => reject(new Error(`Chrome stopped early:\n${text}`)));
});

export const socket = new WebSocket(wsUrl);
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
export const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
export const page = (method, params) => send(method, params, sessionId);
await page('Page.enable');
await page('Runtime.enable');
await page('Log.enable');
await page('Network.enable');
await page('Emulation.setDeviceMetricsOverride', { ...PHONE, deviceScaleFactor: 2, mobile: true });
await page('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); // taps arrive as a finger's, like on a phone

// Problems the page reports while a screen is open. The arrays are emptied (not replaced) by open().
export const errors = [];
export const outside = [];
listeners.push((message) => {
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    errors.push(details.exception?.description || details.text);
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  }
  // (The browser itself logs a 404 for a lesson file that isn't there: that is the "no lessons" case, not an error.)
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && !LESSON_URL.test(new URL(message.params.entry.url ?? 'http://x/', 'http://x').pathname)) {
    errors.push(message.params.entry.text);
  }
  // Any request to a web address that isn't this app's own server.
  if (message.method === 'Network.requestWillBeSent') {
    const url = message.params.request.url;
    if (/^(https?|wss?):/.test(url) && !url.startsWith(origin)) outside.push(url);
  }
});

/** Run JavaScript in the page and get its value back. */
export async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}

// Only the gap between two looks at the page (waitFor and open) and a finger held down wait for time.
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LOOK_EVERY = 25; // ms between looks

/** Wait up to `seconds` for a JavaScript test to be true. A page that is still loading counts as "not yet". */
export async function waitFor(test, seconds = 5) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    try {
      if (await evaluate(test)) return true;
    } catch { /* the page is loading or has just reloaded */ }
    if (Date.now() >= until) return false;
    await sleep(LOOK_EVERY);
  }
}

/** Wait up to `seconds` until `check()` (here in Node, not in the page) gives something other than undefined or false, and return it. */
export async function until(check, seconds = 5) {
  const stop = Date.now() + seconds * 1000;
  for (;;) {
    const found = await check();
    if (found || Date.now() >= stop) return found;
    await sleep(LOOK_EVERY);
  }
}

/** Wait for the page to paint once, so the handlers of an event that just happened have run. */
export const frame = () => evaluate('new Promise((resolve) => requestAnimationFrame(() => resolve(true)))');

/** Let the screen on show finish drawing: the font has loaded and the page has painted. */
export async function settle() {
  await waitFor(`document.fonts.status === 'loaded'`, 5);
  await frame();
}

/** The home screen has drawn its shelf (and its buttons work). */
export const HOME = 'document.querySelector(".go") !== null && document.querySelector(".books-note, .book-card") !== null';

/** Open an address fresh, and wait until `ready` (a JavaScript test) is true. */
export async function open(address, ready) {
  errors.length = 0;
  outside.length = 0;
  await page('Page.navigate', { url: 'about:blank' });
  await page('Page.navigate', { url: `${origin}/${address}` });
  return waitFor(`document.readyState === 'complete' && (${ready})`, 10);
}

// ---------- The checks ----------

export const problems = [];
export let checked = 0;

/** Run a check that returns a problem (or ''), and note it. A page error or a request to another site fails it too. */
export async function checkWith(label, check) {
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

/** Open a screen and note a problem if it doesn't draw, scrolls sideways, logs an error, or asks another site for something. */
export const checkScreen = (label, address) => checkWith(label, async () => {
  if (!await open(address, 'document.querySelector("h1") !== null')) return 'did not draw';
  // Let the page's own scripts finish: the shelf is drawn and the font has loaded.
  await waitFor(HOME, 5);
  await settle();
  // screen.width, not innerWidth: a phone's browser widens the page to fit whatever is too wide.
  const wide = await evaluate('document.documentElement.scrollWidth - screen.width');
  return wide > 0 ? `is ${wide}px wider than the screen` : '';
});

// ---------- Touching and typing ----------

/**
 * Touch the screen at (x, y), like a finger. `ms` holds it down that long: a held finger has
 * nothing to wait for but time (use holdUntil when the page will say when to let go).
 */
export async function touch(x, y, ms = 0) {
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (ms) await sleep(ms);
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await frame();
}

/** Hold a finger at (x, y) until `done` (a JavaScript test) is true, then lift it. Returns whether it got there. */
export async function holdUntil(x, y, done, seconds = 5) {
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const reached = await waitFor(done, seconds);
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await frame();
  return reached;
}

/** The middle of the first element matching `selector`, in screen pixels. */
export const middleOf = (selector) => evaluate(`(() => {
  const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
})()`);

/** Tap each of the app's keys in turn, by its data-key. */
export async function press(...keys) {
  for (const key of keys) {
    const { x, y } = await middleOf(`[data-key=${JSON.stringify(key)}]`);
    await touch(x, y);
  }
}

// The words in the writing area, and which gap the cursor is in.
export const typed = () => evaluate(`[...document.querySelectorAll('.writing .ch')].map((span) => span.textContent).join('')`);
export const cursorAt = () => evaluate(`(() => {
  const all = [...document.querySelector('.writing').children];
  return all.slice(0, all.indexOf(document.querySelector('.writing .cursor'))).filter((span) => span.matches('.ch')).length;
})()`);

/** Scroll `selector` into view and tap its middle (the nth match). */
export async function tapOn(selector, n = 0, ms = 0) {
  const { x, y } = await evaluate(`(() => {
    const node = document.querySelectorAll(${JSON.stringify(selector)})[${n}];
    node.scrollIntoView({ block: 'center' });
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await touch(x, y, ms);
}

/** Tap the first button whose words contain `label`. */
export async function tapButton(label) {
  const n = await evaluate(`[...document.querySelectorAll('button')].findIndex((b) => b.offsetParent !== null && b.textContent.includes(${JSON.stringify(label)}))`);
  if (n < 0) throw new Error(`no button says "${label}"`);
  await tapOn('button', n);
}

/** Drag a finger from one point to another in small steps, one step a frame. */
export async function drag(from, to, steps = 10) {
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await frame();
    const at = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await page('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
  }
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await frame();
}

// ---------- Reading the screen ----------

export const heading = () => evaluate(`document.querySelector('h1:not([hidden])') && [...document.querySelectorAll('h1')].find((h) => h.offsetParent !== null)?.textContent`);
export const noFields = () => evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length === 0');
export const isDisabled = (label) => evaluate(`[...document.querySelectorAll('button')].find((b) => b.offsetParent !== null && b.textContent.includes(${JSON.stringify(label)}))?.disabled`);
export const onPage = (title) => `document.querySelector('.screen-title')?.textContent === ${JSON.stringify(title)}`;

/** What is wrong with how the screen fits, or ''. The books list may scroll inside itself; the page may not. */
export const fitProblem = () => evaluate(`(() => {
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


// ---------- Saving: the app's store, and ways to break it ----------


// In the page: store.js and book.js, the same copies the app uses.
export const STORE = `const store = await import('/src/store.js'); const book = await import('/src/book.js');`;
// Make every IndexedDB transaction fail (as when Safari drops the connection), or put it right.
export const BREAK = `IDBDatabase.prototype.realTransaction ??= IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () { throw new DOMException('test: connection lost', 'InvalidStateError'); };`;
export const MEND = `IDBDatabase.prototype.transaction = IDBDatabase.prototype.realTransaction;`;
// Make every IndexedDB transaction hang with no answer at all (some Safari versions do).
export const STALL = `IDBDatabase.prototype.realTransaction ??= IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () {
    const request = {};
    const store = { put: () => request, get: () => request, getAll: () => request, delete: () => request, clear: () => request };
    return { objectStore: () => store, abort() {} };
  };`;
/** Every spare copy in localStorage (one key per book). */
export const spareKeys = () => evaluate(`Object.keys(localStorage).filter((key) => key.startsWith('tadpole-tales.spare'))`);
/** The text of page 1 of every saved book, read fresh from the database. */
export const savedTexts = () => evaluate(`(async () => { ${STORE} return (await store.loadBooks()).map((b) => b.pages[0].text); })()`);
export const MARK_SHOWS = `(() => { const mark = document.querySelector('.save-mark'); return Boolean(mark && !mark.hidden && mark.textContent.includes('Not saved')); })()`;
export const markShows = () => evaluate(MARK_SHOWS);
/** Save at once whatever the page is waiting to save (what the app does when it goes to the background). */
export const saveNow = () => evaluate(`(async () => { ${STORE} await store.saveNow(); })()`);


/** With SHOTS=<folder>, save a screenshot of the screen on show. */
export async function shot(name, width) {
  if (!process.env.SHOTS) return;
  const { data } = await page('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(process.env.SHOTS, `${name.replace(/[ ,]+/g, '-')}-${width}.png`), Buffer.from(data, 'base64'));
}

/** Shut Chrome and the server down, and remove the temporary profile. */
export async function shutDown() {
  socket.close();
  const gone = new Promise((resolve) => chrome.once('exit', resolve));
  chrome.kill();
  await gone;
  await stopServer();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; the folder is temporary */ }
}
