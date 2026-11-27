# Phase 1 plan: write and keep a book

One note per task. Each task is one pull request, built in this order: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10 (1.2, tests on GitHub, is done). Read `CLAUDE.md` first; its rules win. A task touches only the files listed for it. Names below are exact: other tasks call them, so don't rename them. If a task needs something not listed here, add it in the same pull request and update this file.

Every task: `node --test tests/` and `node tests/screens.mjs` pass, the privacy scan in `CLAUDE.md` finds nothing about a person, any new file the app loads is in `FILES` in `sw.js`, and new decisions go in `docs/decisions.md`.

## Shared shapes

**Typing state** (`src/typing.js`, task 1.3). Plain object, never changed in place; every function returns a new one.

```js
{ text: 'Dot swam', cursor: 8, shift: false, limit: 300 }
// cursor: 0..text.length, the gap the next letter goes into
```

**Book record** (`src/book.js`, task 1.5). Saved as-is in IndexedDB and in the backup file.

```js
{
  format: 1,                 // BOOK_FORMAT; bump only with an upgrade step in upgradeBook
  id: 'b-2f9c…',             // from newId() in book.js (crypto.randomUUID, or random bytes before Safari 15.4), passed in by the caller
  created: 1764200000000,    // ms since 1970 (Date.now())
  changed: 1764200000000,
  finished: false,
  title: '',                 // set at "Finish" (Phase 2)
  cover: null,               // Phase 2: { sticker: 'frog' }
  pages: [ { text: '', stickers: [] } ],   // 1 to 12 pages
}
// a sticker (Phase 2): { id: 'frog', x: 0.5, y: 0.5, size: 1 }, x and y are parts of the 4:3 picture
```

**Backup file** (task 1.8): `tadpole-tales-backup-YYYY-MM-DD.json`.

```js
{ app: 'tadpole-tales', backup: 1, made: '2026-11-27T10:00:00.000Z',
  author: '', progress: {}, books: [ /* book records */ ] }
// backup: BACKUP_FORMAT. No recordings, ever.
```

## 1.1 Grown-up page and device check (Opus)

Files: `src/grownup.js` (new), `src/app.js`, `index.html`, `styles.css`, `sw.js`, `tests/screens.mjs`, `docs/decisions.md`, `README.md`.

