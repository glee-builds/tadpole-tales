// Tests for the backup file functions in src/book.js. Run with: node --test
// Every book here is made up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT, newBook, setPageText, addPage, makeBackup, backupName, readBackup, mergeBooks,
} from '../src/book.js';

const NOW = Date.UTC(2026, 10, 27, 12, 0, 0); // midday, so the date is the same in any time zone
const frog = setPageText(newBook('b-frog', 1000), 0, 'A frog sat on a log.', 2000);
const moon = setPageText(addPage(newBook('b-moon', 3000), 0, 3000), 1, 'The moon said hello.', 4000);

test('a backup goes out and comes back the same', () => {
  const backup = makeBackup({ books: [frog, moon], author: 'Pip', progress: { lesson: 2 } }, NOW);
  assert.equal(backup.app, 'tadpole-tales');
  assert.equal(backup.backup, BACKUP_FORMAT);
  assert.equal(backup.made, '2026-11-27T12:00:00.000Z');
  const back = readBackup(JSON.stringify(backup));
  assert.deepEqual(back, { books: [frog, moon], author: 'Pip', progress: { lesson: 2 }, unreadable: 0 });
});

test('the file name has the date', () => {
  assert.equal(backupName(NOW), 'tadpole-tales-backup-2026-11-27.json');
  assert.equal(backupName(new Date(2026, 0, 5, 9).getTime()), 'tadpole-tales-backup-2026-01-05.json');
});

test('an old-format file: books with missing fields are filled in', () => {
  const old = JSON.stringify({ app: 'tadpole-tales', backup: 1, books: [{ id: 'b-old', changed: 5, pages: [{ text: 'Hi' }] }] });
  const { books, author, progress, unreadable } = readBackup(old);
  assert.equal(books.length, 1);
  assert.deepEqual(books[0].pages, [{ id: 'p0', text: 'Hi', stickers: [] }]);
  assert.equal(books[0].format, 1);
  assert.equal(author, '');
  assert.deepEqual(progress, {});
  assert.equal(unreadable, 0);
});

test('a broken or cut-short file is turned away with a message', () => {
  const whole = JSON.stringify(makeBackup({ books: [frog] }, NOW));
  for (const text of [whole.slice(0, whole.length / 2), '', 'not json at all', '{"app":"tadpole-tales","backup":1}']) {
    assert.throws(() => readBackup(text), /damaged or cut short/);
  }
});

test('a file from another app is turned away', () => {
  for (const text of ['{"app":"little-pond","books":[]}', '[]', 'null', '{"books":[]}']) {
    assert.throws(() => readBackup(text), /isn't a Tadpole Tales backup/);
  }
});

test('a file from a newer version is turned away', () => {
  assert.throws(() => readBackup(JSON.stringify({ app: 'tadpole-tales', backup: BACKUP_FORMAT + 1, books: [] })), /newer/);
});

test('books in the file that can\'t be read are counted, the rest still come back', () => {
  const text = JSON.stringify({ app: 'tadpole-tales', backup: 1, books: [frog, { id: 'no-pages' }, { ...moon, id: 5 }] });
  const { books, unreadable } = readBackup(text);
  assert.deepEqual(books, [frog]);
  assert.equal(unreadable, 2);
});

test('a book from a newer version comes back whole, as it was', () => {
  const later = { ...moon, format: 99, chapters: ['one'] };
  const { books, unreadable } = readBackup(JSON.stringify({ app: 'tadpole-tales', backup: 1, books: [later] }));
  assert.deepEqual(books, [later]);
  assert.equal(unreadable, 0);
});

test('restore adds only books that aren\'t on the shelf', () => {
  assert.deepEqual(mergeBooks([frog], [frog, moon]), { add: [moon], skipped: 1 });
});

test('restoring twice adds nothing the second time', () => {
  const shelf = [];
  const first = mergeBooks(shelf, [frog, moon]);
  shelf.push(...first.add);
  assert.deepEqual(mergeBooks(shelf, [frog, moon]), { add: [], skipped: 2 });
});

test('a book with the same id but different words: the shelf copy is kept, untouched', () => {
  const shelf = [frog];
  const copy = structuredClone(shelf);
  const changed = setPageText(frog, 0, 'A frog jumped off the log.', 9000);
  assert.deepEqual(mergeBooks(shelf, [changed]), { add: [], skipped: 1 });
  assert.deepEqual(shelf, copy);
});

test('the same book twice in one file is added once', () => {
  assert.deepEqual(mergeBooks([], [moon, moon]), { add: [moon], skipped: 1 });
});

test('the author name is in the backup file, and comes back only as text', () => {
  assert.equal(JSON.parse(JSON.stringify(makeBackup({ books: [], author: 'Pip' }, NOW))).author, 'Pip');
  assert.equal(readBackup(JSON.stringify(makeBackup({ books: [] }, NOW))).author, '');
  assert.equal(readBackup('{"app":"tadpole-tales","backup":1,"author":5,"books":[]}').author, '');
});
