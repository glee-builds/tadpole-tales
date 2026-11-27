// Tests from the Phase 1 review for src/book.js: upgradeBook keeps fields
// from later phases, checks types, never cuts a long book, and keeps a book
// from a newer version whole. Also the fallback id maker.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_FORMAT, newBook, setPageText, addPage, upgradeBook, isNewer, readBackup, mergeBooks, newId } from '../src/book.js';

test('upgradeBook keeps fields it does not know, on the book and on each page', () => {
  const record = { ...newBook('b-1', 1), music: 'rain', pages: [{ text: 'Hi', stickers: [], voice: 'v-1' }] };
  const book = upgradeBook(record);
  assert.equal(book.music, 'rain');
  assert.equal(book.pages[0].voice, 'v-1');
});

test('upgradeBook needs a string id', () => {
  assert.throws(() => upgradeBook({ id: 7, pages: [] }), { message: 'not a book' });
  assert.throws(() => upgradeBook({ id: '', pages: [] }), { message: 'not a book' });
});

test('upgradeBook turns a title and page words that are not strings into strings', () => {
  const book = upgradeBook({ id: 'b-1', title: 42, pages: [{ text: 7 }, null, { text: null }] });
  assert.equal(book.title, '42');
  assert.deepEqual(book.pages.map((page) => page.text), ['7', '', '']);
  assert.ok(book.pages.every((page) => Array.isArray(page.stickers)));
});

test('upgradeBook keeps every page of a book longer than 12 pages', () => {
  const pages = Array.from({ length: 14 }, (_, i) => ({ text: `page ${i + 1}`, stickers: [] }));
  assert.equal(upgradeBook({ id: 'b-1', pages }).pages.length, 14);
});

test('a book from a newer format is kept whole and marked newer', () => {
  const newer = { id: 'b-7', format: BOOK_FORMAT + 1, title: 'From later', chapters: [1, 2] };
  const kept = upgradeBook(newer);
  assert.deepEqual(kept, newer);
  assert.equal(isNewer(kept), true);
  assert.equal(isNewer(newBook('b-1', 1)), false);
  assert.throws(() => upgradeBook({ format: BOOK_FORMAT + 1 }), { message: 'not a book' });
});

test('restore never writes over a newer book on the shelf', () => {
  const shelf = [upgradeBook({ id: 'b-7', format: BOOK_FORMAT + 1, pages: [] })];
  const incoming = [setPageText(newBook('b-7', 1), 0, 'old words', 1)];
  assert.deepEqual(mergeBooks(shelf, incoming), { add: [], skipped: 1 });
});

test('a backup book with a number for its id is counted as unreadable', () => {
  const text = JSON.stringify({ app: 'tadpole-tales', backup: 1, books: [{ id: 12, pages: [] }, newBook('b-1', 1)] });
  const { books, unreadable } = readBackup(text);
  assert.deepEqual(books.map((book) => book.id), ['b-1']);
  assert.equal(unreadable, 1);
});

test('upgradeBook leaves a good 12-page book as it is', () => {
  let book = newBook('b-1', 1);
  for (let i = 0; i < 11; i++) book = addPage(book, i, 1);
  assert.deepEqual(upgradeBook(book), book);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newId makes a random id, with or without crypto.randomUUID', () => {
  assert.match(newId(), UUID);
  const real = crypto.randomUUID;
  crypto.randomUUID = undefined; // as in Safari before 15.4
  try {
    const ids = new Set(Array.from({ length: 100 }, newId));
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, UUID);
  } finally {
    delete crypto.randomUUID; // back to the one on Crypto.prototype
  }
  assert.equal(crypto.randomUUID, real);
});
