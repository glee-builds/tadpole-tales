// Tests for src/book.js: what a book is.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOK_FORMAT, MAX_PAGES, newBook, addPage, canAddPage, removePage, putBackPage,
  setPageText, isBlank, upgradeBook,
} from '../src/book.js';

/** A made-up book with pages "a", "b", "c"... */
const bookOf = (letters) => {
  let book = newBook('b-1', 1000);
  book = setPageText(book, 0, letters[0], 1000);
  for (let i = 1; i < letters.length; i++) book = setPageText(addPage(book, i - 1, 1000), i, letters[i], 1000);
  return book;
};
const texts = (book) => book.pages.map((page) => page.text).join('');

test('a new book has format 1 and one empty page', () => {
  assert.deepEqual(newBook('b-1', 1000), {
    format: 1, id: 'b-1', created: 1000, changed: 1000, finished: false, title: '', cover: null,
    pages: [{ text: '', stickers: [] }],
  });
  assert.equal(BOOK_FORMAT, 1);
  assert.equal(MAX_PAGES, 12);
});

test('addPage puts an empty page after the given one and does not change the input', () => {
  const book = bookOf('ab');
  const frozen = JSON.stringify(book);
  const next = addPage(book, 0, 2000);
  assert.equal(texts(next), 'a' + '' + 'b');
  assert.equal(next.pages.length, 3);
  assert.equal(next.pages[1].text, '');
  assert.equal(next.changed, 2000);
  assert.equal(JSON.stringify(book), frozen);
});

test('a 13th page is refused: the same book comes back', () => {
  let book = newBook('b-1', 1000);
  while (canAddPage(book)) book = addPage(book, book.pages.length - 1, 1000);
  assert.equal(book.pages.length, 12);
  assert.equal(canAddPage(book), false);
  assert.equal(addPage(book, 0, 2000), book);
});

test('removing the only page is refused', () => {
  const book = newBook('b-1', 1000);
  const result = removePage(book, 0, 2000);
  assert.equal(result.book, book);
  assert.equal(result.removed, null);
});

test('removePage returns the new book and the page with its place', () => {
  const book = bookOf('abc');
  const frozen = JSON.stringify(book);
  const { book: next, removed } = removePage(book, 1, 2000);
  assert.equal(texts(next), 'ac');
  assert.equal(next.changed, 2000);
  assert.deepEqual(removed, { page: { text: 'b', stickers: [] }, index: 1 });
  assert.equal(JSON.stringify(book), frozen);
});

test('putBackPage returns the page to its place', () => {
  const { book, removed } = removePage(bookOf('abc'), 1, 2000);
  assert.equal(texts(putBackPage(book, removed, 3000)), 'abc');
  assert.equal(texts(putBackPage(book, { ...removed, index: 0 }, 3000)), 'bac');
});

test('putBackPage goes to the end if the place is past the end', () => {
  const { book, removed } = removePage(bookOf('abc'), 2, 2000);
  const shorter = removePage(book, 0, 2500).book; // "b"
  assert.equal(texts(putBackPage(shorter, removed, 3000)), 'bc');
});

test('putBackPage is refused at 12 pages', () => {
  const { removed } = removePage(bookOf('ab'), 1, 2000);
  let full = newBook('b-1', 1000);
  while (canAddPage(full)) full = addPage(full, 0, 1000);
  assert.equal(putBackPage(full, removed, 3000), full);
});

test('setPageText changes one page and not the input', () => {
  const book = bookOf('ab');
  const next = setPageText(book, 1, 'Dot swam', 2000);
  assert.equal(next.pages[1].text, 'Dot swam');
  assert.equal(next.pages[0].text, 'a');
  assert.equal(next.changed, 2000);
  assert.equal(book.pages[1].text, 'b');
});

test('isBlank: no words and no stickers on any page', () => {
  assert.equal(isBlank(newBook('b-1', 1000)), true);
  assert.equal(isBlank(setPageText(newBook('b-1', 1000), 0, 'x', 1)), false);
  const withSticker = newBook('b-1', 1000);
  withSticker.pages[0].stickers.push({ id: 'frog', x: 0.5, y: 0.5, size: 1 });
  assert.equal(isBlank(withSticker), false);
});

test('upgradeBook keeps a good book as it is', () => {
  const book = bookOf('ab');
  assert.deepEqual(upgradeBook(book), book);
});

test('upgradeBook fills in missing fields', () => {
  const old = { id: 'b-9', changed: 5, pages: [{ text: 'Hi' }, {}] };
  assert.deepEqual(upgradeBook(old), {
    format: 1, id: 'b-9', created: 5, changed: 5, finished: false, title: '', cover: null,
    pages: [{ text: 'Hi', stickers: [] }, { text: '', stickers: [] }],
  });
});

test('upgradeBook gives a book with no pages one empty page', () => {
  assert.deepEqual(upgradeBook({ id: 'b-9', pages: [] }).pages, [{ text: '', stickers: [] }]);
});

test('upgradeBook refuses a newer format and things that are not books', () => {
  assert.throws(() => upgradeBook({ ...newBook('b-1', 1), format: 2 }), { message: 'newer book' });
  assert.throws(() => upgradeBook({ pages: [] }), { message: 'not a book' });
  assert.throws(() => upgradeBook({ id: 'b-1' }), { message: 'not a book' });
  assert.throws(() => upgradeBook(null), { message: 'not a book' });
});
