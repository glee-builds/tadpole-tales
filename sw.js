// sw.js: the service worker. It lets Tadpole Tales open without internet, and
// keeps the phone from mixing old and new files after an update.
//
// A service worker is a small script the phone keeps between the app and
// the internet. This one works like this:
//   - Online: always ask for the newest copy of each file (so an update
//     shows up right away, all at once), and save that copy.
//   - Offline: use the saved copy.
//   - When it's first installed, it saves every file in FILES, so the app
//     works offline even before it has been opened.
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
  'src/voice.js',
  'src/sentences.js',
  'src/readaloud.js',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon.svg',
  'assets/tadpole.svg',
  'assets/stickers/animals-frog.svg',
  'assets/stickers/animals-duck.svg',
  'assets/stickers/animals-fish.svg',
  'assets/stickers/animals-turtle.svg',
  'assets/stickers/animals-dragonfly.svg',
  'assets/stickers/animals-snail.svg',
  'assets/stickers/animals-bird.svg',
  'assets/stickers/animals-dog.svg',
  'assets/stickers/people-child-pigtails.svg',
  'assets/stickers/people-child-curly.svg',
  'assets/stickers/people-child-bun.svg',
  'assets/stickers/people-child-short.svg',
  'assets/stickers/people-grownup-long-hair.svg',
  'assets/stickers/people-grownup-short.svg',
  'assets/stickers/people-grownup-grey.svg',
  'assets/stickers/people-grownup-bun.svg',
  'assets/stickers/places-tree.svg',
  'assets/stickers/places-house.svg',
  'assets/stickers/places-castle.svg',
  'assets/stickers/places-cave.svg',
  'assets/stickers/places-mountain.svg',
  'assets/stickers/places-pond.svg',
  'assets/stickers/places-lily-pad.svg',
  'assets/stickers/places-boat.svg',
  'assets/stickers/things-ball.svg',
  'assets/stickers/things-key.svg',
  'assets/stickers/things-treasure-chest.svg',
  'assets/stickers/things-crown.svg',
  'assets/stickers/things-book.svg',
  'assets/stickers/things-kite.svg',
  'assets/stickers/things-cake.svg',
  'assets/stickers/things-lantern.svg',
  'assets/stickers/weather-sun.svg',
  'assets/stickers/weather-moon.svg',
  'assets/stickers/weather-star.svg',
  'assets/stickers/weather-cloud.svg',
  'assets/stickers/weather-rain.svg',
  'assets/stickers/weather-rainbow.svg',
  'assets/stickers/weather-snow.svg',
  'assets/stickers/weather-lightning.svg',
  'data/stickers.json',
  'assets/fonts/andika-latin-400-normal.woff2',
  'assets/fonts/andika-latin-700-normal.woff2',
];

// First install: save every file. `cache: 'reload'` skips the browser's own
// short-term copies, so the saved set is all from the same version.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

// Clear out saved files from any older version of this worker, and start
// looking after the app right away.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
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
