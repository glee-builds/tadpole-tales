// shelf-and-books.mjs: the bookshelf and a book's life: make a book, finish it (title, author name, cover),
// read it, "Read to me", Refresh, and a book from a newer version.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import {
  page, evaluate, sleep, waitFor, settle,
  HOME, open, touch, middleOf, press, typed,
  tapOn, tapButton, heading, noFields, isDisabled, fitProblem,
  STORE, BREAK, MEND, STALL, savedTexts, markShows, MARK_SHOWS,
  saveNow, shot,
} from './lib.mjs';

// The new page has started too: its first save and its shelf are done, so a broken database can't catch the start-up save.
const reloaded = () => waitFor(`window.__same === undefined && document.readyState === 'complete' && (${HOME})`, 10);

/** Make a 3-page book on the app's keys, then find it, finish it, read it, and refresh. Returns a problem, or ''. */
export async function tryBooks() {
  if (!await open('', HOME)) return 'home did not draw';
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  await open('', HOME);
  if (!await waitFor(`document.querySelector('.books-note')?.textContent.includes('No books yet')`)) return 'an empty shelf does not say so';
  if (await heading() !== 'Your books') return `the heading is "${await heading()}", not "Your books"`;
  if (!await evaluate(`document.querySelector('.install-note').textContent.includes('Add to Home Screen')`)) return 'no install note in a browser tab';
  if (!await evaluate(`[...document.querySelectorAll('.shelf-foot button')].some((b) => b.textContent === '↻ Refresh')`)) return 'no Refresh button';

  // Backing out of a new book before writing anything leaves no empty book.
  await tapOn('.go');
  if (!await waitFor('document.querySelector(".keyboard") !== null', 3)) return 'Make a new book did not open the page screen';
  await tapOn('.back');
  await saveNow(); // anything the page was waiting to save is saved now
  if ((await savedTexts()).length) return 'an empty book was saved';

  // Three pages, on the app's own keys.
  await tapOn('.go');
  await waitFor('document.querySelector(".keyboard") !== null', 3);
  if (await heading() !== 'Page 1 of 1') return `the page screen says "${await heading()}"`;
  if (!await noFields()) return 'a text field is on the page screen';
  if (!await isDisabled('Prev') || !await isDisabled('Remove')) return 'Prev and Remove should be off on a one-page book';
  // Overlapping touches whose clicks come late (p down, i down, then p's click, then i's): each key types once.
  await evaluate(`(() => {
    const key = (name) => document.querySelector('[data-key="' + name + '"]');
    for (const name of ['p', 'i']) key(name).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
    key('p').click();
    key('i').click();
  })()`);
  if (await typed() !== 'pi') return `overlapping touches with late clicks typed "${await typed()}", not "pi"`;
  await press('p');
  await tapButton('Add page');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3)) return 'Add page did not open page 2';
  await press('h', 'o', 'p', 's');
  await tapButton('Add page');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  await press('h', 'o', 'm', 'e');
  if (await typed() !== 'home') return `page 3 holds "${await typed()}"`;

  // Remove page 3 and put it back.
  await tapButton('Remove');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3)) return 'Remove did not leave 2 pages';
  await tapButton('Put page back');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3)) return 'Put page back did not bring page 3 back';
  if (await typed() !== 'home') return `the put-back page holds "${await typed()}"`;
  // Two removes in a row: Remove stays on, and each "Put page back" brings back the latest one.
  await tapButton('Remove');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3);
  if (await isDisabled('Remove')) return 'Remove went off after one remove';
  await tapButton('Remove');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 1 of 1'`, 3)) return 'a second Remove did not leave 1 page';
  if (!await isDisabled('Remove')) return 'Remove should be off on the last page';
  await tapButton('Put page back');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3);
  if (await typed() !== 'hops') return `the first put-back brought back "${await typed()}", not the latest removed page`;
  await tapButton('Put page back');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  if (await typed() !== 'home') return `the second put-back brought back "${await typed()}"`;
  if (await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`)) return 'the put-back bar stayed with nothing to put back';
  await tapButton('Prev');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 3'`, 3);
  if (await typed() !== 'hops') return `page 2 holds "${await typed()}"`;
  await tapOn('.back');
  if (!await waitFor(`document.querySelectorAll('.book-card').length === 1`, 3)) return 'the shelf has no card for the new book';
  const card = await evaluate(`document.querySelector('.book-card').textContent`);
  if (!card.includes('Keep going') || !card.includes('3 pages') || !card.includes('pip')) return `the card says "${card}"`;

  // Reload: still there, first, with "Keep going". Open it again.
  await open('', 'document.querySelector(".book-card") !== null');
  if (!await evaluate(`document.querySelector('.book-card').textContent.includes('Keep going')`)) return 'after a reload the book is not marked "Keep going"';
  await tapOn('.book-card');
  await waitFor('document.querySelector(".keyboard") !== null', 3);
  if (await typed() !== 'pip') return `the saved page 1 holds "${await typed()}"`;

  // Finish: back on the shelf, no longer "Keep going".
  await tapButton('Finish');
  if (!await waitFor(`location.hash.startsWith('#finish/') && document.querySelector('.keyboard') !== null`, 3)) return 'Finish did not open the title step';
  // Skip every step (title, author name, cover): the book is still finished, and no name was kept.
  for (const step of ['called', 'author name', 'cover']) {
    if (!await waitFor(`document.querySelector('.screen h1').textContent.includes(${JSON.stringify(step)})`, 3)) return `no "${step}" step`;
    await tapButton('Skip');
  }
  if (!await waitFor(`location.hash === '' && document.querySelector('.book-card')?.textContent.includes('Finished')`, 3)) return 'Skipping every step did not leave the book finished on the shelf';
  if (await heading() !== 'Your books') return `skipping the name gave the heading "${await heading()}"`;

  // Reading view.
  await tapOn('.book-card');
  if (!await waitFor(`document.querySelector('.read-page') !== null`, 3)) return 'a finished book did not open in the reading view';
  if (!await noFields()) return 'a text field is on the reading view';
  const readPage = () => evaluate(`document.querySelector('.read-page').textContent + '|' + document.querySelector('.read-count').textContent`);
  if (await readPage() !== 'pip|Page 1 of 3') return `reading page 1 shows "${await readPage()}"`;
  if (!await isDisabled('Previous')) return 'Previous should be off on page 1';
  await tapButton('Next');
  await tapButton('Next');
  if (await readPage() !== 'home|Page 3 of 3') return `reading page 3 shows "${await readPage()}"`;
  if (!await isDisabled('Next')) return 'Next should be off on the last page';
  await tapButton('Close');
  if (!await waitFor(`location.hash === '' && document.querySelectorAll('.book-card').length === 1`, 3)) return 'Close did not go back to the shelf';

  // The name makes the heading.
  await evaluate(`(async () => { ${STORE} await store.setSetting('author', 'Pip'); })()`);
  await open('', 'document.querySelector(".book-card") !== null');
  if (!await waitFor(`document.querySelector('h1').textContent === 'Books by Pip'`)) return 'the heading is not "Books by Pip"';

  // Refresh saves first, then reloads. `window.__same` goes away only when the page reloads.
  // `breakFirst` (BREAK or STALL) goes in just before the change is handed over to be saved, in the same breath:
  // the page's own 1-second save can then never get in first and make the save succeed after all.
  const change = (text, breakFirst = '') => evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); ${breakFirst}
    store.saveSoon(book.setPageText(one, 0, ${JSON.stringify(text)}, Date.now())); window.__same = true; })()`);
  // Tap Refresh, and wait until its click has been dealt with (it is switched off while it saves, and back on if it stays),
  // or the page has reloaded. Not a fixed time: a slow computer only makes this wait longer.
  const refreshAndWait = async (seconds = 5) => {
    await evaluate(`window.__clicked = false; document.querySelector('.refresh-button').addEventListener('click', () => { window.__clicked = true; })`);
    await tapOn('.refresh-button');
    return waitFor(`window.__same === undefined || (window.__clicked === true && !document.querySelector('.refresh-button').disabled)`, seconds);
  };
  await change('pip swam');
  await tapOn('.refresh-button');
  if (!await reloaded()) return 'Refresh did not reload';
  if (JSON.stringify(await savedTexts()) !== '["pip swam"]') return `Refresh reloaded before saving: ${JSON.stringify(await savedTexts())}`;

  // A failed save: no reload, and the "not saved" mark shows. Mended, Refresh saves and reloads.
  await change('pip dived', BREAK);
  const finished = await refreshAndWait();
  if (!await evaluate('window.__same === true')) return 'Refresh reloaded although the save failed';
  if (!finished) return 'Refresh did not finish after a failed save';
  if (!await markShows()) return 'no "not saved" mark after a failed Refresh';
  if (await evaluate(`document.querySelector('.refresh-button').disabled`)) return 'Refresh stayed switched off after a failed save';
  await evaluate(MEND);
  await tapOn('.refresh-button');
  if (!await reloaded()) return 'Refresh did not reload once saving worked again';
  if (JSON.stringify(await savedTexts()) !== '["pip dived"]') return `after the mended Refresh the book holds ${JSON.stringify(await savedTexts())}`;

  // The database never answers: Refresh gives up in time, stays, and shows the mark.
  await change('pip ran', STALL);
  const gaveUp = await refreshAndWait(25);
  if (!await evaluate('window.__same === true')) return 'Refresh reloaded although the save never finished';
  if (!gaveUp) return 'Refresh waited for ever on a save the database never answered';
  if (!await markShows()) return 'no "not saved" mark after the database never answered';
  await evaluate(MEND);

  // One book can't be saved: another book saving does not hide the "not saved" mark. It goes once that book saves.
  await open('', HOME);
  const marks = await evaluate(`(async () => { ${STORE}
    const real = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (record) {
      if (record.id === 'made-up-fails') throw new DOMException('test: disk full', 'QuotaExceededError');
      return real.call(this, record);
    };
    await store.saveBook(book.newBook('made-up-fails', 1)).catch(() => {});
    await store.saveBook(book.newBook('made-up-saves', 1));
    const afterOther = ${MARK_SHOWS};
    IDBObjectStore.prototype.put = real;
    await store.saveBook(book.newBook('made-up-fails', 1));
    const afterSame = ${MARK_SHOWS};
    await store.deleteBook('made-up-fails');
    await store.deleteBook('made-up-saves');
    return afterOther + '|' + afterSame;
  })()`);
  if (marks !== 'true|false') return `the "not saved" mark showed ${marks} (after another book saved | after the failed book saved), not true|false`;
  return '';
}

/** A book from a newer version: on the shelf with a note, never opened, never changed. Returns a problem, or ''. */
export async function tryNewer() {
  if (!await open('', HOME)) return 'home did not draw';
  const record = { id: 'made-up-newer', format: 99, changed: 5, title: 'From later', chapters: ['one'] };
  await evaluate(`(async () => { ${STORE} await store.startOver(); await store.saveBook(${JSON.stringify(record)}); })()`);
  if (!await open('', 'document.querySelector(".book-card") !== null')) return 'a newer book is not on the shelf';
  const card = await evaluate(`document.querySelector('.book-card').textContent`);
  if (!card.includes('newer version') || !card.includes('Refresh')) return `the newer book's card says "${card}"`;
  if (await evaluate(`document.querySelector('.book-card a, .book-card button') !== null`)) return 'the newer book can be opened or edited from the shelf';
  if (!await open('#book/made-up-newer/0', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the page screen opened a newer book';
  if (!await open('#finish/made-up-newer', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the finish screen opened a newer book';
  if (!await open('#read/made-up-newer', 'location.hash === "" && !document.querySelector(".shelf").hidden')) return 'the reading view opened a newer book';
  if (!await open('#grown-ups', 'document.querySelectorAll(".gu-book").length === 1')) return 'the grown-up page does not list the newer book';
  const kept = await evaluate(`(async () => { ${STORE} return (await store.loadBooks())[0]; })()`);
  if (JSON.stringify(kept) !== JSON.stringify(record)) return `the newer book changed: ${JSON.stringify(kept)}`;
  return '';
}


const SHOTS_AT = (name) => shot(name, PHONE_NOW);
let PHONE_NOW = 0;

/** Finish a book: title, author name (first time only), cover; skip on a second book; closing mid-step; Edit. Returns a problem, or ''. */
export async function tryFinish() {
  await open('', HOME);
  PHONE_NOW = await evaluate('innerWidth');
  const seed = (id, text) => evaluate(`(async () => { ${STORE} await store.saveBook(book.setPageText(book.addPage(book.setPageText(book.newBook(${JSON.stringify(id)}, 1000), 0, ${JSON.stringify(text)}, 1000), 0, 1000), 1, 'It ended.', 1000)); })()`);
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  await seed('made-up-fin-1', 'A frog sat down.');
  if (!await open('#book/made-up-fin-1/0', 'document.querySelector(".keyboard") !== null')) return 'the page screen did not draw';
  await tapButton('Finish');

  // Title step, on the app's keys.
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.keyboard')`, 3)) return 'no title step';
  if (!await noFields()) return 'a text field is on the title step';
  if (await evaluate(`document.querySelector('.finish-top button').textContent`) !== 'Skip') return 'an empty title should offer Skip';
  await press('t', 'r', 'e', 'e');
  if (await typed() !== 'tree') return `the title holds "${await typed()}"`;
  if (!(await evaluate(`document.querySelector('.finish-top button').textContent`)).includes('Next')) return 'a typed title should offer Next';
  let problem = await fitProblem();
  if (problem) return `title step: ${problem}`;
  await tapButton('Next');

  // The name, asked once.
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('author name')`, 3)) return 'no author name step on the first book';
  await press('p', 'i', 'p');
  problem = await fitProblem();
  if (problem) return `name step: ${problem}`;
  await tapButton('Next');

  // The cover: the title, a sticker, "by pip".
  if (!await waitFor(`document.querySelector('.finish-cover .tray-sticker') !== null`, 3)) return 'no cover step';
  if (!await noFields()) return 'a text field is on the cover step';
  const cover = await evaluate(`document.querySelector('.finish-cover').textContent`);
  if (!cover.includes('tree') || !cover.includes('by pip')) return `the cover says "${cover}"`;
  const tray = await middleOf('.tray-sticker');
  await touch(tray.x, tray.y);
  if (!await waitFor(`document.querySelectorAll('.finish-cover .picture .sticker').length === 1`, 2)) return 'a tray tap did not put a sticker on the cover';
  await settle();
  problem = await fitProblem();
  if (problem) return `cover step: ${problem}`;
  await SHOTS_AT('cover-step');
  await tapButton('Done');

  // The shelf: kind message, "Books by pip", the cover with its sticker, Edit.
  if (!await waitFor(`location.hash === '' && document.querySelector('.book-card')`, 3)) return 'Done did not go back to the shelf';
  if (!await evaluate(`document.querySelector('.shelf-message')?.textContent.includes('Your book is on the shelf!')`)) return 'no kind message on the shelf';
  const shelfNow = `document.querySelector('h1').textContent === 'Books by pip' && document.querySelector('.book-card .cover-title').textContent === 'tree' && document.querySelectorAll('.book-card .cover .sticker').length === 1`;
  if (!await waitFor(shelfNow, 3)) return 'the shelf does not show "Books by pip" and the cover';
  // Reload: same.
  await open('', 'document.querySelector(".book-card .cover .sticker") !== null');
  if (!await waitFor(shelfNow, 3)) return 'after a reload the shelf does not show "Books by pip" and the cover';
  problem = await fitProblem();
  if (problem) return `shelf: ${problem}`;
  await SHOTS_AT('shelf');
  const kept = await evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); return [one.finished, one.title, one.cover?.stickers.length, await store.getSetting('author')].join('|'); })()`);
  if (kept !== 'true|tree|1|pip') return `the saved book is "${kept}"`;

  // Edit opens the pages; Finish again asks for the title (already filled in) and not for the name.
  await tapButton('Edit');
  if (!await waitFor(`location.hash === '#book/made-up-fin-1/0' && document.querySelector('.keyboard')`, 3)) return 'Edit did not open the pages';
  await tapButton('Finish');
  if (!await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called') && document.querySelector('.writing .ch')`, 3)) return 'Edit then Finish did not show the title again';
  if (await typed() !== 'tree') return `the title step shows "${await typed()}"`;
  await tapButton('Next');
  if (!await waitFor(`document.querySelector('.finish-cover')`, 3)) return 'the name was asked a second time';
  await tapButton('Done');
  await waitFor(`location.hash === ''`, 3);

  // Closing the app mid-step: a second book, title typed, then the app opens again with nothing lost.
  await seed('made-up-fin-2', 'The moon came out.');
  await open('#book/made-up-fin-2/0', 'document.querySelector(".keyboard") !== null');
  await tapButton('Finish');
  await waitFor(`document.querySelector('.screen h1')?.textContent.includes('called')`, 3);
  await press('m', 'o', 'o', 'n');
  await open('', 'document.querySelectorAll(".book-card").length === 2');
  const two = await evaluate(`(async () => { ${STORE} const b = (await store.loadBooks()).find((one) => one.id === 'made-up-fin-2'); return b.finished + '|' + b.title; })()`);
  if (two !== 'true|moon') return `closing mid-step left the book as "${two}"`;
  return '';
}


// A pretend voice, put in the page before it loads (headless Chrome cannot speak).
const FAKE_VOICE = `(() => {
  window.__spoken = []; window.__cancels = 0;
  class Utter { constructor(text) { this.text = text; } }
  window.SpeechSynthesisUtterance = Utter;
  let timer = 0;
  const synth = {
    getVoices: () => [{ name: 'Ava', lang: 'en-US', localService: true, voiceURI: 'Ava' }],
    cancel() { window.__cancels++; clearTimeout(timer); },
    speak(u) {
      window.__spoken.push(u.text);
      if (window.__words) timer = setTimeout(() => u.onboundary?.({ name: 'word', charIndex: 0, charLength: 3 }), 60);
      timer = setTimeout(() => u.onend?.(), 250);
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
})()`;
const NO_VOICE = `(() => { delete window.speechSynthesis; delete Window.prototype.speechSynthesis; })()`;

/** "Read to me": underlines sentences in order, turns the page, Stop and a hand-turn stop it; hidden with no voice. */
export async function tryReadAloud() {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    let b = book.setPageText(book.newBook('made-up-read-1', 1000), 0, 'The frog sat. The frog hopped!', 1000);
    b = book.setPageText(book.addPage(b, 0, 1000), 1, 'Then it swam.', 1000);
    await store.saveBook({ ...b, finished: true });
  })()`);
  const ready = 'document.querySelector(".read-page") !== null';
  const label = () => evaluate(`document.querySelector('.read-voice').textContent`);
  const now = () => evaluate(`document.querySelector('.read-now, .read-word')?.textContent ?? ''`);
  const watch = `window.__seen = []; new MutationObserver(() => { const t = document.querySelector('.read-now')?.textContent; if (t && window.__seen.at(-1) !== t) window.__seen.push(t); }).observe(document.body, { subtree: true, childList: true });`;

  // Sentences in order, then the page turns by itself, and at the end the button is back.
  let script = (await page('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_VOICE })).identifier;
  if (!await open('#read/made-up-read-1', ready)) return 'the reading view did not draw';
  if (await evaluate(`document.querySelector('.read-voice').hidden`)) return 'Read to me is hidden although there is a voice';
  if (await label() !== '🔊 Read to me') return `the button says "${await label()}"`;
  await evaluate(watch);
  await tapButton('Read to me');
  if (await label() !== '⏹ Stop') return 'the button did not become Stop';
  if (!await waitFor(`document.querySelector('.read-count').textContent === 'Page 2 of 2'`, 4)) return 'reading did not turn the page';
  if (!await waitFor(`document.querySelector('.read-voice').textContent === '🔊 Read to me'`, 4)) return 'the button did not come back at the end';
  const seen = JSON.stringify(await evaluate('window.__seen'));
  if (seen !== '["The frog sat.","The frog hopped!","Then it swam."]') return `underlined ${seen}`;
  if (await now()) return 'an underline was left after reading';

  // Stop stops it, and nothing more is spoken.
  await tapButton('Previous');
  await evaluate('window.__spoken.length = 0');
  await tapButton('Read to me');
  if (!await waitFor(`document.querySelector('.read-now')?.textContent === 'The frog sat.'`, 2)) return 'the first sentence was not underlined';
  await tapButton('Stop');
  if (await label() !== '🔊 Read to me' || await now()) return 'Stop did not clear the button and the underline';
  await sleep(500); // nothing to await for "nothing more happens": the pretend voice ends a sentence after 250ms, so wait twice that
  if (await evaluate('window.__spoken.length') !== 1) return `${await evaluate('window.__spoken.length')} sentences were spoken around Stop`;

  // Turning a page by hand stops it.
  await tapButton('Read to me');
  await waitFor(`document.querySelector('.read-now') !== null`, 2);
  await tapButton('Next');
  if (await label() !== '🔊 Read to me' || await now()) return 'turning a page by hand did not stop reading';
  // Closing the book stops it.
  await evaluate('window.__cancels = 0');
  await tapButton('Read to me');
  await tapButton('Close');
  if (await evaluate('window.__cancels') < 1) return 'closing the book did not stop the voice';

  // Word timing, when the device sends it: the word is underlined, not the sentence.
  await open('#read/made-up-read-1', ready);
  await evaluate('window.__words = true');
  await tapButton('Read to me');
  if (!await waitFor(`document.querySelector('.read-word')?.textContent === 'The' && !document.querySelector('.read-now')`, 3)) return 'the word was not underlined when word timing came';
  await tapButton('Stop');
  await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });

  // No voice: the button is hidden.
  script = (await page('Page.addScriptToEvaluateOnNewDocument', { source: NO_VOICE })).identifier;
  const shown = await open('#read/made-up-read-1', ready) && !await evaluate(`document.querySelector('.read-voice').hidden`);
  await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
  if (shown) return 'Read to me shows on a device with no voice';
  return '';
}

