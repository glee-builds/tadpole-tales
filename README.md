# tadpole-tales (Tadpole Tales)

**Tadpole Tales** is the name the writer sees. The repo and web address are `tadpole-tales`.

A place for a young writer to make picture books and learn how stories work. It runs on a phone and an older iPad, installs to the home screen, and works offline. It is a sibling of [Lily Pad](https://github.com/glee-builds/kids-puzzles) and [Little Pond](https://github.com/glee-builds/little-pond) and is built the same way: plain HTML, CSS, and JavaScript, with no framework, no build step, no accounts, and no network requests. Books are saved on the device.

What the app does:

- **Bookshelf:** every book is a card. Unfinished books come first. A finished book opens to read.
- **Writing:** the writer types on the app's own keyboard, so the phone's keyboard never appears. A page holds up to 300 characters, and a book up to 12 pages.
- **Stickers:** the writer adds emoji stickers to a page's picture, moves them, and sizes them.
- **Lessons:** eight lessons, one per finished book. Each has a lesson card and an example story to read, with a "Find it" step that shows where the idea is. Before writing, "Plan your story" asks five questions; "💡 Ideas" on a page shows the answers. The example stories collect on a second shelf, "Tadpole's books". After the last lesson, each new book starts with a pick: one lesson to keep in mind, or none.
- **Finish:** the writer gives the book a title, an author name (the first time only) and a cover. Then "Hear your book", a self-check (tap a page or a sentence; "I don't have one yet" is allowed; never right or wrong), one "make it better" job, a spelling check, and a kind message. Every step can be skipped.
- **Read to me:** the device's own English voice reads the book aloud, one sentence at a time. It is hidden if the device has no English voice.
- **Tell it:** the writer records a page out loud (up to 2 minutes), then plays it back while typing. Off until a grown-up turns it on; hidden on a device that can't record. Recordings stay on the device and are never in a backup.
- **Grown-up page:** hold "For grown-ups" on the bookshelf for 2 seconds to back up all books, restore them, delete a book, start over, or turn on Tell it.

**Keep books safe:** add Tadpole Tales to the Home Screen and open it from there. Books are kept only on the device; removing the app's icon from the Home Screen deletes its books. Back them up from the grown-up page (hold "For grown-ups" on the bookshelf for 2 seconds).

**Live:** https://glee-builds.github.io/tadpole-tales/

## Preview locally

From this folder, run:

```bash
python3 -m http.server 8020
```

Then open http://localhost:8020 in a browser. Press `Ctrl+C` in the terminal to stop the server.

To preview on your phone, connect it to the same Wi-Fi as your Mac and open `http://[your-mac-name].local:8020`.

## Run the tests

From this folder, run:

```bash
node --test
```

This uses Node's built-in test runner. It finds every `*.test.js` file in `tests/` and reports which checks pass.

To open each screen in a real browser at phone and iPad sizes, and try the keys and saving (needs Google Chrome):

```bash
node tests/screens.mjs
```

GitHub runs both commands on every pull request, so a failing check shows on the pull request before it is merged.

**Real devices:** at each phase gate, run the checklist in [docs/device-checks.md](docs/device-checks.md) on a phone and an iPad.

## Word lists (for the spelling "Polish" step)

All three lists are in `data/`, one word per line, and the app saves them once for offline use.

- `data/known-words.txt` (about 198,000 words, 1.9 MB): the words the app treats as spelled right, so it never questions them. Made by `node tools/build-words.mjs` from Webster's Second International Dictionary (1934), the Mac's `/usr/share/dict/web2`. License: public domain. Only 3 to 12 letter words are kept, plus every word in the common list.
- `data/common-words.txt` (about 3,100 words, 21 KB): friendly everyday words, sight words, story words, regular word endings, and contractions. Polish can only suggest words from this list. Written for this app, so no outside license applies.
- `data/extra-known.txt` (53 words): a short hand-written list of words the app treats as spelled right, such as "ok" and "um", which the dictionary list leaves out. Written for this app, so no outside license applies.
