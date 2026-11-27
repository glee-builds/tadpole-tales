# tadpole-tales (Tadpole Tales)

**Tadpole Tales** is the name the writer sees. The repo and web address are `tadpole-tales`.

A place for a young writer to make picture books and learn how stories work. It runs on a phone and an older iPad, installs to the home screen, and works offline. It is a sibling of [Lily Pad](https://github.com/glee-builds/kids-puzzles) and [Little Pond](https://github.com/glee-builds/little-pond) and is built the same way: plain HTML, CSS, and JavaScript, with no framework, no build step, no accounts, and no network requests. Books are saved on the device.

What the app does:

- **Bookshelf:** every book is a card. Unfinished books come first. A finished book opens to read.
- **Writing:** the writer types on the app's own keyboard, so the phone's keyboard never appears. A page holds up to 300 characters, and a book up to 12 pages.
- **Stickers:** the writer adds emoji stickers to a page's picture, moves them, and sizes them.
- **Finish:** the writer gives the book a title and a cover, and types an author name once.
- **Read to me:** the device's own English voice reads the book aloud, one sentence at a time. It is hidden if the device has no English voice.
- **Grown-up page:** hold "For grown-ups" on the bookshelf for 2 seconds to back up all books, restore them, delete a book, or start over.

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
