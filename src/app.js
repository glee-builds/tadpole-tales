// app.js: starts Tadpole Tales and shows the screen the address asks for.
//
// Screens, by location.hash:
//   ''                    the bookshelf
//   '#book/<id>/<page>'   the page screen (Write or Picture mode); <page> counts from 0
//   '#read/<id>'          the reading view
//   '#finish/<id>'        after "Finish": title, author name, cover, then the lesson steps (finish.js)
//   '#grown-ups'          the grown-up page
//   '#lesson/...', '#plan/...', '#example/...'   the lesson screens (src/lesson-screens.js)

import { make, button, saveMark, plural } from './ui.js';
import { mountWriter } from './keyboard.js';
import { LIMIT, isFull } from './typing.js';
import { newBook, newId, addPage, removePage, putBackPage, movePage, setPageText, setPageStickers, canAddPage, isBlank, isNewer, bookTitle } from './book.js';
import { loadBooks, saveSoon, saveNow, onSaveState, getSetting, setSetting, deleteRecordings } from './store.js';
import { holdToOpen, showGrownup, isInstalled, INSTALL_NOTE } from './grownup.js';
import { mountPicture } from './stickers.js';
import { showReading } from './reading.js';
import { showFinish, startFinish } from './finish.js';
import { loadLessonData, drawLessonRoute, lessonBar, tadpoleBooks } from './lesson-screens.js';
import { currentLesson } from './lessons.js';
import { planOf, setPlanAnswer, ideaCards } from './plan.js';
import { tellItOn, mountTellIt } from './record.js';

// The service worker (sw.js) saves the app's files so it opens without
// internet. If the phone can't run one, the app works as before, online.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline mode is off:', error));
}

const shelf = document.querySelector('.shelf');
const grownups = document.querySelector('.grownups');
const booksBox = shelf.querySelector('.books');

// What the last save said, so Refresh and Finish know whether it worked.
let saveState = 'saved';
onSaveState((state) => { saveState = state; });

// The "not saved" mark on the shelf.
const shelfMark = saveMark();
shelf.querySelector('.shelf-top').append(shelfMark.node);
onSaveState(shelfMark.update);

// ---------- The bookshelf ----------

