// lessons.mjs: the lesson features, with the real data/lessons.json and
// data/examples.json: the lesson card, "Plan your story", the reminder and idea
// cards on the page screen, the example story with "Find it", and the second shelf; and the
// no-lessons case (those two files are missing: the app behaves as it did before lessons).
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import { evaluate, waitFor, settle, HOME, open, press, typed, tapOn, tapButton, noFields, fitProblem, STORE, saveNow, shot, lessonFiles } from './lib.mjs';

const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
const hashIs = (start) => waitFor(`location.hash.startsWith(${JSON.stringify(start)})`, 3);
const SHOWS = (selector) => `document.querySelector(${JSON.stringify(selector)}) !== null`;
const width = () => evaluate('innerWidth');
const books = () => evaluate(`(async () => { ${STORE} return (await store.loadBooks()).map((b) => ({ plan: b.plan, lesson: b.lesson, finished: b.finished })); })()`);
const fresh = async () => { await open('', HOME); await evaluate(`(async () => { ${STORE} await store.startOver(); })()`); await open('', HOME); };

/** The whole path: shelf, card, example, planning, page screen with reminder and ideas. */
export const tryLessons = async () => {
  await fresh();
  if (!await waitFor(`document.querySelector('.shelf-heading')?.textContent.includes("Tadpole's books")`, 3)) return 'no "Tadpole\'s books" shelf with lessons';
  if (!await waitFor(`document.querySelectorAll('.example-card').length === 1`, 3)) return 'only lesson 1\'s example should be on the second shelf at the start';
  if (!(await text('.example-card')).includes("Dot's Snow Friend")) return 'the second shelf lacks lesson 1\'s example story';
  await settle();
  const w = await width();
  if (await fitProblem()) return `the shelf with lesson 1's story: ${await fitProblem()}`;
  await shot('shelf-lessons', w);

  // Start a book: the lesson card comes first.
  await tapOn('.go');
  if (!await waitFor(SHOWS('.lesson-card'), 3)) return 'Make a new book did not show the lesson card';
  const card = await text('.lesson-card');
  for (const part of ['Beginning, middle, end', 'Every story starts', 'Before', 'Dot planted a seed.', 'After', 'At last, a tall sunflower grew!']) {
    if (!card.includes(part)) return `the lesson card lacks "${part}"`;
  }
  if (await evaluate(`!document.querySelector('.back') || ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('Look at an example')) || ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('Try it in your book'))`)) return 'the card lacks its buttons';
  if (await fitProblem()) return `the lesson card: ${await fitProblem()}`;
  if (!await noFields()) return 'a text field on the lesson card';
  await shot('lesson-card-lessons', w);

  // Look at an example: read it, find it (a page), any tap lights the place, Done returns to the card.
  await tapButton('Look at an example');
  if (!await waitFor(`document.querySelector('.read-page') && document.querySelector('.screen-title')?.textContent === "Dot's Snow Friend"`, 3)) return 'the example story did not open';
  if (await evaluate(`document.querySelectorAll('.read-art .sticker').length`) < 1) return 'the example story shows no stickers';
  if (!await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Read to me')) || document.querySelector('.read-voice').hidden`)) return 'no Read to me';
  if (await fitProblem()) return `the example story: ${await fitProblem()}`;
  await tapButton('Find it');
  if (!await waitFor(`document.querySelector('.find-prompt')?.textContent === 'Tap the page where the middle starts.'`, 3)) return 'the find prompt is wrong';
  if (await evaluate(`document.querySelectorAll('.find-tile').length`) !== 3) return 'the page find shows no 3 tiles';
  if (await fitProblem()) return `the find step: ${await fitProblem()}`;
  await tapOn('.find-tile', 2); // not the answer (page 2 of 3 is)
  if (!await waitFor(`document.querySelector('.find-prompt').textContent.includes("Here's where I see it.")`, 3)) return 'no "Here\'s where I see it."';
  if (await evaluate(`[...document.querySelectorAll('.find-tile')].map((t) => t.classList.contains('found')).join()`) !== 'false,true,false') return 'the lit-up page is not page 2';
  if (await evaluate(`document.body.textContent.match(/wrong|incorrect|try again/i) !== null`)) return 'the find step says something is wrong';
  await shot('example-find-lessons', w);
  await tapButton('Done');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Lesson 1'`, 3)) return 'Done did not go back to the lesson card';

  // Try it: Plan your story, five questions, one at a time.
  await tapButton('Try it in your book');
  if (!await waitFor(`document.querySelector('.plan-question')?.textContent === 'Who is in your story? Give them a name.'`, 3)) return 'planning did not start with the first question';
  if (!await noFields()) return 'a text field on the planning screen';
  if (await fitProblem()) return `planning: ${await fitProblem()}`;
  if (await evaluate(`[...document.querySelectorAll('button')].filter((b) => b.textContent.includes('Skip')).map((b) => b.textContent.trim()).join('|')`) !== 'Skip planning|Skip ›') return 'planning lacks "Skip planning" and a skip for this question';
  await press('p', 'i', 'p');
  if (!(await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Next ›')`))) return 'with an answer, the button should say Next';
  await shot('plan-question-lessons', w);
  await tapButton('Next');
  if (!await waitFor(`document.querySelector('.plan-question')?.textContent === 'Where does your story happen?'`, 3)) return 'Next did not show question 2';
  if (await typed() !== '') return 'question 2 starts with words in it';
  await tapButton('Skip ›'); // leave "where" empty
  await waitFor(`document.querySelector('.plan-question')?.textContent === 'What does your character want?'`, 3);
  await press('t', 'o', 'space', 'f', 'l', 'y');
  // Close mid-planning: what was typed is kept, as a book on the shelf.
  await tapOn('.back');
  if (!await waitFor(`document.querySelectorAll('.book-card.unfinished').length === 1`, 3)) return 'closing mid-planning left no book on the shelf';
  await saveNow();
  const [saved] = await books();
  if (JSON.stringify(saved.plan) !== '{"who":"pip","want":"to fly"}' || saved.lesson !== 'beginning-middle-end') return `the saved plan is ${JSON.stringify(saved)}`;

  // Reopen: the page screen, with the reminder and the idea cards; nothing is shown twice.
  await tapOn('.book-card.unfinished .book-open');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'the book did not open';
  if (!await waitFor(SHOWS('.lesson-bar'), 3)) return 'the page screen has no reminder row';
  if (await text('.lesson-reminder') !== '📖Beginning, middle, end') return `the reminder says "${await text('.lesson-reminder')}"`;
  if (await evaluate(`document.querySelector('.ideas-panel').hidden`) !== true) return 'the idea cards start open';
  await tapOn('.ideas-button');
  if (await evaluate(`document.querySelector('.ideas-panel').hidden`)) return 'Ideas did not open the idea cards';
  const ideas = await evaluate(`[...document.querySelectorAll('.idea-card')].map((c) => c.textContent).join('|')`);
  if (ideas !== '🐸 Whopip|⭐ Wantsto fly') return `the idea cards say "${ideas}"`;
  if (await evaluate(`document.querySelector('.keyboard').getBoundingClientRect().bottom > innerHeight`)) return 'the keys were pushed off the screen';
  await settle();
  await shot('page-ideas-lessons', w);
  await tapOn('.ideas-button');
  if (!await evaluate(`document.querySelector('.ideas-panel').hidden`)) return 'Ideas did not close the cards again';
  if (await fitProblem()) return `the page with a reminder: ${await fitProblem()}`;
  await shot('page-reminder-lessons', w);
  await press('h', 'i');
  // The reminder opens the lesson card; "Try it in your book" comes back to this page.
  await tapOn('.lesson-reminder');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Lesson 1'`, 3)) return 'the reminder did not open the lesson card';
  await tapButton('Try it in your book');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Try it did not return to the page';
  if (await typed() !== 'hi') return `the page holds "${await typed()}" after the lesson card`;
  return '';
};

/** Skip planning, finish planning, the sentence kind of find, the second shelf with more lessons open. */
export const tryLessonPaths = async () => {
  await fresh();
  const cards = () => evaluate(`document.querySelectorAll('.book-card.unfinished').length`);
  // "Skip planning": straight to writing, no idea cards, and no book saved until something is written.
  await tapOn('.go');
  await waitFor(SHOWS('.lesson-card'), 3);
  await tapButton('Try it in your book');
  await waitFor(SHOWS('.plan-question'), 3);
  await tapButton('Skip planning');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Skip planning did not go to writing';
  if (await evaluate(`document.querySelector('.ideas-button')`) !== null) return 'idea cards offered with no plan';
  if (await evaluate(`document.querySelector('.lesson-reminder')`) === null) return 'no reminder on the page';
  await tapOn('.back');
  await waitFor(HOME, 3);
  await saveNow();
  if (await cards() !== 0) return 'a book nobody wrote in was saved';

  // All five questions: the last says "Start writing"; the answers are on the book, cut to 40 characters.
  await tapOn('.go');
  await waitFor(SHOWS('.lesson-card'), 3);
  await tapButton('Try it in your book');
  for (let i = 0; i < 4; i++) {
    await waitFor(`document.querySelector('.plan-count')?.textContent === 'Idea ${i + 1} of 5'`, 3);
    if (i === 0) await press(...'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq'.split('')); // 43 letters
    await tapButton(i === 0 ? 'Next' : 'Skip ›');
  }
  if (!await waitFor(`document.querySelector('.plan-count')?.textContent === 'Idea 5 of 5'`, 3)) return 'did not reach question 5';
  if (await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Start writing'))`) !== true) return 'the last question does not say Start writing';
  await press('o', 'w', 'l');
  await tapButton('Start writing');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Start writing did not go to the page';
  await saveNow();
  const [one] = await books();
  if (one.plan.who.length !== 40 || one.plan.ending !== 'owl' || Object.keys(one.plan).join() !== 'who,ending') return `the saved plan is ${JSON.stringify(one.plan)}`;
  if (await evaluate(`document.querySelectorAll('.idea-card').length`) !== 2) return 'the idea cards are not the two answers';
  await tapOn('.back');
  await waitFor(HOME, 3);

  // More lessons open: their examples join the second shelf; a sentence-kind example lights the sentence.
  await evaluate(`(async () => { ${STORE} await store.setSetting('progress', { lessonsOpened: 3 }); })()`);
  await open('', HOME);
  if (!await waitFor(`document.querySelectorAll('.example-card').length === 3`, 3)) return 'three open lessons should give three example stories';
  await tapOn('.example-card .card-edit', 1); // the lesson button of "Pip and the Stars"
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Lesson 2'`, 3)) return 'a shelf lesson button did not open its card';
  if (!(await text('.lesson-card')).includes('Bo the bear sat by the river.')) return 'the shelf lesson card shows the wrong lesson';
  if (await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Try it'))`)) return 'a lesson reread from the shelf offers "Try it in your book"';
  await tapButton('Look at an example');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Pip and the Stars'`, 3)) return 'the example did not open from the lesson card';
  await tapOn('.read-action');
  if (!await waitFor(`document.querySelector('.find-prompt')?.textContent === 'Tap where Pip wants something.'`, 3)) return 'the sentence prompt is wrong';
  if (await fitProblem()) return `the sentence find: ${await fitProblem()}`;
  const first = await text('.find-sentence');
  await tapOn('.find-sentence', 0); // some other sentence, on page 1
  if (!await waitFor(`document.querySelector('.find-prompt').textContent.includes("Here's where I see it.")`, 3)) return 'no "Here\'s where I see it." after a sentence tap';
  if (await text('.found') !== 'Pip wanted to see the stars up close.👀 Here' || await text('.read-count') !== 'Page 2 of 4') return `the lit sentence is "${await text('.found')}" on "${await text('.read-count')}" (the writer tapped "${first}")`;
  if (await fitProblem()) return `the sentence find, after a tap: ${await fitProblem()}`;
  await shot('example-sentence-lessons', await width());
  await tapButton('Done');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Lesson 2'`, 3)) return 'Done did not return to the lesson card';
  // Skip is there too, and leaves with nothing lit.
  await tapButton('Look at an example');
  await waitFor(SHOWS('.read-action'), 3);
  await tapOn('.read-action');
  await waitFor(SHOWS('.find-prompt'), 3);
  await tapButton('Skip');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Lesson 2'`, 3)) return 'Skip did not leave the find step';
  // A shelf example opens straight to the story, and Close returns to the shelf.
  await open('', HOME);
  await tapOn('.example-card .book-open', 2);
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Tam and the Bridge' || document.querySelector('.read-page')`, 3)) return 'a shelf example did not open';
  await tapButton('Close');
  if (!await waitFor(`document.querySelector('.shelf-heading') !== null && !document.querySelector('.shelf').hidden`, 3)) return 'Close did not return to the shelf';
  return '';
};

/** Every lesson screen fits (phone and tablets), with a saved plan on a book. */
export const tryLessonFits = async () => {
  await fresh();
  await evaluate(`(async () => { ${STORE}
    await store.setSetting('progress', { lessonsOpened: 4 });
    const one = { ...book.setPageText(book.newBook('made-up-lesson-1', 1000), 0, 'Dot planted a seed.', 1000), lesson: 'three-acts',
      plan: { who: 'Pip, a small green frog', where: 'a pond by a tall tree', want: 'to fly like a bird', problem: 'frogs do not have wings', ending: 'an owl gives Pip a ride' } };
    await store.saveBook(one);
  })()`);
  for (const [name, address, ready, after] of [
    ['the longest lesson card', '#lesson/-/three-acts/shelf', 'document.querySelector(".lesson-card") !== null', ''],
    ['a lesson card from the page', '#lesson/made-up-lesson-1/three-acts/0', 'document.querySelector(".lesson-card") !== null', ''],
    ['planning', '#plan/made-up-lesson-1/3', 'document.querySelector(".plan-question") !== null', ''],
    ['the example story', '#example/-/three-acts/direct', 'document.querySelector(".read-page") !== null', ''],
    ['the page find', '#example/-/three-acts/direct', 'document.querySelector(".read-action") !== null', 'find'],
    ['the page with a reminder', '#book/made-up-lesson-1/0', 'document.querySelector(".lesson-bar") !== null', ''],
    ['the page with idea cards open', '#book/made-up-lesson-1/0', 'document.querySelector(".ideas-button") !== null', 'ideas'],
  ]) {
    if (!await open(address, ready)) return `${name} did not draw`;
    await settle();
    if (after === 'find') { await tapOn('.read-action'); await waitFor(SHOWS('.find-tile'), 3); }
    if (after === 'ideas') {
      await tapOn('.ideas-button');
      if (await evaluate(`document.querySelector('.ideas-panel').getBoundingClientRect().bottom > document.querySelector('.keyboard').getBoundingClientRect().top + 1`)) return `${name}: the idea cards cover the keys`;
    }
    const problem = await fitProblem();
    if (problem) return `${name}: ${problem}`;
    if (!await noFields()) return `${name} has a text field`;
  }
  return '';
};

/** A writer who has finished all 4 books: no lesson card, but "Plan your story" is still offered. */
export async function tryPlanAfterLessons() {
  const count = async () => evaluate(`document.querySelectorAll('.pick-lesson').length`);
  const start = async () => {
    await fresh();
    await evaluate(`(async () => { ${STORE} await store.setSetting('progress', { lessonsOpened: 99 }); })()`); // every lesson finished, however many there are
    await open('', HOME);
    await tapOn('.go');
    return waitFor(SHOWS('.pick-none'), 3);
  };
  // Pick a lesson: its card, then planning, then the book keeps that lesson.
  if (!await start()) return `after the last lesson, Make a new book did not ask for a lesson (the address is ${await evaluate('location.hash')})`;
  const { lessons, messages } = await evaluate(`fetch('data/lessons.json').then((r) => r.json())`);
  const lessonCount = lessons.length;
  if (await count() !== lessonCount) return `the picker shows ${await count()} lessons, not ${lessonCount}`;
  const words = await text('.screen');
  const none = await text('.pick-none');
  if (!words.includes(messages.pickLesson ?? 'Pick a lesson to keep in mind') || !none.includes(messages.pickNone ?? 'No lesson this time')) return `the picker says "${words}"`;
  if (await fitProblem()) return `the lesson picker: ${await fitProblem()}`;
  if (await evaluate(`[...document.querySelectorAll('.screen button')].some((b) => b.getBoundingClientRect().height < 48)`)) return 'a picker button is under 48px';
  await shot('pick-lesson', await width());
  await tapOn('.pick-lesson', lessonCount - 1);
  if (!await waitFor(SHOWS('.lesson-card'), 3)) return 'picking a lesson did not show its card';
  const title = await text('.lesson-title');
  await tapButton('Try it in your book');
  if (!await waitFor(SHOWS('.plan-question'), 3)) return 'the card did not go on to planning';
  await tapButton('Skip planning');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Skip planning did not go to writing';
  if (!(await text('.lesson-reminder'))) return `the picked lesson ("${title}") gave no reminder on the page`;
  await press('h', 'i');
  await tapOn('.back');
  await saveNow();
  const picked = (await books())[0]?.lesson;
  if (!picked) return 'the book did not keep the picked lesson';

  // None: straight to planning, no card, no lesson on the book.
  if (!await start()) return 'the picker did not show the second time';
  await tapOn('.pick-none');
  if (!await waitFor(SHOWS('.plan-question'), 3)) return `None did not open planning (the address is ${await evaluate('location.hash')})`;
  if (await evaluate(`document.querySelector('.lesson-card') !== null`)) return 'a lesson card showed after None';
  if (await fitProblem()) return `planning after None: ${await fitProblem()}`;
  await tapButton('Skip planning');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'Skip planning did not go to writing';
  if (await evaluate(`document.querySelector('.lesson-reminder') !== null`)) return 'a reminder showed on a book with no lesson';
  await press('h', 'i');
  await tapOn('.back');
  await saveNow();
  if ((await books())[0]?.lesson) return 'None still left a lesson on the book';
  return '';
}

/** The two files are missing (404): no card, no planning, no second shelf, no errors. */
export async function tryNoLessons() {
  lessonFiles.missing = true;
  try { return await noLessons(); } finally { lessonFiles.missing = false; }
}
async function noLessons() {
  await fresh();
  await evaluate(`(async () => { ${STORE} await store.saveBook({ ...book.setPageText(book.newBook('made-up-none-1', 1000), 0, 'Hi', 1000), lesson: 'beginning-middle-end', plan: { who: 'Pip' } }); })()`);
  await open('', HOME);
  await waitFor(`document.querySelectorAll('.book-card').length === 1`, 3);
  if (await evaluate(`document.querySelector('.shelf-heading, .example-card') !== null`)) return 'a second shelf appeared with no lessons';
  await tapOn('.go');
  if (!await waitFor(SHOWS('.keyboard'), 3)) return 'without lessons, Make a new book should open the page screen';
  if (await evaluate(`location.hash.startsWith('#book/')`) !== true) return `the address is ${await evaluate('location.hash')}`;
  if (await evaluate(`document.querySelector('.lesson-bar, .lesson-reminder, .ideas-button') !== null`)) return 'a reminder or idea cards appeared with no lessons';
  await tapOn('.back');
  await waitFor(HOME, 3);
  // An address for a lesson screen finds no lessons and lands on the shelf.
  for (const hash of ['#lesson/-/beginning-middle-end/shelf', '#plan/made-up-none-1/0', '#example/-/three-acts/direct']) {
    await open(hash, 'true');
    if (!await waitFor(`location.hash === '' && document.querySelector('.go') !== null && !document.querySelector('.shelf').hidden`, 3)) return `${hash} did not land on the shelf`;
  }
  // The book that remembers a lesson still opens as a plain book.
  await open('#book/made-up-none-1/0', SHOWS('.keyboard'));
  if (await typed() !== 'Hi') return 'the book did not open';
  if (await evaluate(`document.querySelector('.lesson-bar') !== null`)) return 'a reminder appeared with no lessons';
  return '';
}