Exports from `src/grownup.js`:
- `holdToOpen(button, onOpen, ms = 2000)`: copy Little Pond's hold (pointerdown starts a timer; up, leave or cancel stops it; no context menu; a keyboard click with `event.detail === 0` opens it).
- `showGrownup(root, { onBack })`: draws the page into `root`. Phase 1 shows the device check and a back button. 1.8 adds backup and restore here.
- `DEVICE_CHECKS`: a list of `{ name, run }`, and `runCheck(check)` resolves `{ name, ok, detail }` and never rejects (it catches errors and gives up after 30 seconds). Each check is started by its own tap on the page, because speech and sound only work inside a tap (changed from the first plan's single `runDeviceCheck()`, which would have run speech and playback outside the tap on iOS). The checks: save and reread a record in a throwaway IndexedDB database (then delete it); `navigator.storage.persist()`; Home Screen or browser tab; speak one sentence with `speechSynthesis` and count `boundary` events with `name === 'word'`; record 3 seconds with `MediaRecorder` (and which audio types it supports); play that recording back; `navigator.canShare({ files: [new File(['x'], 'x.json')] })`; the browser's `navigator.userAgent`. The page shows each result as ✓ or ✗ with words, and a "Copy results" text block.
- `INSTALL_NOTE` ("Add to Home Screen to keep books safe.") and `isInstalled()`: the bookshelf shows the note when `!isInstalled()`.
- `askFirst(label, question, yesLabel, onYes, extras = [])`: a button that asks a second time; `extras` are put in the question (1.8 puts "Back up first" in start over's).
- The page also deletes a book (`deleteBook`) and starts over (`startOver`), each through `askFirst`.

Hold button: a small corner button on the bookshelf. The page is not a writer screen, so `<input type="file">` is allowed there later.

Done when: holding for 2 seconds opens the page, a tap does not; the check lists every item in headless Chrome with no logged error (recording may say "not allowed"); the screen test checks both. The owner runs it on each device and the results go in `docs/decisions.md` (a later step; leave a row saying "waiting for results").

## 1.3 Typing (Opus)

Files: `src/typing.js`, `tests/typing.test.js`.

Exports: `LIMIT = 300`, `startTyping(text = '', limit = LIMIT)` (cursor at the end), `typeKey(state, char)`, `backspace(state)`, `toggleShift(state)`, `moveCursor(state, index)`, `newLine(state)`, `isFull(state)`.

Rules: one character per key; the keyboard sends only single plain characters (no emoji), so `text.length` is the character count. Shift capitalises the next letter, and is used up by the next character of any kind. Backspace and moving the cursor leave shift as it is. Nothing is added at the limit (shift stays on). Text longer than the limit passed to `startTyping` is kept whole, never cut; only deleting is possible until it is under. `moveCursor` clamps to `0..text.length`.

Done when: tests cover odd orders (delete at the start, type at the limit, cursor in the middle, shift then backspace, new line counts toward the limit).

## 1.4 Keyboard and writing area (Opus)

Files: `src/keyboard.js`, `styles.css`, `sw.js`, `src/app.js` (temporary demo), `tests/screens.mjs`, `docs/decisions.md`.

Export: `mountWriter(parent, { text = '', limit = LIMIT, label = 'Your words', onChange })` adds a writing area and the keyboard to `parent` and returns `{ getText(), setText(text), remove() }`. `onChange(text)` runs after every change. `parent` must be a flex column that fills the screen; the writing area grows to fill what the keyboard leaves.

Keys act on `pointerdown` (with `preventDefault`), and the click that follows a touch is skipped; a click with no touch before it (Enter or Space on a focused key, a screen reader) presses the key. Restored text may hold an emoji: it is drawn as one span and the cursor (UTF-16 units) never lands inside it.

DOM other tasks and tests may rely on: `.writing` (the drawn text, `role="textbox"`, `aria-readonly="true"`, its `aria-label` is the label, its text is the writer's text), `.writing .cursor`, `.keyboard`, and each key a `<button>` with `data-key` (`a`…`z`, `shift`, `backspace`, `space`, `enter`, and the punctuation itself).

Done when: see the pull request; the screen test presses keys, taps to move the cursor, and checks there is no text field.

## 1.5 Book (Sonnet)

Files: `src/book.js`, `tests/book.test.js`.

Exports: `BOOK_FORMAT = 1`, `MAX_PAGES = 12`, `newBook(id, now)`, `addPage(book, after, now)` (new empty page after index `after`; returns the book unchanged at 12 pages), `canAddPage(book)`, `removePage(book, index, now)` returns `{ book, removed: { page, index } }` (never removes the last page: returns `{ book, removed: null }`), `putBackPage(book, removed, now)` (puts it back at `index`, or at the end if that's past the end; unchanged at 12 pages), `setPageText(book, index, text, now)`, `isBlank(book)` (every page has no text and no stickers), `upgradeBook(record)` (returns a format-1 book, keeping every field it doesn't know on the book and each page, turning `title` and page `text` into strings, and keeping every page even past 12; a record with a format above `BOOK_FORMAT` is returned whole and unchanged; throws `Error('not a book')` without a non-empty string `id`, or, below a newer format, without a `pages` array). Added in the Phase 1 review: `isNewer(book)` (true for a newer format: the shelf shows it with "Made with a newer version — tap Refresh", nothing opens or changes it) and `newId()`.

Every function returns a new book and sets `changed` to `now`; none changes the one passed in. The removed page is kept by the page screen only while the book is open, never saved.

Done when: tests cover each function, including the 1 and 12 page edges and that inputs are not changed.

## 1.6 Store and saving (Opus)

Files: `src/store.js`, `src/ui.js` (`saveMark`), `src/app.js` (the 1.4 demo saves what is typed), `styles.css`, `sw.js`, `tests/screens.mjs`. No `tests/store.test.js`: nothing in `store.js` runs without IndexedDB, so the screen test covers it.

Database `tadpole-tales`, version 1, stores: `books` (keyPath `id`), `recordings` (keyPath `id`, empty until Phase 4), `settings` (keyPath `key`, records `{ key, value }`).

Exports:
- `loadBooks()`: `Promise<Book[]>`, every book through `upgradeBook`. Rejects if the database can't be read; the caller must then show "couldn't open your books", never an empty shelf. A record that fails `upgradeBook` is kept in the database and left off the list.
- `saveBook(book)`: `Promise<void>`. On failure it reopens the database and tries once more, then rejects.
- `deleteBook(id)`, `startOver()` (empties every store and every spare copy), `getSetting(key)` (resolves `undefined` if not set), `setSetting(key, value)`. Keys used: `author`, `progress`, `lastBackup` (ISO date), `tellIt` (boolean).
- `saveSoon(book)`: saves 1 second after the last call. `saveNow()`: saves at once whatever is waiting, then waits for any save already under way, and resolves `true` if everything is saved, `false` if not (called on `visibilitychange` to hidden and `pagehide`, which `store.js` listens for itself). Each read or write gives up after 5 seconds, so no caller waits for ever.
- Spare copies, one per book: `saveSoon` also writes `localStorage['tadpole-tales.spare.<id>'] = JSON.stringify(book)` straight away, and removes it once that book saves (the bare `tadpole-tales.spare` key from before is still read). Books waiting to be saved are kept per id too, so a failed save of one book is never dropped when another is typed in. `loadBooks` puts it back when its `changed` is newer than the stored copy (or the book isn't stored), and saves it; the spare is cleared only after that save works. (Changed from the first plan: there is no `takeSpare()`, because clearing the spare before it was saved could lose it.)
- `onSaveState(callback)`: calls `callback('saved' | 'saving' | 'not-saved')` at once and on each change; returns a function that stops it. The page screen shows the "not saved" mark: `saveMark()` in `src/ui.js` returns `{ node, update }`, used as `onSaveState(mark.update)`.
- Writes go one at a time in order, so a retried older save can't land on top of a newer one.
- `askToPersist()`: `navigator.storage.persist()` if it exists; resolves `true` or `false`.

Done when: a screen test saves, reloads and finds the book; a forced failure (the test replaces `IDBDatabase.prototype.transaction` in the page, so `store.js` has no test hook) shows the retry working and the "not saved" mark.

## 1.7 Bookshelf, page screen, reading view (Sonnet)

Files: `index.html`, `styles.css`, `src/app.js`, `src/reading.js` (new), `sw.js`, `tests/screens.mjs`. Remove the 1.4 demo.

Screens by `location.hash`: `''` bookshelf, `#book/<id>/<page>` page screen (Write mode), `#read/<id>` reading view, `#grown-ups`.
- Bookshelf: books from `loadBooks()`, unfinished first, newest `changed` first; "Make a new book" makes `newBook(newId(), Date.now())`. If `!matchMedia('(display-mode: standalone)').matches && !navigator.standalone`, show "Add to Home Screen to keep books safe."
- Page screen: back, "Page n of m", the picture area (empty box, 4:3, shrinks first), `mountWriter` with the page text, add page, remove page (with put back until leaving), previous and next page, "Finish". Every change calls `saveSoon(book)`. When `isFull`, show "Add a page".
- `src/reading.js` exports `showReading(root, book, { onClose })`: one page at a time, the words as typed, previous and next.

Done when: every screen fits 375 x 667 with no scrolling at all three sizes.

## 1.8 Backup and restore (Opus)

Files: `src/book.js` (add), `tests/backup.test.js`, `src/grownup.js`, `styles.css`, `tests/screens.mjs`, `docs/decisions.md`. (`sw.js` needs nothing new: no new file.)

Exports added to `src/book.js`: `BACKUP_FORMAT = 1`, `makeBackup({ books, author, progress }, now)` returns the backup object, `backupName(now)` returns `tadpole-tales-backup-YYYY-MM-DD.json`, `readBackup(text)` returns `{ books, author, progress, unreadable }` (every book through `upgradeBook`; `unreadable` counts books in the file that failed it, so one bad book doesn't block the rest; added to the first plan) or throws `Error` with a short grown-up message for bad JSON, another app's file, or a newer format; `mergeBooks(shelf, incoming)` returns `{ add: Book[], skipped: number }`: only books whose `id` is not on the shelf; it never changes or removes a shelf book.

Grown-up page: the backup file is made ahead, when the page draws and after each change, so the share sheet opens inside the tap (iOS refuses it after a wait). "Back up" saves with `navigator.share({ files })` when `navigator.canShare` accepts the file, else a download link; then `setSetting('lastBackup', …)` and shows that date. "Restore" uses `<input type="file" accept=".json,application/json">`, `readBackup`, `mergeBooks`, then `saveBook` each added book and says how many were added. Delete a book and start over, each asking a second time; start over offers a backup first.

Done when: tests restore twice (second adds nothing), restore an old-format file, and reject a broken file without touching the shelf.

## 1.9 Screen check and device checklist (Sonnet)

Files: `tests/screens.mjs`, `docs/device-checks.md`.

Press the app's keys (`[data-key]`) to type a 3-page book, reload, find it on the shelf, open the reading view and read every page's words. Fail if any `input, textarea, [contenteditable]` is on a writer screen. Check every screen fits at all three sizes. Repeat the open-from-shelf part with the server stopped (offline). `docs/device-checks.md`: a short list for the owner on each device: type and move the cursor, hold backspace, close the app mid-sentence and reopen, back up and restore on the other device, run the device check.

Done when: green on GitHub; breaking `saveSoon` makes it fail.

## 1.10 Extra tests (Haiku)

Files: `tests/*.test.js` only. More cases for `typing.js` and `book.js` (long text, many new lines, every punctuation key), using only the exports above. No changes to `src/`. If a test finds a bug, stop and report it instead of fixing it.
