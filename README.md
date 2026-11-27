# tadpole-tales (Tadpole Tales)

**Tadpole Tales** is the name the writer sees. The repo and web address are `tadpole-tales`.

A place for a young writer to make picture books and learn how stories work. The writer tells a story, writes it in their own words on the app's own keyboard, adds stickers as pictures, and keeps finished books on a bookshelf. It runs on a phone and an older iPad, installs to the home screen, and is meant to work offline. It is a sibling of [Lily Pad](https://github.com/glee-builds/kids-puzzles) and [Little Pond](https://github.com/glee-builds/little-pond) and is built the same way: plain HTML, CSS, and JavaScript, with no framework, no build step, no accounts, and no network requests. Books are saved on the device.

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

To open the home screen in a real browser at phone and iPad sizes (needs Google Chrome):

```bash
node tests/screens.mjs
```

GitHub runs both commands on every pull request, so a failing check shows on the pull request before it is merged.
