// Tests for src/plan.js: the plan on a book, and that upgradeBook keeps it.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAN_LIMIT, planOf, setPlanAnswer, ideaCards } from '../src/plan.js';
import { newBook, upgradeBook, isBlank } from '../src/book.js';

const { planning } = JSON.parse(readFileSync(new URL('fixtures/lessons.json', import.meta.url), 'utf8'));

test('an answer is saved on a new book without changing the old one', () => {
  const book = newBook('b-1', 1);
  const next = setPlanAnswer(book, 'who', 'Pip, a small frog', 5);
  assert.deepEqual(next.plan, { who: 'Pip, a small frog' });
  assert.equal(book.plan, undefined);
  assert.equal(next.changed, 5);
});

test('an answer is cut to the limit, and an empty one takes the answer out', () => {
  let book = setPlanAnswer(newBook('b-1', 1), 'where', 'x'.repeat(100), 2);
  assert.equal(book.plan.where.length, PLAN_LIMIT);
  book = setPlanAnswer(book, 'where', '  ', 3);
  assert.deepEqual(book.plan, {});
});

test('planOf ignores a plan that is not a plain object of text', () => {
  assert.deepEqual(planOf({ plan: ['a'] }), {});
  assert.deepEqual(planOf({ plan: 'hi' }), {});
  assert.deepEqual(planOf({ plan: { who: 7, where: '', want: 'to fly' } }), { want: 'to fly' });
  assert.deepEqual(planOf({}), {});
});

test('idea cards follow the questions\' order and skip empty answers', () => {
  const book = { plan: { ending: 'an owl', who: 'Pip', extra: 'not a question' } };
  assert.deepEqual(ideaCards(planning, book).map((card) => [card.id, card.text]), [['who', 'Pip'], ['ending', 'an owl']]);
  assert.deepEqual(ideaCards(planning, newBook('b-1', 1)), []);
});

test('upgradeBook keeps the plan and the lesson, and a plan alone is still a blank book', () => {
  const record = { ...setPlanAnswer(newBook('b-1', 1), 'who', 'Pip', 2), lesson: 'wants-something' };
  const book = upgradeBook(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(book.plan, { who: 'Pip' });
  assert.equal(book.lesson, 'wants-something');
  assert.equal(isBlank(book), true); // app.js saves a book with a plan on its own (see changed() there)
});
