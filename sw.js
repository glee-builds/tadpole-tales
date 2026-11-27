// sw.js: the service worker. It lets Tadpole Tales open without internet, and
// keeps the phone from mixing old and new files after an update.
//
// A service worker is a small script the phone keeps between the app and
// the internet. This one works like this:
//   - Online: always ask for the newest copy of each file (so an update
//     shows up right away, all at once), and save that copy.
//   - Offline: use the saved copy.
//   - When it's first installed, it saves every file in FILES, so the app
//     works offline even before it has been opened. (A word list that fails
//     to download doesn't stop the rest being saved.)
//
// When you add a file the app needs (a script, an image, a font), add it to
// FILES. tests/offline.test.js fails if one is missing.

const CACHE = 'tadpole-tales-v1';

// Every file the app needs, relative to this file. './' is the app itself.
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/ui.js',
  'src/typing.js',
  'src/book.js',
  'src/keyboard.js',
  'src/store.js',
  'src/grownup.js',
  'src/reading.js',
  'src/finish.js',
  'src/voice.js',
  'src/sentences.js',
  'src/lessons.js',
  'src/lesson-screens.js',
  'src/lesson-screens.css',
  'src/plan.js',
  'src/polish.js',
  'src/polish-screen.js',
  'src/readaloud.js',
  'src/stickers.js',
  'src/record.js',
  'src/stickers.css',
  'data/known-words.txt',
  'data/common-words.txt',
  'data/extra-known.txt',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon.svg',
  'assets/tadpole.svg',
  'data/stickers.json',
  'data/lessons.json',
  'data/examples.json',
  'assets/fonts/andika-latin-400-normal.woff2',
  'assets/fonts/andika-latin-700-normal.woff2',
];

// The word lists (data/*.txt): large, and the app works without them. A failed
// one must not cost the offline copy of everything else.
const isOptional = (file) => file.startsWith('data/') && file.endsWith('.txt');

// First install: save every file. `cache: 'reload'` skips the browser's own
// short-term copies, so the saved set is all from the same version. The app's
// own files are all-or-nothing (addAll); each word list is saved on its own and
// may fail (it is saved later, the first time the app asks for it online).
self.addEventListener('install', (event) => {
  const fresh = (file) => new Request(file, { cache: 'reload' });
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all([
        cache.addAll(FILES.filter((file) => !isOptional(file)).map(fresh)),
        ...FILES.filter(isOptional).map((file) => cache.add(fresh(file)).catch(() => {})),
      ]))
      .then(() => self.skipWaiting()),
  );
});

// Clear out saved files from any older version of this worker, and start
// looking after the app right away. Only this app's own caches: sibling apps
// share the web address (glee-builds.github.io) and so its cache storage.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith('tadpole-tales-') && name !== CACHE)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Ask the internet for the newest copy and save it; if that fails, use the saved copy. */
async function newestOrSaved(request) {
  const cache = await caches.open(CACHE);
  try {
    // `no-cache` checks with GitHub every time (a quick "has this changed?"),
    // instead of using a copy the browser kept for up to 10 minutes.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(request, { ignoreSearch: true })
      // Opening the app itself (any address) offline: show the saved app.
      ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (saved) return saved;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only this app's own files. (The app makes no other requests anyway.)
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(newestOrSaved(request));
});
