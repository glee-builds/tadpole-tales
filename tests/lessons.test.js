// Tests for src/lessons.js. Run all tests with: node --test
// The lesson data is the real wording in data/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  currentLesson, openLessonAfterFinish, openedLessons, selfCheckFor, tipFor, jobFor, praiseFor, sentencesOf, checkFind, pickOptions, withPickedLesson,
} from '../src/lessons.js';
import { readBackup, makeBackup } from '../src/book.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const lessons = load('lessons.json').lessons;
const examples = load('examples.json');
const book = (...texts) => ({ pages: texts.map((text) => ({ text, stickers: [] })) });
const ids = (list) => list.map((l) => l.number);

test('no progress yet: lesson 1 is current and the only one open', () => {
  assert.equal(currentLesson({}, lessons).number, 1);
  assert.equal(currentLesson(undefined, lessons).number, 1);
  assert.deepEqual(ids(openedLessons({}, lessons)), [1]);
});

test('each finished book opens the next lesson, and the last one ends the path', () => {
  let progress = {};
  for (let n = 1; n < lessons.length; n++) {
    progress = openLessonAfterFinish(progress, lessons, `book-${n}`);
    assert.equal(currentLesson(progress, lessons).number, n + 1);
  }
  progress = openLessonAfterFinish(progress, lessons, 'last');
  assert.equal(currentLesson(progress, lessons), null);
  assert.deepEqual(ids(openedLessons(progress, lessons)), lessons.map((l) => l.number));
  progress = openLessonAfterFinish(progress, lessons, 'more'); // never goes past "all done"
  assert.equal(currentLesson(progress, lessons), null);
  assert.equal(progress.lessonsOpened, lessons.length + 1);
});

test('finishing the same book twice opens one lesson, and another book opens the next', () => {
  const once = openLessonAfterFinish({}, lessons, 'abc');
  const twice = openLessonAfterFinish(once, lessons, 'abc');
  assert.deepEqual(twice, once);
  assert.equal(currentLesson(twice, lessons).number, 2);
  assert.equal(currentLesson(openLessonAfterFinish(twice, lessons, 'def'), lessons).number, 3);
});

test('progress passed in is not changed, and what is stored survives a backup', () => {
  const before = { lessonsOpened: 2 };
  openLessonAfterFinish(before, lessons, 'abc');
  assert.deepEqual(before, { lessonsOpened: 2 });
  const progress = openLessonAfterFinish({}, lessons, 'a-uuid-like-id');
  const back = readBackup(JSON.stringify(makeBackup({ books: [], progress }, 0))).progress;
  assert.deepEqual(back, progress);
});

test('odd saved values count as the start', () => {
  assert.equal(currentLesson({ lessonsOpened: 0 }, lessons).number, 1);
  assert.equal(currentLesson({ lessonsOpened: -3 }, lessons).number, 1);
  assert.equal(currentLesson({ lessonsOpened: 99 }, lessons), null);
});

test('self-check: two pages need two pages with words', () => {
  const one = lessons.find((l) => l.selfCheck.kind === 'two-pages');
  assert.equal(selfCheckFor(one, book('Only page.')), null);
  assert.equal(selfCheckFor(one, book('Words.', '', '   ')), null);
  assert.deepEqual(selfCheckFor(one, book('A.', '', 'B.')).pages, [0, 2]);
  assert.equal(selfCheckFor(one, book('A.', 'B.')).prompt, one.selfCheck.prompt);
});

test('self-check: a sentence check needs some words', () => {
  const sentence = lessons.find((l) => l.selfCheck.kind === 'sentence');
  assert.equal(selfCheckFor(sentence, book('', '  ')), null);
  assert.deepEqual(selfCheckFor(sentence, book('', 'Hi.')).pages, [1]);
});

const [one, two, three, four] = lessons;

