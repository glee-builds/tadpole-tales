// real-lessons.mjs: checks that run with the REAL lesson files (data/lessons.json and data/examples.json
// are served, as they are for a writer). The older checks run with the lesson files switched off, so
// these make sure the lesson parts work together with the books, the shelf, the finish steps and the page.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import {
  evaluate, waitFor, settle, HOME, open, touch, tapOn, tapButton, press, typed, cursorAt,
  heading, noFields, fitProblem, STORE, savedTexts, shot,
} from './lib.mjs';

const SHOWS = (selector) => `document.querySelector(${JSON.stringify(selector)}) !== null`;
const SCREEN = (title) => `document.querySelector('.screen-title')?.textContent === ${JSON.stringify(title)}`;
const BOOK_CARDS = `document.querySelectorAll('.book-card:not(.example-card)')`;
const BOOK_CARD = `document.querySelector('.book-card:not(.example-card)')`;
const width = () => evaluate('innerWidth');

/** Start over (no books, no lesson progress), then open the shelf. */
async function fresh() {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  await open('', HOME);
}

/** Tap a finish step's button (Not now, or the top button: Skip, Next, Done) until the shelf shows. */
async function goOnToShelf() {
  for (let step = 0; step < 8; step++) {
    if (await evaluate(`location.hash === ''`)) return true;
    const before = await evaluate(`document.querySelector('.finish-top h1')?.textContent ?? ''`);
    const notYet = await evaluate(`[...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && b.textContent.includes('Not now'))`);
    if (notYet) await tapButton('Not now');
    else await tapOn('.finish-top .pill');
    await waitFor(`location.hash === '' || document.querySelector('.finish-card-more') !== null || (document.querySelector('.finish-top h1')?.textContent ?? '') !== ${JSON.stringify(before)}`, 3);
  }
  return waitFor(`location.hash === ''`, 3);
}

/** A 3-page book made through the lesson card and planning (planning skipped): reload, find it on the shelf, read it, Refresh. */
export async function tryLessonBook() {
  await fresh();
  await tapOn('.go');
  if (!await waitFor(SHOWS('.lesson-card'), 3)) return 'Make a new book did not show the lesson card';
  await tapButton('Try it in your book');
  if (!await waitFor(SHOWS('.plan-question'), 3)) return 'Try it in your book did not start planning';
  await tapButton('Skip planning');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Skip planning did not open the page';
  if (!await evaluate(SHOWS('.lesson-reminder'))) return 'the page has no lesson reminder';

  // Three pages, on the app's keys.
  await press('p', 'i', 'p');
  if (await typed() !== 'pip') return `page 1 holds "${await typed()}"`;
  await tapButton('Add page');
  if (!await waitFor(SCREEN('Page 2 of 2'), 3)) return 'Add page did not open page 2';
  await press('h', 'o', 'p', 's');
  await tapButton('Add page');
  if (!await waitFor(SCREEN('Page 3 of 3'), 3)) return 'Add page did not open page 3';
  await press('h', 'o', 'm', 'e');
  if (await typed() !== 'home') return `page 3 holds "${await typed()}"`;
  await tapOn('.back');
  if (!await waitFor(`${BOOK_CARDS}.length === 1`, 3)) return 'the shelf has no card for the new book';
  const card = await evaluate(`${BOOK_CARD}.textContent`);
  if (!card.includes('Keep going') || !card.includes('3 pages')) return `the card says "${card}"`;

  // Reload: still there, marked "Keep going", and page 1 is saved.
  await open('', `${BOOK_CARDS}.length === 1`);
  if (!await evaluate(`${BOOK_CARD}.textContent.includes('Keep going')`)) return 'after a reload the book is not marked "Keep going"';
  await tapOn('.book-card:not(.example-card)');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'the saved book did not open';
  if (await typed() !== 'pip') return `the saved page 1 holds "${await typed()}"`;

  // Finish: the lesson steps are skipped one by one until the shelf shows the book as finished.
  await tapButton('Finish');
  if (!await waitFor(`location.hash.startsWith('#finish/')`, 3)) return 'Finish did not open the finish steps';
  if (!await goOnToShelf()) return 'skipping the finish steps did not reach the shelf';
  if (!await waitFor(`${BOOK_CARD}?.textContent.includes('Finished')`, 3)) return 'the finished book is not on the shelf';

  // Read it: 3 pages, Next and Previous work, Close goes back to the shelf.
  await tapOn('.book-card:not(.example-card)');
  if (!await waitFor(SHOWS('.read-page'), 3)) return 'a finished book did not open in the reading view';
  if (!await noFields()) return 'a text field is on the reading view';
  const readPage = () => evaluate(`document.querySelector('.read-page').textContent + '|' + document.querySelector('.read-count').textContent`);
  if (await readPage() !== 'pip|Page 1 of 3') return `reading page 1 shows "${await readPage()}"`;
  await tapButton('Next');
  await tapButton('Next');
  if (await readPage() !== 'home|Page 3 of 3') return `reading page 3 shows "${await readPage()}"`;
  await tapButton('Close');
  if (!await waitFor(`location.hash === '' && ${BOOK_CARDS}.length === 1`, 3)) return 'Close did not go back to the shelf';

  // Refresh saves first, then reloads. `window.__same` goes away only when the page reloads.
  await evaluate('window.__same = true');
  await tapOn('.refresh-button').catch(() => {}); // the page may reload while the tap's last frame is drawn
  if (!await waitFor(`window.__same === undefined && document.readyState === 'complete' && (${HOME})`, 10)) return 'Refresh did not reload';
  if (!await evaluate(`${BOOK_CARD}?.textContent.includes('Finished')`)) return 'after Refresh the finished book is not on the shelf';
  if (JSON.stringify(await savedTexts()) !== '["pip"]') return `after Refresh the book holds ${JSON.stringify(await savedTexts())}`;
  return '';
}

