// book.js: what a book is, as plain functions (no screen, no database).
//
// A book is { format, id, created, changed, finished, title, cover, pages }.
// `title` is text (at most TITLE_LIMIT characters when typed); `cover` is null
// or { stickers: [...] }, the same sticker shape as a page's.
// `pages` is a list of { id, text, stickers }, 1 to 12 long (a hand-made backup
// can hold more: they are kept, and no page can be added). Every function
// returns a new book and sets `changed` to `now`; none changes the one passed in.
// A page's stickers are { id, x, y, size } (see stickers.js); the format number stays 1
// because upgradeBook already fills `stickers` with [] on an older record.
// A page's `id` never changes, so a Tell it recording (kept apart, by book id and
// page id) stays with its page when pages move. A page saved before ids existed
// gets 'p' + its place when read (upgradeBook), and keeps that once the book is saved.
// The 300-character limit per page is kept by typing.js while the writer types.
// setPageText stores whatever it is given, so a book's words are never cut.

export const BOOK_FORMAT = 1; // bump only with an upgrade step in upgradeBook
export const MAX_PAGES = 12;
export const TITLE_LIMIT = 40; // typed in the finish step; a longer restored title is trimmed to it
export const NAME_LIMIT = 20;  // the author name, the same limit as the finish step's

const newPage = () => ({ id: newId(), text: '', stickers: [] });

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

/** The book with page `index` changed by `change` (text or stickers). */
const updatePage = (book, index, change, now) => ({
  ...book,
  pages: book.pages.map((page, i) => (i === index ? { ...page, ...change } : page)),
  changed: now,
});

export const setPageText = (book, index, text, now) => updatePage(book, index, { text }, now);

export const setTitle = (book, title, now) => ({ ...book, title, changed: now });

/** The cover's stickers (the title is separate). */
export const setCoverStickers = (book, stickers, now) => ({ ...book, cover: { stickers }, changed: now });

/** Replace page `index`'s stickers (a list of { id, x, y, size }, kept by stickers.js). */
export const setPageStickers = (book, index, stickers, now) => updatePage(book, index, { stickers }, now);

/** Move page `from` to place `to` (both 0 to pages - 1). Out of range: unchanged. Never loses a page. */
export function movePage(book, from, to, now) {
  const last = book.pages.length - 1;
  if (![from, to].every((n) => Number.isInteger(n) && n >= 0 && n <= last) || from === to) return book;
  const pages = [...book.pages];
  pages.splice(to, 0, ...pages.splice(from, 1));
  return { ...book, pages, changed: now };
}

/**
 * The book's name for a cover or a list: its title, else its first words, cut
 * to `limit` characters with "…". Empty if it has neither (the caller says so).
 */
export function bookTitle(book, limit) {
  const words = (book.title || book.pages.map((page) => page.text).join(' ')).replace(/\s+/g, ' ').trim();
  return words.length > limit ? `${words.slice(0, limit)}…` : words;
}

/** True when no page has any words or stickers. */
export const isBlank = (book) => book.pages.every((page) => page.text === '' && page.stickers.length === 0);

/** True for a book made by a newer version of the app: shown on the shelf, never opened or changed. */
export const isNewer = (book) => book.format > BOOK_FORMAT;

/**
 * Turn a saved record into a format-1 book, filling in anything missing.
 * Fields it doesn't know (from a later phase) are kept, on the book and on
 * each page. A book over 12 pages keeps every page. A book from a newer
 * format is returned whole and unchanged (see isNewer). Anything of the
 * wrong type (from a damaged or hand-edited backup) is mended: words and the
 * title that aren't text become '', a sticker without a string id and
 * numeric x, y and size is left out, `finished` is true or false, and the
 * dates are numbers. Every page gets a unique id (see newPage). Throws
 * 'not a book' without a good id (see ID).
 */
export function upgradeBook(record) {
  if (!isObject(record) || typeof record.id !== 'string' || !ID.test(record.id)) throw new Error('not a book');
  if (isNewer(record)) return record;
  if (!Array.isArray(record.pages)) throw new Error('not a book');
  const created = time(record.created) ?? time(record.changed) ?? 0;
  const ids = new Set();
  const pages = record.pages.map((page, i) => {
    // A page with no good id, or one another page has, gets 'p' + its place (made unique).
    let id = typeof page?.id === 'string' && ID.test(page.id) && !ids.has(page.id) ? page.id : `p${i}`;
    while (ids.has(id)) id += 'x';
    ids.add(id);
    return { ...(isObject(page) ? page : {}), id, text: asText(page?.text), stickers: stickersOf(page?.stickers) };
  });
  return {
    ...record,
    format: BOOK_FORMAT,
    created,
    changed: time(record.changed) ?? created,
    finished: record.finished === true,
    title: asText(record.title).slice(0, TITLE_LIMIT),
    cover: isObject(record.cover) ? { ...record.cover, stickers: stickersOf(record.cover.stickers) } : null,
    pages: pages.length ? pages : [{ id: 'p0', text: '', stickers: [] }],
  };
}

/** A book or page id: short, letters, digits, '-' and '_' only (never '/' or '#', which the screen addresses and recording keys use). */
const ID = /^[\w-]{1,100}$/;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');
const time = (value) => (Number.isFinite(value) ? value : undefined);
const isSticker = (sticker) => isObject(sticker) && typeof sticker.id === 'string' && [sticker.x, sticker.y, sticker.size].every(Number.isFinite);
const stickersOf = (list) => (Array.isArray(list) ? list.filter(isSticker) : []);

/** A random id for a new book. crypto.randomUUID needs Safari 15.4, so older ones make it from random bytes. */
export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  if (text.length > BACKUP_LIMIT) throw new Error('This file is too big to be a Tadpole Tales backup.');
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
    try {
      const book = upgradeBook(record);
      // A page far longer than the app lets anyone type: counted as unreadable, never cut.
      if (!isNewer(book) && book.pages.some((page) => page.text.length > PAGE_TEXT_LIMIT)) continue;
      books.push(book);
    } catch { /* counted below */ }
  }
  return {
    books,
    author: asText(data.author).slice(0, NAME_LIMIT),
    progress: progressOf(data.progress),
    unreadable: data.books.length - books.length,
  };
}

export const BACKUP_LIMIT = 5e6;     // characters: a real backup is far smaller
export const PAGE_TEXT_LIMIT = 2000; // characters on one page in a backup (typing stops at 300)

/**
 * Lesson progress from a backup: no lesson fields exist yet, so only plain
 * entries come back, a name of letters, digits, '-' or '_' (starting with a
 * letter) set to a number or true/false. Anything else is left out.
 */
function progressOf(progress) {
  if (!isObject(progress)) return {};
  return Object.fromEntries(Object.entries(progress).filter(([key, value]) => (
    /^[a-z][\w-]{0,63}$/i.test(key) && (Number.isFinite(value) || typeof value === 'boolean')
  )).slice(0, 500));
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