test('tip: three "and then" across pages, any case', () => {
  const opened = [one, two, three];
  const b = book('Pip hopped and then ran.', 'AND THEN Pip sat.', 'Pip slept. And then it rained.');
  assert.equal(tipFor(three, b, opened).check, 'and-then');
  assert.equal(jobFor(three, b, opened), three.tip.job);
  assert.equal(tipFor(three, book('and then and then', 'x', 'y'), opened), null); // only two
  assert.equal(tipFor(three, book('and', 'then and', 'then and then x'), opened), null); // not across pages
});

test('tip: under three pages with words, only once lesson 4 is open', () => {
  const short = book('One.', '', 'Two.');
  assert.equal(tipFor(three, short, [one, two, three]), null); // lesson 4 not opened yet
  assert.equal(tipFor(four, short, [one, two, three, four]).check, 'under-three-pages');
  assert.equal(tipFor(four, book('a', 'b', 'c'), [one, two, three, four]), null);
});

test('tip: none for a lesson not opened, and the newest lesson wins', () => {
  const both = book('and then and then and then', 'x');
  assert.equal(tipFor(four, both, [one, two, three]), null);
  assert.equal(tipFor(four, both, [one, two, three, four]).check, 'under-three-pages');
  assert.equal(jobFor(two, book('a', 'b', 'c'), [one, two]), two.job); // no tip: the lesson's job
});

test('praise fills {page} from the first tap, counting from 1', () => {
  assert.equal(praiseFor(one, [0, 2]), 'You gave your story a beginning on page 1.');
  assert.equal(praiseFor(two, 3), 'Your character wanted something on page 4.');
  assert.equal(praiseFor(one, []), null);
});

test('sentencesOf splits one page, and a missing page has none', () => {
  const b = book('Hi. Bye!', '');
  assert.deepEqual(sentencesOf(b, 0).map((s) => s.text), ['Hi.', 'Bye!']);
  assert.deepEqual(sentencesOf(b, 1), []);
  assert.deepEqual(sentencesOf(b, 9), []);
});

test('checkFind matches a page or an exact sentence in every example', () => {
  for (const example of examples) {
    const { find } = example;
    const text = find.kind === 'sentence' ? find.sentence : undefined;
    if (text) assert.ok(sentencesOf(example, find.page).some((s) => s.text === text), `${example.lesson} sentence is on its page`);
    assert.equal(checkFind(example, { page: find.page, text }), true);
    assert.equal(checkFind(example, { page: find.page + 1, text }), false);
    if (text) assert.equal(checkFind(example, { page: find.page, text: 'Something else.' }), false);
  }
});

test('restore merges lesson progress: the larger lessonsOpened, the device\'s own lastFinished unless it has none', async () => {
  const { mergeProgress } = await import('../src/lessons.js');
  // A new device that opened one lesson gets the backup's three.
  assert.deepEqual(mergeProgress({ lessonsOpened: 1 }, { lessonsOpened: 3, lastFinished: 42 }), { lessonsOpened: 3, lastFinished: 42 });
  // A device further along keeps its count and its own last book.
  assert.deepEqual(mergeProgress({ lessonsOpened: 4, lastFinished: 7 }, { lessonsOpened: 2, lastFinished: 42 }), { lessonsOpened: 4, lastFinished: 7 });
  assert.deepEqual(mergeProgress({ lessonsOpened: 2, lastFinished: 7 }, { lessonsOpened: 5, lastFinished: 42 }), { lessonsOpened: 5, lastFinished: 7 });
  // No progress on the device: the backup's, whole; other entries are kept, the device's first.
  assert.deepEqual(mergeProgress(undefined, { lessonsOpened: 2, other: true }), { lessonsOpened: 2, other: true });
  assert.deepEqual(mergeProgress({ other: 1 }, { other: 2 }), { other: 1 });
  // The merge comes out of a real backup file unchanged by readBackup.
  const { progress } = readBackup(JSON.stringify(makeBackup({ books: [], progress: { lessonsOpened: 3, lastFinished: -5 } }, 0)));
  assert.deepEqual(mergeProgress({ lessonsOpened: 1 }, progress), { lessonsOpened: 3, lastFinished: -5 });
});

// Tip checks and the picker use made-up lessons, so they pass with any number of real ones.
const made = (id, check) => ({ id, tip: check && { check, job: `job ${id}` }, job: 'plain' });
const talk = made('talk', 'no-talking');
const dream = made('dream', 'dream-ending');

