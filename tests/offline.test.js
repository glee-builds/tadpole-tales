// Tests for sw.js, the service worker that lets the app open offline.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');

// The FILES list in sw.js, read as text: every quoted path between "FILES = [" and "];".
const listed = sw.slice(sw.indexOf('const FILES = ['), sw.indexOf('];', sw.indexOf('const FILES = [')))
  .match(/'[^']+'/g).map((quoted) => quoted.slice(1, -1));

test('sw.js saves every file the app needs for offline', () => {
  const needed = [
    'index.html', 'styles.css', 'manifest.webmanifest',
    ...['src/', 'assets/'].flatMap((folder) =>
      readdirSync(new URL(folder, root), { recursive: true })
        .map((name) => `${folder}${name}`)
        .filter((path) => /\.(js|json|css|html|svg|png|woff2)$/.test(path))),
  ];
  const missing = needed.filter((path) => !listed.includes(path));
  assert.deepEqual(missing, [], `add these to FILES in sw.js: ${missing.join(', ')}`);
});

test('every data/ file the app loads is in the sw.js list', () => {
  // The app names a data file in its code, e.g. new URL('../data/stickers.json', import.meta.url).
  const loaded = readdirSync(new URL('src/', root))
    .filter((name) => name.endsWith('.js'))
    .flatMap((name) => readFileSync(new URL(`src/${name}`, root), 'utf8').match(/\.\.\/data\/[\w.-]+/g) ?? [])
    .map((path) => path.slice(3));
  assert.ok(loaded.length > 0, 'found no data/ file loaded by src/, so this test checks nothing');
  // The lesson files arrive with the wording pull request; the app works without them, so FILES may leave them out.
  const optional = ['data/lessons.json', 'data/examples.json'];
  const missing = [...new Set(loaded)].filter((path) => !listed.includes(path) && !optional.includes(path));
  assert.deepEqual(missing, [], `add these to FILES in sw.js: ${missing.join(', ')}`);
  const unused = readdirSync(new URL('data/', root)).map((name) => `data/${name}`).filter((path) => !loaded.includes(path));
  assert.deepEqual(unused, [], `these data/ files are loaded by no file in src/: ${unused.join(', ')}`);
});

test('every file in the sw.js list exists', () => {
  const gone = listed.filter((path) => path !== './' && !existsSync(new URL(path, root)));
  assert.deepEqual(gone, [], `these are in FILES in sw.js but don't exist: ${gone.join(', ')}`);
});

test('a new version deletes only this app\'s old caches, never a sibling app\'s on the same address', async () => {
  const names = ['tadpole-tales-v0', 'tadpole-tales-v1', 'little-pond-v3', 'lily-pad', 'other'];
  const deleted = [];
  const listeners = {};
  const self = { addEventListener: (type, listener) => { listeners[type] = listener; }, clients: { claim: async () => {} } };
  const caches = { keys: async () => names, delete: async (name) => { deleted.push(name); return true; } };
  new Function('self', 'caches', sw)(self, caches); // run sw.js with a pretend browser
  let done;
  listeners.activate({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.deepEqual(deleted, ['tadpole-tales-v0']);
});

test('the list has no file twice, and includes the app itself', () => {
  assert.equal(new Set(listed).size, listed.length);
  assert.ok(listed.includes('./'));
  assert.ok(listed.includes('index.html'));
});