function bookCard(book) {
  if (isNewer(book)) { // made by a newer version of the app: shown, but never opened or edited here
    const card = make('div', 'book-card finished');
    const inside = card.appendChild(make('div', 'book-open'));
    inside.append(make('div', 'cover cover-0'), make('div', 'card-info'));
    inside.firstChild.append(make('span', 'cover-title', 'A book'));
    inside.lastChild.append(make('span', 'card-status', 'Made with a newer version — tap Refresh'));
    return card;
  }
  const card = make('div', `book-card ${book.finished ? 'finished' : 'unfinished'}`);
  const open = card.appendChild(make('a', 'book-open'));
  open.href = book.finished ? `#read/${book.id}` : `#book/${book.id}/0`;
  // A cover color from the id, so a book keeps its color.
  const color = [...book.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const cover = open.appendChild(make('div', `cover cover-${color}`));
  cover.append(make('span', 'cover-title', bookTitle(book, 50) || 'A new book'));
  if (book.cover?.stickers.length) mountPicture(cover, { stickers: book.cover.stickers }); // read-only
  const info = open.appendChild(make('div', 'card-info'));
  info.append(book.finished
    ? make('span', 'card-status', '✓ Finished')
    : make('span', 'card-status keep-going', '✎ Keep going'));
  info.append(make('span', 'card-pages', plural(book.pages.length, 'page')));
  // A finished book opens to read; "Edit" opens its pages to change (Finish then asks for the title and cover again).
  if (book.finished) card.append(button('pill card-edit', '✎ Edit', () => { location.hash = `book/${book.id}/0`; }));
  return card;
}

/** A book's card, or none if it can't be drawn: one damaged book never hides the others. */
function safeCard(book) {
  try {
    return [bookCard(book)];
  } catch (error) {
    console.warn('A book could not be drawn:', error);
    return [];
  }
}

const getProgress = () => getSetting('progress').catch(() => undefined); // lesson progress (src/lessons.js)

let shelfMessage = ''; // a kind message for the shelf, set when a book is finished

async function showShelf(token) {
  await saveNow(); // coming back from a book: what was typed is saved before the shelf reads it
  if (token !== shown) return;
  shelf.hidden = false;
  let books;
  let author;
  try {
    books = await loadBooks();
  } catch {
    booksBox.replaceChildren(make('p', 'books-note books-problem', '⚠ Couldn\'t open your books on this device.'));
    return;
  }
  try { author = await getSetting('author'); } catch { /* the heading just says "Your books" */ }
  const lessons = await loadLessonData(); // null without lessons: no second shelf
  const second = lessons ? tadpoleBooks(lessons, await getProgress()) : [];
  if (token !== shown) return;
  shelf.querySelector('h1').textContent = author ? `Books by ${author}` : 'Your books';
  // Unfinished books first, then the most recently changed.
  books.sort((a, b) => Number(a.finished) - Number(b.finished) || b.changed - a.changed);
  booksBox.replaceChildren(...(books.length
    ? books.flatMap(safeCard)
    : [make('p', 'books-note', 'No books yet. Make your first one!')]), ...second);
  if (shelfMessage) booksBox.prepend(make('p', 'books-note shelf-message', `🎉 ${shelfMessage}`));
  shelfMessage = '';
}

shelf.querySelector('.go').addEventListener('click', async () => {
  const lessons = await loadLessonData();
  const lesson = lessons && currentLesson(await getProgress(), lessons.lessons);
  const book = { ...newBook(newId(), Date.now()), ...(lesson && { lesson: lesson.id }) }; // a book remembers its lesson
  open = { book, removed: [], stored: false }; // saved at the first word, so backing out leaves no empty book
  // The lesson card (while lessons remain), then planning; every book is offered planning once lessons load.
  location.hash = lesson ? `lesson/${book.id}/${lesson.id}/new` : `${lessons ? 'plan' : 'book'}/${book.id}/0`;
});

// Not opened from the Home Screen: tell a grown-up the books may not be safe.
if (!isInstalled()) shelf.querySelector('.install-note').textContent = INSTALL_NOTE;

// The grown-up page opens when its button is held for 2 seconds.
holdToOpen(shelf.querySelector('.hold-button'), () => { location.hash = 'grown-ups'; });

// Refresh: save first, and only then load the app again (which gets the newest version).
const refresh = shelf.querySelector('.refresh-button');
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  refresh.textContent = 'Refreshing…';
  await saveNow();
  if (saveState === 'not-saved') { // never reload with words that are not saved
    shelfMark.update('not-saved');
    refresh.disabled = false;
    refresh.textContent = '↻ Refresh';
    return;
  }
  try {
    // Ask for the newest service worker too, so the offline copy is up to date.
    await (await navigator.serviceWorker?.getRegistration())?.update();
  } catch { /* offline, or no service worker: loading again still works */ }
  location.replace(location.pathname);
});

// ---------- The page screen (Write and Picture modes) ----------

let open = null; // { book, removed, stored }: the book being written; `removed` is a stack of pages that can be put back, the latest last
let screen = null; // the writer screen on show, if any
let writer = null;
let picture = null; // the picture on show (editable in Picture mode)
let tell = null; // the Tell it row on show, if any
let mode = 'write'; // 'write' (keyboard, small picture) or 'picture' (big picture, sticker tray)
let stopWatching = null;
let shown = 0; // counts screens drawn, so a slow load for an old screen is ignored

function clearScreen() {
  writer?.remove();
  writer = null;
  picture?.remove();
  picture = null;
  tell?.remove(); // turns the microphone off
  tell = null;
  stopWatching?.();
  stopWatching = null;
  screen?.remove();
  screen = null;
}

/** Go to a page. Draws again even if the address is the same. */
function go(index) {
  const target = `#book/${open.book.id}/${index}`;
  if (location.hash === target) show();
  else location.hash = target;
}

