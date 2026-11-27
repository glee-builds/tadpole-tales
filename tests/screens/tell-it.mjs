// tell-it.mjs: Tell it on the page screen and its switch on the grown-up page, with a pretend
// microphone (headless Chrome's real one may hang) and <audio>: record, stop, the 2-minute limit, play,
// record again, the microphone let go, recordings deleted with their page and book, never in a backup.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reachPage, send, page, evaluate, waitFor, until, open, tapOn, tapButton, press, typed, isDisabled, STORE, saveNow, fitProblem, settle, HOME } from './lib.mjs';

// Put in every page before its own scripts: a pretend microphone and recorder, and an <audio> that
// only notes what it was asked to play. window.__tracks lists every microphone track handed out.
const FAKE = `
  window.__tracks = []; window.__heard = []; window.__revoked = 0; window.__refuse = false;
  let made = 0;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
    if (window.__refuse) throw new DOMException('test: refused', 'NotAllowedError');
    const track = { stopped: false, stop() { this.stopped = true; } };
    window.__tracks.push(track);
    return { getTracks: () => [track] };
  } } });
  window.MediaRecorder = class {
    static isTypeSupported(type) { return type === 'audio/webm'; }
    constructor(stream, options) { this.mimeType = options.mimeType || ''; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const data = new Blob(['sound-' + (++made)], { type: this.mimeType });
      setTimeout(() => { this.ondataavailable({ data }); this.onstop(); }, 10);
    }
  };
  const blobs = {};
  const makeUrl = URL.createObjectURL;
  URL.createObjectURL = (blob) => { const url = makeUrl.call(URL, blob); blobs[url] = blob; return url; };
  const revoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => { window.__revoked++; revoke.call(URL, url); };
  window.Audio = class { // a real <audio> would try to play the made-up bytes and give an error
    constructor(src) { this.src = src; }
    play() { window.__audio = this; blobs[this.src].text().then((text) => window.__heard.push(text)); return Promise.resolve(); }
    pause() {}
  };
`;
const NO_RECORDER = 'delete window.MediaRecorder;';

const BOOK = 'made-up-tell';
const bar = 'document.querySelector(".tell-bar")';
const tellSays = (words) => `${bar}?.querySelector(".tell-button").textContent === ${JSON.stringify(words)}`;
/** "Hear it" says `words`, or is hidden when `words` is null. */
const hearSays = (words) => `(() => { const hear = ${bar}?.querySelector(".tell-hear");
  return ${words === null ? '!hear || hear.hidden' : `Boolean(hear) && !hear.hidden && hear.textContent === ${JSON.stringify(words)}`}; })()`;
const micOn = () => evaluate('window.__tracks.filter((track) => !track.stopped).length');
const pageIds = () => evaluate(`(async () => { ${STORE} return (await store.loadBooks()).find((b) => b.id === '${BOOK}').pages.map((p) => p.id); })()`);
/** The words in the test book's recording of page `id`, or null. */
const heardOn = (id) => evaluate(`(async () => { ${STORE} const found = await store.loadRecording('${BOOK}', '${id}'); return found ? new TextDecoder().decode(found.bytes) : null; })()`);
/** How many recordings the database holds, for any book. */
const allRecordings = () => evaluate(`new Promise((resolve) => { const r = indexedDB.open('tadpole-tales'); r.onsuccess = () => { const q = r.result.transaction('recordings').objectStore('recordings').count(); q.onsuccess = () => { r.result.close(); resolve(q.result); }; }; })`);

/** Record on the page on show, then stop by tapping. Returns a problem, or ''. */
async function recordOnce() {
  await tapButton('Tell it');
  if (!await waitFor(`${tellSays('■ Stop')} && ${bar}.querySelector('.tell-note').textContent === '● Recording'`, 3)) return 'tapping Tell it did not start recording with a "Recording" note';
  if (!await waitFor(hearSays(null), 1)) return '"Hear it" shows while recording';
  if (await micOn() !== 1) return `${await micOn()} microphones on while recording`;
  await tapButton('Stop');
  if (await micOn()) return 'the microphone is still on after Stop';
  if (!await waitFor(`${tellSays('🎙 Tell it')} && ${hearSays('▶ Hear it')}`, 3)) return 'after Stop there is no "Hear it"';
  return '';
}

