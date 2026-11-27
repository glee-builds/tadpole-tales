// book.js: what a book is, as plain functions (no screen, no database).
//
// A book is { format, id, created, changed, finished, title, cover, pages }.
// `title` is text (at most TITLE_LIMIT characters when typed); `cover` is null
// or { stickers: [...] }, the same sticker shape as a page's.
// `pages` is a list of { text, stickers }, 1 to 12 long. Every function
// returns a new book and sets `changed` to `now`; none changes the one passed in.
// The 300-character limit per page is kept by typing.js while the writer types.
// setPageText stores whatever it is given, so a book's words are never cut.

export const BOOK_FORMAT = 1; // bump only with an upgrade step in upgradeBook
export const MAX_PAGES = 12;
export const TITLE_LIMIT = 40; // typed in the finish step; a longer saved title is kept whole

const newPage = () => ({ text: '', stickers: [] });

/** A new book with one empty page. The caller passes in the id and the time. */
export function newBook(id, now) {
  return {
    format: BOOK_FORMAT,
    id,
    created: now,
    changed: now,
    finished: false,
    title: '',
    cover: null,
    pages: [newPage()],
  };
}

export const canAddPage = (book) => book.pages.length < MAX_PAGES;

/** Put a page into the book at `index` (0 to the number of pages). */
function insertPage(book, index, page, now) {
  const pages = [...book.pages.slice(0, index), page, ...book.pages.slice(index)];
  return { ...book, pages, changed: now };
}

/** A new empty page after page `after`. Unchanged at 12 pages. */
export function addPage(book, after, now) {
  if (!canAddPage(book)) return book;
  return insertPage(book, after + 1, newPage(), now);
}

/** Take page `index` out. Never removes the last page: `removed` is then null. */
export function removePage(book, index, now) {
  if (book.pages.length <= 1 || !book.pages[index]) return { book, removed: null };
  const pages = book.pages.filter((_, i) => i !== index);
  return { book: { ...book, pages, changed: now }, removed: { page: book.pages[index], index } };
}

/** Put a removed page back at its old place, or at the end if that is past the end. */
export function putBackPage(book, removed, now) {
  if (!canAddPage(book)) return book;
  return insertPage(book, Math.min(removed.index, book.pages.length), removed.page, now);
}

export function setPageText(book, index, text, now) {
  const pages = book.pages.map((page, i) => (i === index ? { ...page, text } : page));
  return { ...book, pages, changed: now };
}

export const setTitle = (book, title, now) => ({ ...book, title, changed: now });

/** The cover's stickers (the title is separate). */
export const setCoverStickers = (book, stickers, now) => ({ ...book, cover: { stickers }, changed: now });

/** True when no page has any words or stickers. */
export const isBlank = (book) => book.pages.every((page) => page.text === '' && page.stickers.length === 0);

/** Turn a saved record into a format-1 book, filling in anything missing. */
export function upgradeBook(record) {
  if (!record || !record.id || !Array.isArray(record.pages)) throw new Error('not a book');
  if (record.format > BOOK_FORMAT) throw new Error('newer book');
  const created = record.created ?? record.changed ?? 0;
  const pages = record.pages.slice(0, MAX_PAGES).map((page) => ({
    text: page?.text ?? '',
    stickers: page?.stickers ?? [],
  }));
  return {
    format: BOOK_FORMAT,
    id: record.id,
    created,
    changed: record.changed ?? created,
    finished: record.finished ?? false,
    title: typeof record.title === 'string' ? record.title : '',
    cover: Array.isArray(record.cover?.stickers) ? { stickers: record.cover.stickers } : null,
    pages: pages.length ? pages : [newPage()],
  };
}

// ---------- The backup file ----------
//
// { app: 'tadpole-tales', backup: 1, made, author, progress, books }
// No recordings, ever. Restoring only adds books that aren't on the shelf.

export const BACKUP_FORMAT = 1; // bump only with a matching step in readBackup

/** The backup object for these books, made at `now` (ms). */
export function makeBackup({ books, author = '', progress = {} }, now) {
  return { app: 'tadpole-tales', backup: BACKUP_FORMAT, made: new Date(now).toISOString(), author, progress, books };
}

/** tadpole-tales-backup-YYYY-MM-DD.json, with the device's own date. */
export function backupName(now) {
  const date = new Date(now);
  const two = (n) => String(n).padStart(2, '0');
  return `tadpole-tales-backup-${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}.json`;
}

/**
 * Read a backup file's text. Returns { books, author, progress, unreadable }
 * (`unreadable` counts books in the file that couldn't be read), or throws
 * an Error whose message is a short sentence for a grown-up.
 */
export function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is damaged or cut short. Try another backup.');
  }
  if (data?.app !== 'tadpole-tales') throw new Error('This isn\'t a Tadpole Tales backup.');
  if (data.backup > BACKUP_FORMAT) throw new Error('This backup is from a newer Tadpole Tales. Open the app online to update it, then try again.');
  if (!Array.isArray(data.books)) throw new Error('This file is damaged or cut short. Try another backup.');
  const books = [];
  for (const record of data.books) {
    try { books.push(upgradeBook(record)); } catch { /* counted below */ }
  }
  return {
    books,
    author: typeof data.author === 'string' ? data.author : '',
    progress: data.progress && typeof data.progress === 'object' ? data.progress : {},
    unreadable: data.books.length - books.length,
  };
}

/**
 * The books to add from a backup: only those whose id isn't on the shelf
 * (or earlier in the file). Never changes or removes a shelf book.
 */
export function mergeBooks(shelf, incoming) {
  const ids = new Set(shelf.map((book) => book.id));
  const add = [];
  for (const book of incoming) {
    if (ids.has(book.id)) continue;
    ids.add(book.id);
    add.push(book);
  }
  return { add, skipped: incoming.length - add.length };
}
