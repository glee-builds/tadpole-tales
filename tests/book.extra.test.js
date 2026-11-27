// More tests for src/book.js: upgrades, page counts over many steps, and inputs left alone.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOK_FORMAT, MAX_PAGES, newBook, addPage, removePage, putBackPage, setPageText, upgradeBook,
} from '../src/book.js';

/** A small seeded random number generator (mulberry32), so a failing run can be repeated. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Freeze an object and everything in it, so any change made in place throws in strict mode. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test('upgradeBook refuses an empty object: it has no id and no pages', () => {
  assert.throws(() => upgradeBook({}), { message: 'not a book' });
});

test('upgradeBook refuses a record from a newer format, even one that is otherwise fine', () => {
  const newer = { ...newBook('b-7', 1000), format: BOOK_FORMAT + 1, title: 'From later' };
  const frozen = JSON.stringify(newer);
  assert.throws(() => upgradeBook(newer), { message: 'newer book' });
  assert.equal(JSON.stringify(newer), frozen);
});

test('upgradeBook keeps the record fields it knows and does not change the record', () => {
  const record = deepFreeze({
    format: 1, id: 'b-3', created: 10, changed: 20, finished: true, title: 'Frog', cover: { sticker: 'frog' },
    pages: [{ text: 'Hi', stickers: [] }],
  });
  const book = upgradeBook(record);
  assert.deepEqual(book, record);
  assert.notEqual(book, record);
});

test('page counts stay between 1 and 12 over many add, remove and restore steps', () => {
  const rand = seeded(7);
  let book = newBook('b-1', 1000);
  let removed = null;
  for (let step = 0; step < 3000; step++) {
    const roll = rand();
    const now = 1000 + step;
    if (roll < 0.4) {
      book = addPage(book, Math.floor(rand() * book.pages.length), now);
    } else if (roll < 0.7) {
      const result = removePage(book, Math.floor(rand() * book.pages.length), now);
      book = result.book;
      if (result.removed) removed = result.removed;
    } else if (removed) {
      book = putBackPage(book, removed, now);
      removed = null;
    }
    assert.ok(book.pages.length >= 1 && book.pages.length <= MAX_PAGES, `page count ${book.pages.length} at step ${step}`);
  }
});

test('removing a page and putting it straight back gives the same pages in the same order', () => {
  const rand = seeded(99);
  for (let round = 0; round < 200; round++) {
    let book = newBook('b-1', 1000);
    const count = 1 + Math.floor(rand() * (MAX_PAGES - 1));
    for (let i = 1; i < count; i++) book = addPage(book, i - 1, 1000);
    book = book.pages.reduce((b, _, i) => setPageText(b, i, `p${i}`, 1000), book);
    const index = Math.floor(rand() * book.pages.length);
    const { book: without, removed } = removePage(book, index, 2000);
    if (!removed) continue; // only the last page cannot be removed; that case is covered elsewhere
    const back = putBackPage(without, removed, 3000);
    assert.deepEqual(back.pages, book.pages, `round ${round}`);
  }
});

test('page functions never change the book or page passed in', () => {
  let book = newBook('b-1', 1000);
  book = setPageText(book, 0, 'one', 1000);
  book = addPage(book, 0, 1000);
  book = setPageText(book, 1, 'two', 1000);
  deepFreeze(book);
  const frozen = JSON.stringify(book);

  const added = addPage(book, 0, 2000);
  const { book: without, removed } = removePage(book, 0, 2000);
  const back = putBackPage(without, removed, 2000);
  setPageText(book, 0, 'changed', 2000);
  upgradeBook(book);

  assert.equal(JSON.stringify(book), frozen);
  assert.equal(added.pages.length, 3);
  assert.equal(back.pages.length, 2);
});
