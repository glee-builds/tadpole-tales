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