test('tip no-talking: fires with no speech marks and no speaking words, in any case', () => {
  const opened = [made('a'), talk];
  assert.equal(tipFor(talk, book('Pip sat.', 'Pip slept.'), opened).check, 'no-talking');
  assert.equal(tipFor(talk, book('"Hi," Pip said.'), opened), null);
  assert.equal(tipFor(talk, book('Pip sat.', '\u201CHi!\u201D'), opened), null); // curly marks
  for (const w of ['said', 'ASKED', 'Shouted', 'yelled', 'whispered', 'called']) assert.equal(tipFor(talk, book(`Pip ${w} hello`), opened), null, w);
  assert.equal(tipFor(talk, book('Pip sat. Salad.'), opened).check, 'no-talking'); // a word only has to not be one of them
  assert.equal(tipFor(talk, book('', ' '), opened), null); // nothing written yet
});

test('tip no-talking: says, told, replied and the like count as talking', () => {
  for (const w of ['Pip says hi.', 'Mom told Pip.', 'Pip replied.', 'Pip cried.', 'Pip laughed.', 'Pip whispers. Pip tells Mom.'])
    assert.equal(tipFor(talk, book(w), [talk]), null, w);
});

test('tip dream-ending: not fooled by "it was dream" or "a dreamy day"', () => {
  for (const end of ['it was dream', 'It was a dreamy day.']) assert.equal(tipFor(dream, book(end), [dream]), null, end);
});

test('tip dream-ending: looks only at the last page with words', () => {
  const opened = [dream];
  for (const end of ['It was a dream.', 'It was all a dream.', 'It was just a dream!', 'it was only a dream', 'It was all just a dream.', 'And then I woke up.', 'Then Pip woke up in bed.', 'and then Pip suddenly woke up'])
    assert.equal(tipFor(dream, book('Pip hopped.', end, ''), opened).check, 'dream-ending', end);
  assert.equal(tipFor(dream, book('It was all a dream.', 'Pip hopped home.'), opened), null); // not the last page
  assert.equal(tipFor(dream, book('Pip woke up.', 'Pip ate.'), opened), null);
  assert.equal(tipFor(dream, book('Pip had a dream about frogs.'), opened), null);
});

test('new tips fire only for lessons already opened, and the newest lesson wins', () => {
  const b = book('Pip sat. It was all a dream.');
  assert.equal(tipFor(made('a'), b, [made('a')]), null);
  assert.equal(tipFor(dream, b, [made('a'), talk]), null); // dream not opened: book's lesson not in the list
  assert.equal(tipFor(talk, b, [made('a'), talk]).check, 'no-talking');
  assert.equal(tipFor(talk, b, [made('a'), talk, dream]).check, 'dream-ending');
  assert.equal(jobFor(talk, b, [talk, dream]), 'job dream');
});

test('picker: asked only when every lesson is open and none is current', () => {
  const all = lessons.length + 1;
  assert.deepEqual(pickOptions({}, lessons), []);
  assert.deepEqual(pickOptions({ lessonsOpened: lessons.length }, lessons), []);
  assert.deepEqual(ids(pickOptions({ lessonsOpened: all }, lessons)), lessons.map((l) => l.number));
  assert.deepEqual(pickOptions({ lessonsOpened: all }, []), []);
});

test('picker: the choice becomes book.lesson, None leaves it off, an unknown id is none', () => {
  const options = openedLessons({ lessonsOpened: lessons.length + 1 }, lessons);
  const blank = { id: 'b', pages: [] };
  assert.equal(withPickedLesson(blank, options[1].id, options).lesson, options[1].id);
  assert.equal(withPickedLesson({ ...blank, lesson: options[0].id }, null, options).lesson, undefined);
  assert.equal('lesson' in withPickedLesson(blank, 'nope', options), false);
  assert.equal(withPickedLesson(blank, options[0].id, options).id, 'b');
  assert.equal(blank.lesson, undefined); // the book passed in is not changed
});
