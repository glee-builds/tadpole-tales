// screens.mjs: open the app in a real browser and check it draws and works.
//
// It starts the app and opens each of its screens (the bookshelf, the page
// screen, the reading view, the finish step, the grown-up page) at a phone size
// and at two iPad sizes. It fails if a page doesn't draw, logs an error,
// scrolls sideways, or asks for anything from another site. It also taps the
// writer's keys and picture area with real touches, and checks that books save.
//
// Run it with:  node tests/screens.mjs
// It needs Google Chrome (GitHub's test computers have it) and nothing else.
// It is not a *.test.js file, so "node --test" doesn't run it.
//
// This file only says which checks run, and in what order. The checks are in tests/screens/:
//   lib.mjs                          the web server, Chrome, and the helpers every check shares
//   shelf-and-books.mjs              the bookshelf, making and finishing a book, reading, Read to me, Refresh
//   page-keyboard-pictures.mjs       the page screen: keyboard, pictures, and "every screen fits"
//   grownup-backup-security.mjs      saving, the grown-up page, backup, damaged books, the server lock, offline
//   finish-lessons.mjs               after the cover: hear your book, the self-check, the job, the kind message
//   page-fit.mjs                     the page screen fits in every mix of lesson row, Tell it, Ideas and put-back bar
//   tell-it.mjs                      Tell it: recording a page out loud, with a pretend microphone
// To find a check, look for its label below, then for the function it runs.

import { PHONE, TABLETS, page, problems, checked, checkScreen, checkWith, shutDown, withoutLessons } from './screens/lib.mjs';
import { tryBooks, tryNewer, tryFinish, tryReadAloud } from './screens/shelf-and-books.mjs';
import { tryKeyboard, tryStickers, tryFits } from './screens/page-keyboard-pictures.mjs';
import { tryLessons, tryLessonPaths, tryLessonFits, tryPlanAfterLessons, tryNoLessons } from './screens/lessons.mjs';
import {
  trySaving, tryGrownup, tryBackup, tryHostile, tryServerLock, checkOffline, removeDownloads,
} from './screens/grownup-backup-security.mjs';
import {
  tryLessonSteps, tryLessonSkips, tryNotYet, tryCloseAtEachStep, tryOnePage, tryFinishNoLessons,
} from './screens/finish-lessons.mjs';
import { tryTellIt, tryTellItFits } from './screens/tell-it.mjs';
import { tryPageFits } from './screens/page-fit.mjs';

try {
  await checkWith('Test server: nothing outside the repo', tryServerLock);
  await checkScreen('Home (phone)', '');
  await checkWith('Books: make a 3-page book, reload, finish, read it, Refresh saves first', withoutLessons(tryBooks));
  await checkWith('Every screen fits (phone)', withoutLessons(tryFits));
  await checkWith('Read to me: underlines in order, turns the page, Stop, hand-turn, no voice (phone)', tryReadAloud);
  await checkWith('Finish: title, author name, cover, shelf, Edit, close mid-step (phone)', withoutLessons(tryFinish));
  await checkWith('Finish with lessons: saved first, hear, tap a sentence, Do it, finish again, Not now, kind message (phone)', tryLessonSteps);
  await checkWith('Finish with lessons: every step skipped, no voice (phone)', tryLessonSkips);
  await checkWith('Finish with lessons: "I don\'t have one yet", Go back, Carry on, tap two pages (phone)', tryNotYet);
  await checkWith('Finish with lessons: close the app at each step, open again (phone)', tryCloseAtEachStep);
  await checkWith('Finish with lessons: a one-page book has no two-page check (phone)', tryOnePage);
  await checkWith('Finish with no lessons.json: as before lessons (phone)', tryFinishNoLessons);
  await checkWith('Saving: save, reload, spare copies per book, saveNow waits, retry once, "not saved" mark, unreadable books', trySaving);
  await checkWith('A book from a newer version: shown with a note, never opened or changed', tryNewer);
  await checkWith('Damaged books: the good book still shows; page, reading and grown-up screens draw', tryHostile);
  await checkWith('Grown-up page: hold to open, every device check, delete a book, start over', tryGrownup);
  await checkWith('Backup: back up, start over, restore, restore again, broken file', tryBackup);
  await checkWith('Keyboard: type, tap to move the cursor, hold backspace, 300 fit (phone)', withoutLessons(tryKeyboard));
  await checkWith('Lessons: shelf, card, example and find, planning, close mid-planning, reminder and idea cards (phone)', tryLessons);
  await checkWith('Lessons: skip planning, five questions, sentence find, Skip, second shelf grows (phone)', tryLessonPaths);
  await checkWith('Lessons: every lesson screen fits (phone)', tryLessonFits);
  await checkWith('After lesson 4: no card, but "Plan your story" is still offered (phone)', tryPlanAfterLessons);
  await checkWith('No lesson files: no card, no planning, no second shelf, no errors (phone)', tryNoLessons);
  await checkWith('Picture mode: add, drag, two-tap move, bigger, remove, 12 limit, save, reorder pages (phone)', tryStickers);
  await checkWith('Tell it: switch, record, stop, limit, play, again, microphone off, delete with page and book, not in backups, refused, no recorder (phone)', tryTellIt);
  await checkWith('Tell it fits: keys never move; full page, put-back bar, lesson row (phone)', tryTellItFits);
  await checkWith('Page screen fits in every mix: lesson row, Tell it, Ideas, put-back bar, full page (phone)', () => tryPageFits('phone'));
  for (const [tablet, size] of Object.entries(TABLETS)) {
    await page('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: true });
    await checkScreen(`Home (${tablet})`, '');
    await checkWith(`Keyboard (${tablet})`, withoutLessons(tryKeyboard));
    await checkWith(`Picture mode (${tablet})`, tryStickers);
    await checkWith(`Every screen fits (${tablet})`, withoutLessons(tryFits));
    await checkWith(`Tell it fits (${tablet})`, tryTellItFits);
    await checkWith(`Page screen fits in every mix (${tablet})`, () => tryPageFits(tablet));
    await checkWith(`Finish (${tablet})`, withoutLessons(tryFinish));
    await checkWith(`Lesson screens fit (${tablet})`, tryLessonFits);
    await checkWith(`Finish with lessons (${tablet})`, tryLessonSteps);
    await checkWith(`Finish with lessons: two pages, not yet (${tablet})`, tryNotYet);
  }
  await checkOffline(); // last: it stops the server
} catch (error) {
  problems.push(`stopped early: ${String(error.message).split('\n')[0]}`);
} finally {
  removeDownloads();
  await shutDown();
}

if (problems.length) {
  console.error(`\n${problems.length} of ${checked} screens have a problem:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${checked} checks pass: screens draw, fit, log no errors, and the writer's keys, pictures and saving work.`);
process.exit(0); // Chrome's helper programs can hold the script open for minutes after it has finished
