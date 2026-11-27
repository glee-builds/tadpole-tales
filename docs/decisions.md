# Decisions log

Every project decision, when it was made, and why. When a decision changes, don't delete the old row: mark it as replaced and add a new row explaining what changed and why.

| Date | Area | Decision | Reason |
|---|---|---|---|
| 2026-11-27 | Code | Plain HTML, CSS, JavaScript ES modules. No framework, no build step, no packages | Every file stays readable for a beginner |
| 2026-11-27 | Workflow | After the first commit, never commit directly to `main`; every change goes through a branch and a pull request | Keeps `main` working |
| 2026-11-27 | Workflow | Claude merges its own pull requests once GitHub checks pass | The owner asked for it |
| 2026-11-27 | Repo and hosting | Public repo `tadpole-tales`, GitHub Pages from the root of `main`; nothing in the repo describes the writer | Free hosting and privacy |
| 2026-11-27 | Name | Tadpole Tales | Fits the pond family of apps |
| 2026-11-27 | Writing | The writer makes up the story and writes the words themself | The point of the app |
| 2026-11-27 | Spelling | Never interrupts writing; corrections are offered only at the end | Ideas come first |
| 2026-11-27 | Grammar | Never taught, checked, or corrected | Grammar drills do not improve writing |
| 2026-11-27 | AI | None for now | Private and offline first |
| 2026-11-27 | Pictures | Stickers only, no freehand drawing | Keeps the app simple and the pages tidy |
| 2026-11-27 | Text entry | No text field on writer screens; the app draws the text and uses its own keyboard | A real text field brings up the system keyboard, autocorrect, and paste |
| 2026-11-27 | Exception: keys | Letter keys are 48px tall but narrower than 48px | Ten letters cannot be 48px wide on a phone |
| 2026-11-27 | Exception: storage | Books are kept in IndexedDB, not `localStorage` | Books can be large and must not be lost |
| 2026-11-27 | Exception: files | Backup and restore use the device's own file screens, on the grown-up page only | Protects books without any network request |
| 2026-11-27 | Devices | A phone and an older iPad mini; the app must run on Safari 15.4 | Those are the devices in use |
| 2026-11-27 | Look | Always light; does not follow dark mode | Same as the sibling apps |
| 2026-11-27 | Backups | Backup files (`tadpole-tales-backup-*.json`) are ignored by Git | They hold the writer's books |
| 2026-11-27 | Testing on GitHub | Every pull request runs `node --test` and `node tests/screens.mjs` | A broken change is caught before merging |
| 2026-11-27 | Phase 1 plan | Task notes, shared data shapes and exact function names for Phase 1 are in `docs/phase-1-plan.md` | Later tasks are built by other models that read only that note and `CLAUDE.md` |
| 2026-11-27 | Book record | One record per book with `format: 1`, an `id` from `crypto.randomUUID()`, and `stickers: []` and `cover: null` already in place | Phase 2 fills them in without needing a new format |
| 2026-11-27 | Screens | Screens are picked by `location.hash` (`#book/<id>/<page>`, `#read/<id>`, `#grown-ups`) | Same as Little Pond; the back button works |
| 2026-11-27 | Typing | Shift is used up by the next character of any kind (a letter becomes a capital; space and punctuation stay as they are). Backspace and moving the cursor leave shift on. At the 300 limit nothing is added and shift stays on. A new line counts as one character | Predictable: one tap of shift means "the next thing I type", and fixing a slip doesn't lose the capital |
| 2026-11-27 | Typing | Text longer than the limit is kept whole when opened; only deleting works until it is under | A book's words are never cut |
| 2026-11-27 | Keyboard | Rows from the top: three letter rows (shift and backspace beside z to m), the punctuation row `. , ! ? ' "`, then space and new line at the bottom | Space is pressed most, so it sits nearest the thumb, as on a phone's own keyboard |
| 2026-11-27 | Keyboard | Backspace deletes on touch-down, then repeats every 90 ms after half a second held. Other keys act on a normal tap | Holding to keep deleting needs touch-down; a plain tap is what a screen reader sends |
| 2026-11-27 | Cursor | One drawn span per character; a tap picks the nearest line, then the nearest gap on it. The tap is scaled the same way as `across` in Little Pond, so it lands right under the tablet zoom in old and new browsers | No text field allowed, and the iPad shows the phone layout zoomed |
| 2026-11-27 | iPad | Writer screens are a column at most 440px wide; held upright (at least 700 x 900) the column is zoomed 1.3 times, like Little Pond | One layout, scaled up |
| 2026-11-27 | Keyboard demo | "Make a new book" opens a "Try the keys" screen until the page screen (task 1.7) replaces it | So the keyboard can be tried on a device now |
| 2026-11-27 | Book | `setPageText` stores the text as given and never cuts it; the 300 limit is kept by `typing.js` while typing. `upgradeBook` fills missing fields with defaults, keeps at most 12 pages, and gives a record with no pages one empty page | A book's words are never cut; an old or damaged record still opens |
| 2026-11-27 | Book | `removePage` with an index that does not exist returns `{ book, removed: null }`, like removing the only page | Nothing to remove, nothing changes |
| 2026-11-27 | Saving | `src/store.js` is the only file that uses IndexedDB. A change is saved 1 second after the last one and at once when the app goes to the background (`visibilitychange`, `pagehide`). A spare copy of the book being typed goes in `localStorage` at once and is cleared only after that book is saved | iOS can close a home-screen app without warning, before a save finishes |
| 2026-11-27 | Saving | A failed save or open reopens the database and tries once more, then shows "⚠ Not saved" (icon and words). Opening gives up after 5 seconds. Writes go one at a time, in order | Safari can drop the database connection in the background, and some versions never answer an open request |
| 2026-11-27 | Saving | `loadBooks` rejects when the books can't be read, so a screen says so instead of showing an empty shelf. A record that isn't a readable book stays in the database | An empty shelf would look like the books were lost |
| 2026-11-27 | Saving | No `takeSpare()` (it was in the plan): `loadBooks` puts the spare back itself and clears it only after it is saved | Clearing first could lose the spare if that save failed |
| 2026-11-27 | Keyboard demo | The demo saves what is typed as a one-page book (nothing is saved until the first key) | So saving can be tried on a device before the page screen exists |
