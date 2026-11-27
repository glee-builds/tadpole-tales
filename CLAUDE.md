# tadpole-tales: working rules for Claude Code

Shared rules for all coding projects are in `../CLAUDE.md`, and they apply here. This file adds this project's rules. The full decision history is in `docs/decisions.md`; when a decision changes, update that file and note why.

## Workflow

- **Never commit directly to `main`.** The first commit was the only exception. All work goes on a branch and reaches `main` through a pull request.
- **Claude merges its own pull requests once the GitHub checks pass.** The owner reviews afterwards. If a check fails, fix it on the same branch; never merge a red pull request.
- **`main` is protected on GitHub:** a pull request with the passing `test` check is required, and force-pushing is not allowed.
- One pull request does one thing.
- This repo is public. Write "the writer", never a name, age, grade, or pronoun, in files, commit messages, branch names, and pull requests. Before pushing, scan with `grep -rn -w -i -E "he|him|his|she|her|son|daughter|year-old" . --exclude-dir=.git --exclude-dir=data --exclude-dir=tools --exclude=*.txt`. It skips the word lists (`data/*.txt`, `tools/`) because they naturally hold ordinary English words like "her" and "son".
- The planning brief lives in `../_briefs/tadpole-tales/` and is never copied into this repo.

## Locked decisions

- **Code:** plain HTML, CSS, and JavaScript ES modules. No framework, no build step, no npm packages.
- **Repo:** public, named `tadpole-tales`. Writers see "Tadpole Tales".
- **Hosting:** GitHub Pages from the root of `main`. Installable to the home screen; works offline.
- **Data:** books are kept in IndexedDB on the device. One writer, no accounts, no network requests.
- **Testing:** Node's built-in test runner (`node --test`).
- **Devices:** a phone, and an older iPad mini (7.9-inch). The app must run on Safari 15.4. Nothing newer in CSS or JavaScript without a fallback.
- **Always light:** the app does not follow the device's dark mode.
- **Writing:** the writer makes up the story and writes the words themself. Spelling never interrupts writing. Offering spelling corrections is only ever at the end of a book.
- **No grammar:** grammar and punctuation are never taught, checked, or corrected.
- **No AI** in the app for now.
- **Pictures:** stickers only. No freehand drawing.

## Design rules

Kids' app rules in `../CLAUDE.md` apply, with three exceptions for this project:

1. **Letter keys are 48px tall but narrower than 48px.** Ten letters cannot be 48px wide on a phone. Keys are as wide as the phone allows (about 34px).
2. **Books are kept in IndexedDB, not `localStorage`.** Books can be large and must not be lost. (A spare copy of the page being typed may sit in `localStorage`.)
3. **Backup and restore use the device's own file screens, on the grown-up page only.**

This project also adds:

- **No text field on writer screens.** No `<input>`, `<textarea>`, or `contenteditable` on any screen the writer uses. The app draws the writing area and keeps the text and cursor itself, with its own on-screen keyboard. This keeps the system keyboard, autocorrect, and paste bubble away.
- Every screen fits a 375 x 667 phone with no scrolling. If room is short, shrink the picture, never the keys.
- No text the writer must read for a game to work, but short on-screen words are fine.

## Repo layout

```
index.html               the one page: the bookshelf's markup; app.js fills it in; links styles.css and src/stickers.css
styles.css               all the app's styles except the picture area
sw.js                    the service worker: lets the app open offline; lists every file to save (FILES)
manifest.webmanifest     the home-screen install settings (name, icons, portrait)
assets/                  the tadpole, the app icon and its PNGs (made with headless Chrome), the font files
data/stickers.json       the sticker list: id, group, label and the device's own emoji
data/lessons.json        the lesson wording: lessons, planning questions, self-check and kind messages (read by lesson-screens.js and finish.js)
data/examples.json       the example story for each lesson, with its "Find it" prompt
data/known-words.txt     words Polish never questions (built by tools/build-words.mjs); data/common-words.txt: the only words Polish may suggest
tools/build-words.mjs    rebuilds data/known-words.txt
src/app.js               starts the app; draws the bookshelf and the page screen (Write and Picture modes);
                         picks the other screens by location.hash
src/ui.js                small helpers: make, button, plural, tapScale (taps under tablet zoom), the "not saved" mark (saveMark)
src/typing.js            the writer's text and cursor, as plain functions
src/keyboard.js          the app's own keyboard and drawn writing area (mountWriter)
src/book.js              a book as plain functions: pages, title (bookTitle), cover, backup file
src/store.js             saving books and Tell it recordings on the device (the only file that uses IndexedDB)
src/stickers.js          the picture area: placing, moving and sizing stickers (mountPicture)
src/stickers.css         styles for the picture area and the sticker tray, grouped by kind (linked from index.html)
src/reading.js           the reading view (showReading): one page at a time, with Read to me
src/lessons.js           the lesson path as plain functions: which lesson is next, the self-check, tips, the find check
src/lesson-screens.js    lesson card, "Plan your story", example story with "Find it", the page screen's reminder and idea cards, the second shelf; loads data/lessons.json and examples.json if they exist
src/lesson-screens.css   styles for those
src/plan.js              a book's plan (planning answers) as plain functions
src/readaloud.js        "Read to me": speaks a book one sentence at a time with the device's voice
src/sentences.js         cuts a page's text into sentences for reading aloud
src/polish.js            spelling suggestions for the Polish step: loadWordLists, wordsToAsk, applySuggestion
src/polish-screen.js     the Polish step's screen ("Spelling check"): loads the word lists when reached, one word at a time
src/voice.js             picks the best English voice on the device; never an online one
src/finish.js            after Finish (showFinish): title, author name, cover, then hear your book, the self-check,
                         one "make it better" job and the kind message (from data/lessons.json, once it is there)
src/grownup.js           the grown-up page, one function per section: device check, Tell it switch, backup and restore, books, start over
src/record.js            Tell it: recording a page (start, stop, isSupported, the 2-minute limit), playing it back, its row on the page screen (mountTellIt)
tests/                   tests for the plain functions (node --test) and tests/screens.mjs (a real browser; its checks are in tests/screens/)
docs/                    decisions.md (the decisions log), phase-1-plan.md (task notes), device-checks.md (the owner's checklist)
.github/                 the tests workflow and the pull request template
README.md                what the app does and how to run it and the tests
.gitignore               files Git ignores (backup files hold the writer's books)
```

## Preview locally

`python3 -m http.server 8020`, then open http://localhost:8020.