/** Tell it from the grown-up switch to the page screen and back. Returns a problem, or ''. */
export async function tryTellIt() {
  const script = await page('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
  try {
    if (!await open('', HOME)) return 'home did not draw';
    await evaluate(`(async () => { ${STORE} await store.startOver();
      let one = book.setPageText(book.newBook('${BOOK}', 1000), 0, 'page a', 1000);
      await store.saveBook(book.setPageText(book.addPage(one, 0, 1000), 1, 'page b', 1000));
      await store.saveBook(book.setPageText(book.newBook('made-up-other', 1000), 0, 'other', 1000));
    })()`);

    // Off until a grown-up turns it on.
    if (!await open(`#book/${BOOK}/0`, 'document.querySelector(".keyboard") !== null')) return 'the page did not draw';
    await settle();
    if (await evaluate(`${bar} !== null`)) return 'Tell it shows before a grown-up turned it on';
    if (!await open('#grown-ups', 'document.querySelector(".gu-switch") !== null')) return 'the grown-up page has no Tell it switch';
    const sw = await evaluate(`(() => { const s = document.querySelector('.gu-switch'); return { words: s.textContent, on: s.getAttribute('aria-checked'), role: s.getAttribute('role'), note: s.previousElementSibling.textContent }; })()`);
    if (sw.words !== 'Tell it (record your voice): Off' || sw.on !== 'false' || sw.role !== 'switch') return `the switch starts as ${JSON.stringify(sw)}`;
    if (!/stay on this device.*not in backups/.test(sw.note)) return `the switch's line says "${sw.note}"`;
    await tapOn('.gu-switch');
    if (!await waitFor(`document.querySelector('.gu-switch').getAttribute('aria-checked') === 'true'`, 3)) return 'tapping the switch did not turn Tell it on';
    if (await evaluate(`(async () => { ${STORE} return store.getSetting('tellIt'); })()`) !== true) return 'turning Tell it on was not saved';

    // Record, stop by tapping, hear it.
    if (!await open(`#book/${BOOK}/0`, `${bar} !== null`)) return 'Tell it did not show once turned on';
    if (!await waitFor(`${tellSays('🎙 Tell it')} && ${hearSays(null)}`, 2)) return 'a page with no recording should show "Tell it" and no "Hear it"';
    let problem = await recordOnce();
    if (problem) return problem;
    const [first, second] = await pageIds();
    if (await until(() => heardOn(first)) !== 'sound-1') return `after one recording the store has "${await heardOn(first)}"`;
    if (await heardOn(second) !== null) return 'page 2 has a recording it never made';
    await tapButton('Hear it');
    if (!await waitFor(`${hearSays('■ Stop')} && window.__heard.join() === 'sound-1'`, 2)) return `"Hear it" played ${await evaluate('JSON.stringify(window.__heard)')}`;
    await tapButton('Stop');
    if (!await waitFor(`${hearSays('▶ Hear it')} && window.__revoked === 1`, 2)) return 'Stop did not stop playing and let the sound go';
    await tapButton('Hear it');
    await evaluate('window.__audio.onended()');
    if (!await waitFor(`${hearSays('▶ Hear it')} && window.__revoked === 2`, 2)) return 'the end of the sound did not put "Hear it" back';

    // Record again: it replaces the old one.
    problem = await recordOnce();
    if (problem) return `recording again: ${problem}`;
    if (await until(async () => await heardOn(first) === 'sound-2') !== true) return 'recording again did not replace the recording';
    if (await allRecordings() !== 1) return `${await allRecordings()} recordings after recording one page twice`;

    // The limit stops it by itself (shortened for the check), with no tap.
    await evaluate(`(async () => { (await import('/src/record.js')).limit.ms = 300; })()`);
    await tapButton('Tell it');
    if (!await waitFor(tellSays('■ Stop'), 2)) return 'Tell it did not start';
    if (!await waitFor(`${tellSays('🎙 Tell it')} && ${hearSays('▶ Hear it')}`, 3)) return 'the time limit did not stop the recording';
    if (await micOn()) return 'the microphone is on after the limit stopped it';
    if (await until(async () => await heardOn(first) === 'sound-3') !== true) return 'the recording the limit stopped was not saved';
    await evaluate(`(async () => { (await import('/src/record.js')).limit.ms = 120000; })()`);

    // The app hidden while recording: the microphone goes off at once.
    await tapButton('Tell it');
    await waitFor(tellSays('■ Stop'), 2);
    await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState;`);
    if (await micOn()) return 'the microphone is on after the app was hidden';
    if (!await waitFor(hearSays('▶ Hear it'), 3)) return 'hiding the app did not stop recording';

    // Leaving the page while recording (Next): the microphone goes off, and the recording stays with its page.
    await tapButton('Tell it');
    await waitFor(tellSays('■ Stop'), 2);
    await tapButton('Next');
    if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 2'`, 3)) return 'Next did not go to page 2';
    if (await micOn()) return 'the microphone is on after leaving the page';
    if (!await waitFor(hearSays(null), 1)) return 'page 2 shows "Hear it" with no recording of its own';
    // Picture mode has no Tell it, and switching to it stops recording.
    await tapButton('Tell it');
    await waitFor(tellSays('■ Stop'), 2);
    await tapButton('Picture');
    if (!await waitFor('document.querySelector(".tray-sticker") !== null', 3)) return 'Picture mode did not open';
    if (await micOn()) return 'the microphone is on in Picture mode';
    if (await evaluate(`${bar} !== null`)) return 'Tell it shows in Picture mode';
    // Move page 2 (with its recording) to the front: the recording goes with it.
    await tapButton('Earlier');
    await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 1 of 2'`, 3);
    await tapButton('Write');
    if (!await waitFor(hearSays('▶ Hear it'), 3)) return 'the recording did not move with its page';
    await tapButton('Hear it');
    if (!await waitFor(`window.__heard.at(-1) === 'sound-6'`, 2)) return `the moved page played ${await evaluate('window.__heard.at(-1)')}`;
    await tapButton('Stop');

    // Remove a page, put it back: its recording stays. Remove it and leave the book: its recording is gone.
    await saveNow();
    if (await heardOn(first) !== 'sound-5' || await heardOn(second) !== 'sound-6') return `the recordings are "${await heardOn(first)}" and "${await heardOn(second)}", not sound-5 (left by Next) and sound-6 (left by Picture)`;
    await tapButton('Remove');
    if (!await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`, 3)) return 'Remove did not offer "Put page back"';
    await tapButton('Put page back');
    if (!await waitFor(hearSays('▶ Hear it'), 3)) return 'a page put back lost its recording';
    await tapButton('Remove');
    await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 1 of 1'`, 3);
    await evaluate(`location.hash = ''`);
    await waitFor(HOME, 3);
    if (await until(async () => await allRecordings() === 1, 3) !== true || await heardOn(first) !== 'sound-5') return `after removing a page and leaving the book there are ${await allRecordings()} recordings`;

    // Never in the backup file, and a restore leaves recordings alone.
    const downloads = mkdtempSync(join(tmpdir(), 'tadpole-tales-tell-'));
    try {
      await open('#grown-ups', `[...document.querySelectorAll('.grownups button')].some((b) => b.textContent === 'Back up all books' && !b.disabled)`);
      await evaluate('navigator.canShare = undefined');
      await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await tapButton('Back up all books');
      const name = await until(() => readdirSync(downloads).find((file) => file.endsWith('.json')));
      if (!name) return 'no backup file was made';
      const text = readFileSync(join(downloads, name), 'utf8');
      if (!text.includes('page a') || /sound-|"bytes"|audio\//.test(text)) return 'the backup file holds a recording (or not the book)';
      const { result } = await page('Runtime.evaluate', { expression: `document.querySelector('.gu-pick input')` });
      await page('DOM.setFileInputFiles', { files: [join(downloads, name)], objectId: result.objectId });
      await waitFor(`/^[✓⚠]/.test(document.querySelector('.gu-pick + .gu-note').textContent)`, 5);
      if (await allRecordings() !== 1) return `a restore changed the recordings: ${await allRecordings()}`;
    } finally {
      rmSync(downloads, { recursive: true, force: true });
    }

    // Deleting the book deletes its recordings; other books' stay. Start over deletes every one.
    await evaluate(`(async () => { ${STORE} await store.saveRecording('made-up-other', 'p0', new ArrayBuffer(4), 'audio/webm'); await store.deleteBook('${BOOK}'); })()`);
    if (await allRecordings() !== 1) return `deleting the book left ${await allRecordings()} recordings, not the other book's 1`;
    await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
    if (await allRecordings() !== 0) return 'start over left recordings';

    // The microphone refused: a calm note, and the page still works.
    await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', true); await store.saveBook(book.newBook('${BOOK}', 1000)); })()`);
    if (!await open(`#book/${BOOK}/0`, `${bar} !== null`)) return 'Tell it did not show for the refusal check';
    await evaluate('window.__refuse = true');
    await tapButton('Tell it');
    if (!await waitFor(`${tellSays('🎙 Tell it')} && /microphone is off.*grown-up/.test(${bar}.querySelector('.tell-note').textContent)`, 3)) return `a refused microphone said "${await evaluate(`${bar}.querySelector('.tell-note').textContent`)}"`;
    if (await isDisabled('Tell it')) return 'Tell it is off after a refusal';
    await press('h', 'i');
    if (await typed() !== 'hi') return 'typing stopped working after the microphone was refused';

    // A recording on a page with no words keeps the book.
    await evaluate(`(async () => { ${STORE} await store.startOver(); await store.setSetting('tellIt', true); })()`);
    await open('', HOME);
    await tapOn('.go');
    await reachPage();
    if (!await waitFor(`${bar} !== null`, 3)) return 'Tell it did not show on a new book';
    problem = await recordOnce();
    if (problem) return `on a new book: ${problem}`;
    await evaluate(`location.hash = ''`);
    if (!await waitFor('document.querySelectorAll(".book-card:not(.example-card)").length === 1', 3)) return 'a new book with only a recording was not kept';
    if (await allRecordings() !== 1) return 'the new book\'s recording was not kept';
  } finally {
    await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier });
  }

  // A device that can't record: no Tell it, even when turned on, and the switch says why.
  const none = await page('Page.addScriptToEvaluateOnNewDocument', { source: NO_RECORDER });
  try {
    await evaluate(`(async () => { ${STORE} await store.startOver(); await store.setSetting('tellIt', true); await store.saveBook(book.newBook('${BOOK}', 1000)); })()`);
    if (!await open(`#book/${BOOK}/0`, 'document.querySelector(".keyboard") !== null')) return 'the page did not draw without a recorder';
    await settle();
    if (await evaluate(`${bar} !== null`)) return 'Tell it shows on a device that can\'t record';
    if (!await open('#grown-ups', 'document.querySelector(".gu-switch") !== null')) return 'no switch without a recorder';
    if (!await waitFor(`document.querySelector('.gu-switch').disabled && document.querySelector('.gu-switch + .gu-note').textContent.includes('can\\'t record')`, 2)) return 'the switch does not say this device can\'t record';
  } finally {
    await page('Page.removeScriptToEvaluateOnNewDocument', { identifier: none.identifier });
  }
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  return '';
}