/**
 * What is wrong with the shelf's fit, or ''. The page itself may not scroll, and the buttons outside the
 * books list must be on the screen. The books list scrolls inside itself, so its last card must be
 * reachable by scrolling it to the end.
 */
const shelfProblem = () => evaluate(`(() => {
  if (document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth) return 'the page scrolls';
  const list = document.querySelector('.books');
  const buttons = [...document.querySelectorAll('button, a.book-open')].filter((node) => node.offsetParent !== null);
  const low = buttons.filter((node) => !list.contains(node) && node.getBoundingClientRect().bottom > innerHeight + 0.5);
  if (low.length) return 'off the bottom of the screen: ' + low.map((node) => node.textContent.trim()).join(', ');
  const short = buttons.filter((node) => node.offsetHeight < 48);
  if (short.length) return short.length + ' buttons are shorter than 48px';
  list.scrollTop = list.scrollHeight;
  const last = buttons.filter((node) => list.contains(node)).at(-1);
  const reachable = last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 0.5 && list.getBoundingClientRect().bottom <= innerHeight + 0.5;
  list.scrollTop = 0;
  return reachable ? '' : 'the last book cannot be scrolled into view';
})()`);

/** The shelf fits a 375x667 phone with both shelves ("Your books" and "Tadpole's books") and six books. */
export async function tryShelfFits() {
  await fresh();
  await evaluate(`(async () => { ${STORE}
    await store.setSetting('author', 'Pip');
    await store.setSetting('progress', { lessonsOpened: 3 });
    for (let i = 1; i <= 6; i++) {
      const one = book.setPageText(book.newBook('made-up-shelf-' + i, 1000 + i), 0, 'Story ' + i + ' is here.', 1000 + i);
      await store.saveBook(i % 2 ? { ...one, finished: true } : one);
    }
  })()`);
  if (!await open('', `${BOOK_CARDS}.length === 6 && document.querySelectorAll('.example-card').length === 3`)) return 'the shelf did not draw six books and three lesson books';
  if (await heading() !== 'Books by Pip') return `the heading is "${await heading()}"`;
  if (!await evaluate(`document.querySelector('.shelf-heading')?.textContent.includes("Tadpole's books")`)) return 'no "Tadpole\'s books" shelf';
  await settle();
  await shot('shelf-both-books', await width());
  const problem = await shelfProblem();
  return problem ? `the shelf with both shelves: ${problem}` : '';
}

