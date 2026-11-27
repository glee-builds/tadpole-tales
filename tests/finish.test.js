// Tests for the plain functions in src/finish.js (the steps after Finish). Run all tests with: node --test
// The fixtures are copies of the draft lesson wording; the real file arrives with the wording pull request.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finishLesson, lessonPlan, kindWords, stepsFor } from '../src/finish.js';
import { currentLesson } from '../src/lessons.js';

const data = JSON.parse(readFileSync(new URL('./fixtures/lessons.json', import.meta.url), 'utf8'));
const { lessons } = data;
const book = (id, ...texts) => ({ id, finished: false, pages: texts.map((text) => ({ text, stickers: [] })) });

test('finishing a book gives it the current lesson and opens the next', () => {
  const done = finishLesson(book('a', 'x'), undefined, lessons);
  assert.equal(done.lesson, lessons[0].id);
  assert.equal(currentLesson(done.progress, lessons).id, lessons[1].id);
});

test('a book that already has a lesson keeps it', () => {
  const done = finishLesson({ ...book('a', 'x'), lesson: lessons[2].id }, { lessonsOpened: 1 }, lessons);
  assert.equal(done.lesson, lessons[2].id);
  assert.equal(done.progress.lessonsOpened, 2);
});

test('a finished book finished again (after Edit) opens no lesson, even after another book', () => {
  let progress;
  const a = finishLesson(book('a', 'x'), progress, lessons);
  progress = a.progress;
  progress = finishLesson(book('b', 'y'), progress, lessons).progress; // b is finished last
  const again = finishLesson({ ...book('a', 'x'), finished: true, lesson: a.lesson }, progress, lessons);
  assert.equal(again.progress, progress);
  assert.equal(again.lesson, lessons[0].id);
  assert.equal(progress.lessonsOpened, 3);
});

test('after the last lesson a book gets no lesson and nothing more opens', () => {
  const all = { lessonsOpened: lessons.length + 1 };
  const done = finishLesson(book('z', 'x'), all, lessons);
  assert.equal(done.lesson, null);
  assert.equal(done.progress.lessonsOpened, lessons.length + 1);
});

test('the plan: lesson 1 on a 3-page book has the two-page check and its own job', () => {
  const plan = lessonPlan(lessons, { ...book('a', 'one', 'two', 'three'), lesson: lessons[0].id });
  assert.equal(plan.lesson.id, lessons[0].id);
  assert.equal(plan.check.kind, 'two-pages');
  assert.deepEqual(plan.check.pages, [0, 1, 2]);
  assert.equal(plan.job, lessons[0].job);
});

test('the plan: a one-page book has no two-page check', () => {
  const plan = lessonPlan(lessons, { ...book('a', 'one'), lesson: lessons[0].id });
  assert.equal(plan.check, null);
  assert.equal(plan.job, lessons[0].job);
});

test('the plan: a tip from a lesson after the book\'s own never picks the job', () => {
  const twoPages = { ...book('a', 'one', 'two'), lesson: lessons[2].id }; // under 3 pages: lesson 4's tip, not open for this book
  assert.equal(lessonPlan(lessons, twoPages).job, lessons[2].job);
  const thens = { ...book('a', 'and then and then', 'and then'), lesson: lessons[2].id }; // lesson 3's own tip fires
  assert.equal(lessonPlan(lessons, thens).job, lessons[2].tip.job);
});

test('the plan: no lesson (or one the wording no longer has) means no check and no job', () => {
  for (const lesson of [undefined, null, 'gone']) {
    assert.deepEqual(lessonPlan(lessons, { ...book('a', 'x', 'y'), lesson }), { lesson: null, check: null, job: null });
  }
});

test('the kind message names the first tapped page, else says the book is finished', () => {
  assert.equal(kindWords(data, lessons[0], [2, 4]), lessons[0].praise.replace('{page}', 3));
  assert.equal(kindWords(data, lessons[1], [0]), lessons[1].praise.replace('{page}', 1));
  assert.equal(kindWords(data, lessons[0], []), data.messages.finished);
  assert.equal(kindWords(data, null, [1]), data.messages.finished);
});

test('the steps: as before lessons without the wording; then hear, check, job, kind', () => {
  assert.deepEqual(stepsFor('', null, null), ['title', 'name', 'cover']);
  assert.deepEqual(stepsFor('pip', null, null), ['title', 'cover']);
  assert.deepEqual(stepsFor('pip', data, { check: {}, job: 'x' }), ['title', 'cover', 'hear', 'check', 'job', 'polish', 'kind']);
  assert.deepEqual(stepsFor('pip', data, { check: null, job: null }), ['title', 'cover', 'hear', 'polish', 'kind']);
});