/** The book changed: keep it, and save it (but never an empty book nobody wrote in). */
function changed(next) {
  open.book = next;
  if (open.stored || !isBlank(next) || Object.keys(planOf(next)).length) { // a plan answer is saved too
    open.stored = true;
    saveSoon(next);
  }
}

/**
 * The saved book with this id that this app can open, or undefined (the caller goes back to the shelf).
 * Saves what is waiting first: a back-swipe from Finish within a second of typing would otherwise read the book without its last letters.
 */
async function findBook(id) {
  await saveNow();
  try { return (await loadBooks()).find((one) => one.id === id && !isNewer(one)); } catch { return undefined; }
}

async function showPage(id, wanted, token) {
  if (!open || open.book.id !== id) {
    let book;
    book = await findBook(id);
    if (token !== shown) return;
    if (!book) { location.hash = ''; return; }
    open = { book, removed: [], stored: true };
  }
  const { book } = open;
  const index = Math.min(Math.max(wanted, 0), book.pages.length - 1);
  if (index !== wanted || !Number.isInteger(wanted)) history.replaceState(null, '', `#book/${id}/${index}`);
  const tellOn = mode === 'write' && await tellItOn();
  const lessons = await loadLessonData();
  if (token !== shown) return;
  screen = make('main', 'screen page-screen');
  drawTopRow();
  const mark = saveMark();
  stopWatching = onSaveState(mark.update);
  screen.append(mark.node);
  const title = make('h1', 'screen-title', `Page ${index + 1} of ${book.pages.length}`);
  if (mode === 'picture') drawPictureMode(book, index, title);
  else drawWriteMode(book, index, title, lessons, tellOn);
  shelf.hidden = true;
  document.body.append(screen);
}

/** The top row, the same in both modes: back, Write | Picture, Finish. */
function drawTopRow() {
  const top = screen.appendChild(make('div', 'screen-top'));
  const back = top.appendChild(button('back', '←', () => { location.hash = ''; }));
  back.setAttribute('aria-label', 'Back to the bookshelf');
  const modes = top.appendChild(make('div', 'mode-switch'));
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'What to work on');
  for (const [name, words] of [['write', '✏️ Write'], ['picture', '🖼 Picture']]) {
    const choice = modes.appendChild(button('pill mode-choice', words, () => { mode = name; show(); }));
    choice.setAttribute('aria-pressed', String(mode === name));
  }
  const finish = top.appendChild(button('pill pill-go', '✓ Finish', async () => {
    if (isBlank(open.book)) { location.hash = ''; return; }
    const { id } = open.book;
    let lesson;
    try {
      lesson = await startFinish(open.book, await loadLessonData()); // the next lesson opens and saves first
    } catch {
      screen?.querySelector('.save-mark')?.removeAttribute('hidden'); // it didn't save: stay and show the mark
      return;
    }
    if (open?.book.id !== id) return; // left the book meanwhile
    changed({ ...open.book, ...lesson, finished: true, changed: Date.now() });
    await saveNow();
    if (saveState !== 'not-saved') location.hash = `finish/${open.book.id}`; // if it didn't save, stay and show the mark
  }));
  finish.setAttribute('aria-label', 'Finish the book');
}

