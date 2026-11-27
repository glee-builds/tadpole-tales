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
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

try {
  await checkScreen('Home (phone)', '');
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
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; the folder is temporary */ }
}

if (problems.length) {
  console.error(`\n${problems.length} of ${checked} screens have a problem:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${checked} checks pass: screens draw, fit, log no errors, and the keyboard works.`);