/**
 * Tell it takes the picture's room: the keys never move. A full page (with the put-back bar too) and a
 * short page with a lesson row still fit; where the words already don't fit, they get no smaller. Returns a problem, or ''.
 */
export const tryTellItFits = async () => {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    const long = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. '.repeat(5).slice(0, 300);
    const lesson = { lesson: 'three-acts', plan: { who: 'Pip, a small green frog' } };
    let one = book.setPageText(book.newBook('made-up-tellfit', 1000), 0, long, 1000);
    await store.saveBook(book.setPageText(book.addPage(one, 0, 1000), 1, 'Two fish.', 1000));
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-tellfit-lesson', 1000), 0, long, 1000), ...lesson });
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-tellfit-short', 1000), 0, 'Two fish.', 1000), ...lesson });
  })()`);
  /** Where the words and keys sit on a page, with Tell it on or off. */
  const layout = async (address, on) => {
    await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', ${on}); })()`);
    if (!await open(address, `document.querySelector(".keyboard") !== null && (${bar} !== null) === ${on}`)) return null;
    await settle();
    return { problem: await fitProblem(), ...await evaluate(`({ words: document.querySelector('.writing').offsetHeight, keys: JSON.stringify(document.querySelector('.keyboard').getBoundingClientRect()) })`) };
  };
  for (const [name, address] of [
    ['a full page', '#book/made-up-tellfit/0'],
    ['a short page with a lesson row', '#book/made-up-tellfit-short/0'],
    ['a full page with a lesson row', '#book/made-up-tellfit-lesson/0'], // at 375 x 667 the words don't fit even with Tell it off
  ]) {
    const off = await layout(address, false);
    const on = await layout(address, true);
    if (!off || !on) return `${name} did not draw`;
    if (off.keys !== on.keys) return `${name}: Tell it moved the keys`;
    if (!off.problem && on.problem) return `${name}: ${on.problem}`;
    if (off.problem && on.words < off.words) return `${name}: Tell it made the words' area ${off.words - on.words}px smaller`;
  }
  await open('#book/made-up-tellfit/0', `${bar} !== null`);
  await tapButton('Remove');
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`, 3);
  await settle();
  const problem = await fitProblem();
  if (problem) return `with the put-back bar: ${problem}`;
  await evaluate(`(async () => { ${STORE} await store.startOver(); })()`);
  return '';
};