/** Finish with the lesson steps on: title, author name (asked once), cover; then Edit, Finish again, close mid-title and open again. */
export async function tryFinishAndEdit() {
  await fresh();
  await evaluate(`(async () => { ${STORE}
    const one = book.setPageText(book.addPage(book.setPageText(book.newBook('made-up-real-fin', 1000), 0, 'A frog sat down.', 1000), 0, 1000), 1, 'It ended.', 1000);
    await store.saveBook(one);
  })()`);
  if (!await open('#book/made-up-real-fin/0', SHOWS('.keyboard'))) return 'the page screen did not draw';
  await tapButton('Finish');
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.keyboard')`, 3)) return 'no title step';
  await press('t', 'r', 'e', 'e');
  if (await typed() !== 'tree') return `the title holds "${await typed()}"`;
  await tapButton('Next');
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('author name')`, 3)) return 'no author name step on the first book';
  await press('p', 'i', 'p');
  await tapButton('Next');
  if (!await waitFor(`document.querySelector('.finish-cover .tray-sticker') !== null`, 3)) return 'no cover step';
  const tray = await evaluate(`(() => { const box = document.querySelector('.tray-sticker').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await touch(tray.x, tray.y);
  if (!await waitFor(`document.querySelectorAll('.finish-cover .picture .sticker').length === 1`, 2)) return 'a tray tap did not put a sticker on the cover';
  if (!await goOnToShelf()) return 'the steps after the cover did not reach the shelf';
  const shelfNow = `document.querySelector('h1').textContent === 'Books by pip' && document.querySelector('.book-card.finished .cover-title')?.textContent === 'tree' && document.querySelectorAll('.book-card.finished .cover .sticker').length === 1`;
  if (!await waitFor(shelfNow, 3)) return 'the shelf does not show "Books by pip" and the finished cover';

  // Edit opens the pages; Finish again shows the title already typed; close in the middle of it.
  await tapOn('.book-card.finished .card-edit');
  if (!await waitFor(`location.hash === '#book/made-up-real-fin/0' && document.querySelector('.keyboard')`, 3)) return 'Edit did not open the pages';
  await tapButton('Finish');
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.writing .ch')`, 3)) return 'Edit then Finish did not show the title again';
  if (await typed() !== 'tree') return `the title step shows "${await typed()}"`;
  await press('o', 'w', 'l');
  await open('', `${BOOK_CARDS}.length === 1`);
  const kept = await evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); return [one.finished, one.title, one.cover?.stickers.length, await store.getSetting('author')].join('|'); })()`);
  return kept === 'true|treeowl|1|pip' ? '' : `closing mid-title left the book as "${kept}"`;
}

/** The page screen with a lesson row: tapping the writing area still moves the cursor, and the row stays. */
export async function tryTapWithLessonRow() {
  await fresh();
  await evaluate(`(async () => { ${STORE}
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-row', 1000), 0, 'Dot swam', 1000),
      lesson: 'beginning-middle-end', plan: { who: 'Pip, a small green frog' } });
  })()`);
  if (!await open('#book/made-up-row/0', `document.querySelector('.keyboard') !== null && document.querySelector('.lesson-row') !== null`)) return 'the page with a lesson row did not draw';
  if (await typed() !== 'Dot swam') return `the page holds "${await typed()}"`;

  // Just right of the "t": the cursor goes after it, and "s" is typed there.
  const after = await evaluate(`(() => { const box = document.querySelectorAll('.writing .ch')[2].getBoundingClientRect(); return { x: box.right - 2, y: box.top + box.height / 2 }; })()`);
  await touch(after.x, after.y);
  await press('s');
  if (await typed() !== 'Dots swam') return `tapping after "Dot" then "s" gave "${await typed()}"`;

  // The left part of the first letter: the cursor goes before it.
  const before = await evaluate(`(() => { const box = document.querySelector('.writing .ch').getBoundingClientRect(); return { x: box.left + box.width * 0.3, y: box.top + box.height / 2 }; })()`);
  await touch(before.x, before.y);
  if (await cursorAt() !== 0) return `tapping the left of the first letter put the cursor at ${await cursorAt()}`;

  // The empty space below the words: the cursor goes to the end.
  const below = await evaluate(`(() => { const box = document.querySelector('.writing').getBoundingClientRect(); return { x: box.left + box.width - 10, y: box.bottom - 10 }; })()`);
  await touch(below.x, below.y);
  if (await cursorAt() !== 9) return `tapping below the words put the cursor at ${await cursorAt()}, not the end`;

  if (!await evaluate(`document.querySelector('.lesson-row') !== null && document.querySelector('.lesson-row').getBoundingClientRect().height > 0`)) return 'the lesson row went away';
  const problem = await fitProblem();
  return problem ? `the page with a lesson row: ${problem}` : '';
}