/** Prev, Add page, Remove, (after a Remove) put back, Next. Returns the "Add page" button so Write mode can light it up. */
function drawPageTools(book, index) {
  const tools = screen.appendChild(make('div', 'page-tools'));
  const previous = tools.appendChild(button('pill', '‹ Prev', () => go(index - 1)));
  previous.setAttribute('aria-label', 'Previous page');
  previous.disabled = index === 0;
  const add = tools.appendChild(button('pill', '+ Add page', () => {
    changed(addPage(open.book, index, Date.now()));
    go(index + 1);
  }));
  add.disabled = !canAddPage(book);
  const remove = tools.appendChild(button('pill', '✕ Remove', () => {
    const result = removePage(open.book, index, Date.now());
    if (!result.removed) return;
    open.removed.push(result.removed);
    changed(result.book);
    go(Math.min(index, result.book.pages.length - 1));
  }));
  remove.setAttribute('aria-label', 'Remove this page');
  remove.disabled = book.pages.length <= 1;
  if (open.removed.length) { // after a Remove: brings back the latest removed page, until the writer leaves the book
    const putBack = tools.appendChild(button('pill put-back', '↩', () => {
      const removed = open.removed.pop();
      changed(putBackPage(open.book, removed, Date.now()));
      go(Math.min(removed.index, open.book.pages.length - 1));
    }));
    putBack.append(make('span', 'sr-only', ' Put page back')); // the button is only an arrow, so the room stays for the words
    putBack.setAttribute('aria-label', 'Put page back');
    putBack.disabled = !canAddPage(book);
  }
  const next = tools.appendChild(button('pill', 'Next ›', () => go(index + 1)));
  next.setAttribute('aria-label', 'Next page');
  next.disabled = index === book.pages.length - 1;
  return add;
}

/** Write mode: a small picture (tap it for Picture mode), the page tools, the writing area and keys. */
function drawWriteMode(book, index, title, lessons, tellOn) {
  title.classList.add('page-label');
  const lesson = lessons?.lessons.find((one) => one.id === book.lesson);
  const cards = ideaCards(lessons?.planning, book);
  if (lesson || cards.length) screen.classList.add('has-lesson');
  const lessonRow = lesson || cards.length
    ? screen.appendChild(lessonBar({ lesson, cards, onLesson: () => { location.hash = `lesson/${book.id}/${lesson.id}/${index}`; } }))
    : null;
  const slot = screen.appendChild(make('div', 'picture-slot'));
  const openPictures = () => { mode = 'picture'; show(); };
  slot.addEventListener('click', openPictures);
  slot.append(title); // a chip on the picture area, so the page number takes no row
  picture = mountPicture(slot, { stickers: book.pages[index].stickers });
  picture.node.setAttribute('role', 'button'); // the whole picture is a button to Picture mode
  picture.node.setAttribute('tabindex', '0');
  picture.node.setAttribute('aria-label', 'Add stickers to this page');
  picture.node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPictures(); }
  });
  if (tellOn) {
    const here = open;
    // A recording keeps the book, even before it has words.
    const onSaved = () => { if (!here.stored) { here.stored = true; saveSoon(here.book); } };
    tell = mountTellIt(lessonRow?.querySelector('.lesson-row') ?? screen, { inRow: Boolean(lessonRow), bookId: book.id, pageId: book.pages[index].id, onSaved });
    screen.classList.add('has-tell');
  }

  const add = drawPageTools(book, index);
  const showFull = (text) => {
    const full = isFull({ text, limit: LIMIT }) && canAddPage(open.book);
    add.classList.toggle('pill-go', full); // a full page: "Add a page" stands out
    add.textContent = full ? '+ Add a page' : '+ Add page';
  };
  showFull(book.pages[index].text);

  writer = mountWriter(screen, {
    text: book.pages[index].text,
    label: `Words for page ${index + 1}`,
    onChange: (text) => {
      changed(setPageText(open.book, index, text, Date.now()));
      showFull(text);
    },
  });
}

/** Picture mode: the page number between the move buttons, a big picture with its sticker tray, then the page tools. */
function drawPictureMode(book, index, title) {
  const head = screen.appendChild(make('div', 'page-head'));
  title.classList.add('page-label');
  const [earlier, later] = [['◀ Earlier', 'Move this page earlier', -1], ['Later ▶', 'Move this page later', 1]].map(([words, label, step]) => {
    const moveButton = button('pill', words, () => {
      changed(movePage(open.book, index, index + step, Date.now()));
      go(index + step);
    });
    moveButton.setAttribute('aria-label', label);
    moveButton.disabled = index + step < 0 || index + step >= book.pages.length;
    return moveButton;
  });
  head.append(earlier, title, later);
  picture = mountPicture(screen, {
    stickers: book.pages[index].stickers,
    editable: true,
    onChange: (stickers) => changed(setPageStickers(open.book, index, stickers, Date.now())),
  });
  drawPageTools(book, index);
}

