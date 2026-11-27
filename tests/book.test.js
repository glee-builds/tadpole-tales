// Tests for src/book.js: what a book is.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOK_FORMAT, MAX_PAGES, newBook, addPage, canAddPage, removePage, putBackPage,
  setPageText, setPageStickers, movePage, isBlank, upgradeBook, setTitle, setCoverStickers,
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

test('upgradeBook keeps a newer format whole and refuses things that are not books', () => {
  const newer = { ...newBook('b-1', 1), format: 2 };
  assert.equal(upgradeBook(newer), newer);
  assert.throws(() => upgradeBook({ pages: [] }), { message: 'not a book' });
  assert.throws(() => upgradeBook({ id: 'b-1' }), { message: 'not a book' });
  assert.throws(() => upgradeBook(null), { message: 'not a book' });
});

test('title and cover are set without changing the book passed in', () => {
  const book = newBook('b-1', 1000);
  const stickers = [{ id: 'frog', x: 0.5, y: 0.5, size: 1 }];
  const next = setCoverStickers(setTitle(book, 'The Big Rock', 2000), stickers, 3000);
  assert.deepEqual([next.title, next.cover, next.changed], ['The Big Rock', { stickers }, 3000]);
  assert.deepEqual([book.title, book.cover], ['', null]);
});

test('upgradeBook mends a title and cover that are the wrong shape, and keeps good ones', () => {
  const odd = upgradeBook({ id: 'b-9', pages: [], title: 7, cover: { stickers: 'x' } });
  assert.deepEqual([odd.title, odd.cover], ['', null]); // only text is kept as a title
  assert.equal(upgradeBook({ id: 'b-9', pages: [], title: { x: 1 } }).title, '');
  const good = { id: 'b-9', pages: [], title: 'Pip', cover: { stickers: [{ id: 'frog', x: 0.5, y: 0.5, size: 1 }] } };
  const kept = upgradeBook(good);
  assert.deepEqual([kept.title, kept.cover], ['Pip', good.cover]);
  assert.equal(kept.format, 1);
});

test('setPageStickers changes only that page and not the book passed in', () => {
  const two = addPage(newBook('b-1', 1), 0, 2);
  const stickers = [{ id: 'frog', x: 0.5, y: 0.5, size: 1 }];
  const next = setPageStickers(two, 1, stickers, 3);
  assert.deepEqual(next.pages[1].stickers, stickers);
  assert.deepEqual(next.pages[0].stickers, []);
  assert.deepEqual(two.pages[1].stickers, []);
  assert.equal(next.changed, 3);
});

test('upgradeBook gives a page saved before stickers an empty sticker list, and keeps stickers', () => {
  const stickers = [{ id: 'frog', x: 0.3, y: 0.6, size: 2 }];
  const book = upgradeBook({ id: 'b-2', format: 1, pages: [{ text: 'old' }, { text: 'new', stickers }] });
  assert.deepEqual(book.pages.map((page) => page.stickers), [[], stickers]);
  assert.equal(book.format, BOOK_FORMAT);
});

test('movePage moves a page earlier or later and never loses one', () => {
  const book = bookOf('abcd');
  const texts = (b) => b.pages.map((page) => page.text).join('');
  assert.equal(texts(movePage(book, 0, 1, 2)), 'bacd');
  assert.equal(texts(movePage(book, 3, 2, 2)), 'abdc');
  assert.equal(texts(movePage(book, 0, 3, 2)), 'bcda');
  assert.equal(movePage(book, 0, 1, 2).changed, 2);
  assert.equal(texts(book), 'abcd'); // the book passed in is unchanged
});

test('movePage does nothing outside 1 to the number of pages, and never changes the count', () => {
  const book = addPage(newBook('b-4', 1), 0, 1);
  assert.equal(movePage(book, 0, -1, 2), book);
  assert.equal(movePage(book, 1, 2, 2), book);
  assert.equal(movePage(book, 0, 0, 2), book);
  assert.equal(movePage(book, 0.5, 1, 2), book);
  assert.equal(movePage(book, 0, 1, 2).pages.length, 2);
  // Twelve pages in, twelve out, whichever way a page is moved.
  let full = newBook('b-5', 1);
  while (full.pages.length < MAX_PAGES) full = addPage(full, 0, 1);
  for (let from = 0; from < 12; from++) for (let to = 0; to < 12; to++) {
    assert.equal(movePage(full, from, to, 2).pages.length, 12);
  }
});
