// Damaged or hand-edited backup files (from the Phase 1 security review):
// a bad book is mended or turned away, and never breaks the shelf or the
// other books. Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBook, upgradeBook, readBackup, BACKUP_LIMIT, PAGE_TEXT_LIMIT } from '../src/book.js';

const good = newBook('good-1', 1);
const file = (books, extra = {}) => JSON.stringify({ app: 'tadpole-tales', backup: 1, books, ...extra });

test('an id that is not short, plain text is not a book', () => {
  for (const id of [7, {}, ['a'], '', 'a/b', 'a#b', 'x'.repeat(101), 'h1"><img src=x onerror=alert(1)>', 'b 1']) {
    assert.throws(() => upgradeBook({ ...good, id }), { message: 'not a book' }, JSON.stringify(id));
  }
  assert.equal(upgradeBook({ ...good, id: 'x'.repeat(100) }).id.length, 100);
  assert.equal(upgradeBook({ ...good, id: '2f9c0a1e-8b7d-4c3a-9e1f-0123456789ab' }).id.length, 36);
});

test('words and a title that are not text become empty', () => {
  const book = upgradeBook({ ...good, title: { a: 1 }, pages: [{ text: 123, stickers: [] }, { text: ['x'] }] });
  assert.equal(book.title, '');
  assert.deepEqual(book.pages.map((page) => page.text), ['', '']);
});

test('a page that is not an object becomes an empty page', () => {
  assert.deepEqual(upgradeBook({ ...good, pages: ['abc', 7, null] }).pages, [
    { text: '', stickers: [] }, { text: '', stickers: [] }, { text: '', stickers: [] },
  ]);
});

test('only good stickers are kept, on a page and on the cover', () => {
  const ok = { id: 'frog', x: 0.5, y: 0.5, size: 1 };
  const bad = [null, 'frog', { id: 7, x: 0, y: 0, size: 1 }, { id: 'frog', x: '1);background:url(//evil)', y: 0.5, size: 1 }, { id: 'frog', x: 0.5, y: 0.5 }, { id: 'frog', x: NaN, y: 0, size: 1 }];
  const book = upgradeBook({ ...good, cover: { stickers: [null, ok] }, pages: [{ text: 'x', stickers: [...bad, ok] }, { text: 'y', stickers: 'abc' }] });
  assert.deepEqual(book.pages[0].stickers, [ok]);
  assert.deepEqual(book.pages[1].stickers, []);
  assert.deepEqual(book.cover, { stickers: [ok] });
  assert.deepEqual(upgradeBook({ ...good, cover: { stickers: 'x' } }).cover, { stickers: [] });
});

test('finished is true or false, and the dates are numbers', () => {
  const book = upgradeBook({ ...good, finished: 'yes', created: '5', changed: { a: 1 } });
  assert.equal(book.finished, false);
  assert.equal(book.created, 0);
  assert.equal(book.changed, 0);
  assert.equal(upgradeBook({ ...good, finished: true }).finished, true);
  const dated = upgradeBook({ ...good, created: undefined, changed: 42 });
  assert.deepEqual([dated.created, dated.changed], [42, 42]);
});

test('a backup with one bad book still brings back the good ones', () => {
  const { books, unreadable } = readBackup(file([{ ...good, id: 7 }, { ...good, id: { a: 1 } }, good, { ...good, id: 'c1', cover: { stickers: [null] } }]));
  assert.deepEqual(books.map((book) => book.id), ['good-1', 'c1']);
  assert.deepEqual(books[1].cover, { stickers: [] });
  assert.equal(unreadable, 2);
});

test('a file over the size limit is turned away before it is read', () => {
  assert.throws(() => readBackup(' '.repeat(BACKUP_LIMIT + 1)), /too big/);
});

test('a book with a page far over the typing limit is counted as unreadable, never cut', () => {
  const long = { ...good, id: 'long', pages: [{ text: 'a'.repeat(PAGE_TEXT_LIMIT + 1), stickers: [] }] };
  const fine = { ...good, id: 'fine', pages: [{ text: 'a'.repeat(PAGE_TEXT_LIMIT), stickers: [] }] };
  const { books, unreadable } = readBackup(file([long, fine]));
  assert.deepEqual(books.map((book) => book.id), ['fine']);
  assert.equal(unreadable, 1);
});

test('progress keeps only plain entries, and never touches Object.prototype', () => {
  const text = '{"app":"tadpole-tales","backup":1,"books":[],"__proto__":{"polluted":1},'
    + '"progress":{"__proto__":{"polluted":1},"constructor":{"a":1},"lesson":2,"done-1":true,"note":"x","deep":{"a":1},"bad key":1,"_x":1}}';
  const { progress } = readBackup(text);
  assert.deepEqual(Object.entries(progress), [['lesson', 2], ['done-1', true]]);
  assert.equal(Object.getPrototypeOf(progress), Object.prototype);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(readBackup(file([], { progress: [1, 2] })).progress, {});
  assert.deepEqual(readBackup(file([], { progress: 'lots' })).progress, {});
});