// ---------- The reading view ----------

async function showRead(id, token) {
  let book;
  book = await findBook(id);
  if (token !== shown) return;
  if (!book) { location.hash = ''; return; }
  screen = make('main', 'screen reading');
  showReading(screen, book, { onClose: () => { location.hash = ''; } });
  shelf.hidden = true;
  document.body.append(screen);
}

// ---------- After Finish: title, author name, cover, lesson steps ----------

async function showFinishScreen(id, token) {
  let book;
  let author;
  book = await findBook(id);
  try { author = await getSetting('author'); } catch { /* asked for again */ }
  const lessons = await loadLessonData();
  if (token !== shown) return;
  if (!book) { location.hash = ''; return; }
  screen = make('main', 'screen finish-screen');
  const mark = saveMark();
  stopWatching = onSaveState(mark.update);
  screen.append(mark.node);
  const body = screen.appendChild(make('div', 'finish-body'));
  showFinish(body, {
    book,
    author,
    lessons,
    onBook: saveSoon,
    onAuthor: (name) => setSetting('author', name).catch(() => mark.update('not-saved')), // the name didn't save: show the mark
    onDone: async () => {
      await saveNow();
      if (saveState === 'not-saved') return; // stay and show the mark
      shelfMessage = 'Your book is on the shelf!';
      location.hash = '';
    },
    onWrite: async () => { await saveNow(); location.hash = `book/${id}/0`; }, // "Do it" or "Go back and add it"
  });
  shelf.hidden = true;
  document.body.append(screen);
}

// ---------- The lesson screens ----------

async function showLessonRoute(parts, token) {
  const [kind, bookId] = parts;
  const data = await loadLessonData();
  if (data && bookId !== '-' && (!open || open.book.id !== bookId)) {
    const book = await findBook(bookId);
    if (book) open = { book, removed: [], stored: true };
  }
  if (token !== shown) return;
  const book = open?.book.id === bookId ? open.book : null;
  screen = make('main', `screen ${kind}-screen`);
  const drawn = data && drawLessonRoute(screen, parts, {
    data,
    book,
    onAnswer: (id, text) => changed(setPlanAnswer(open.book, id, text, Date.now())),
    go: (hash, replace) => (replace ? location.replace(`#${hash}`) : (location.hash = hash)),
  });
  if (drawn === false || !data) { screen.remove(); screen = null; location.hash = ''; return; }
  if (drawn) writer = drawn; // the planning answer's writing area
  shelf.hidden = true;
  document.body.append(screen);
}

// ---------- Choosing the screen ----------

async function show() {
  const token = ++shown;
  const parts = location.hash.slice(1).split('/');
  const [kind, id, page] = parts;
  clearScreen();
  if (kind !== 'book') mode = 'write';
  const lessonScreen = ['lesson', 'plan', 'example'].includes(kind); // these keep the book that is open
  if (!(kind === 'book' || lessonScreen) || (open && open.book.id !== id)) { // leaving the book: the put-back is gone, and so are removed pages' recordings
    if (open) deleteRecordings(open.book.id, open.book.pages.map((one) => one.id)).catch(() => {});
    open = null;
  }
  const grownupsOpen = location.hash === '#grown-ups';
  grownups.hidden = !grownupsOpen;
  if (grownupsOpen) {
    shelf.hidden = true;
    showGrownup(grownups, { onBack: () => { location.hash = ''; } });
    return;
  }
  grownups.replaceChildren();
  if (kind === 'book' && id) await showPage(id, Number(page) || 0, token);
  else if (kind === 'read' && id) await showRead(id, token);
  else if (kind === 'finish' && id) await showFinishScreen(id, token);
  else if (lessonScreen && id) await showLessonRoute(parts, token);
  else {
    shelf.hidden = true; // until the books are read, so an old shelf is never shown
    await showShelf(token);
  }
}

addEventListener('hashchange', show);
show();
