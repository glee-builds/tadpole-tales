// book.js: what a book is, as plain functions (no screen, no database).
//
// A book is { format, id, created, changed, finished, title, cover, pages }.
// `pages` is a list of { text, stickers }, 1 to 12 long. Every function
// returns a new book and sets `changed` to `now`; none changes the one passed in.
// The 300-character limit per page is kept by typing.js while the writer types.
// setPageText stores whatever it is given, so a book's words are never cut.

export const BOOK_FORMAT = 1; // bump only with an upgrade step in upgradeBook
export const MAX_PAGES = 12;

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
    title: record.title ?? '',
    cover: record.cover ?? null,
    pages: pages.length ? pages : [newPage()],
  };
}
