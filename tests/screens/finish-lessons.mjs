// finish-lessons.mjs: the steps after the cover that teach: "Hear your book", the self-check,
// one "make it better" job, the kind message. The lesson wording is served from
// data/lessons.json, the real wording.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import { readFileSync } from 'node:fs';
import {
  page, evaluate, waitFor, settle, HOME, open, tapOn, tapButton, noFields, fitProblem, STORE, shot, lessonFiles,
} from './lib.mjs';

const wording = JSON.parse(readFileSync(new URL('../../data/lessons.json', import.meta.url), 'utf8'));
const [lesson1, lesson2] = wording.lessons;
const STORY = ['Pip the frog lived in a pond. Pip wanted to fly.', 'Pip asked an owl for help. The owl said yes!', 'Up they went. The end.'];

// A pretend voice (headless Chrome cannot speak): each sentence "ends" after 150 ms.
const FAKE_VOICE = `(() => {
  window.__spoken = []; window.__cancels = 0;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  let timer = 0;
  const synth = {
    getVoices: () => [{ name: 'Ava', lang: 'en-US', localService: true, voiceURI: 'Ava' }],
    cancel() { window.__cancels++; clearTimeout(timer); },
    speak(u) { window.__spoken.push(u.text); timer = setTimeout(() => u.onend?.(), 150); },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
})()`;
const NO_VOICE = `(() => { delete window.speechSynthesis; delete Window.prototype.speechSynthesis; })()`;

/** Run `check` with a pretend voice (or none) put in every page before it loads. */
async function withVoice(source, check) {
  const { identifier } = await page('Page.addScriptToEvaluateOnNewDocument', { source });
  try { return await check(); } finally { await page('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
}

/** Start over with one book of `texts`, and settings (author, progress). */
async function fresh(id, texts, settings = {}) {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    const texts = ${JSON.stringify(texts)};
    let b = book.setPageText(book.newBook(${JSON.stringify(id)}, 1000), 0, texts[0], 1000);
    for (let i = 1; i < texts.length; i++) b = book.setPageText(book.addPage(b, i - 1, 1000), i, texts[i], 1000);
    await store.saveBook(b);
    for (const [key, value] of Object.entries(${JSON.stringify(settings)})) await store.setSetting(key, value);
  })()`);
}

/** What is saved: the book's finished and lesson, and how many lessons are open. */
const saved = (id) => evaluate(`(async () => { ${STORE}
  const b = (await store.loadBooks()).find((one) => one.id === ${JSON.stringify(id)});
  return [b?.finished, b?.lesson ?? 'none', (await store.getSetting('progress'))?.lessonsOpened ?? 'none'].join('|');
})()`);

const title = () => evaluate(`document.querySelector('.finish-top h1')?.textContent ?? ''`);
const topLabel = () => evaluate(`document.querySelector('.finish-top .pill')?.textContent ?? ''`);
const onStep = (words) => waitFor(`document.querySelector('.finish-top h1')?.textContent === ${JSON.stringify(words)}`, 4);
const tapTop = () => tapOn('.finish-top .pill');
const cardSays = () => evaluate(`document.querySelector('.finish-card')?.textContent ?? ''`);
const width = () => evaluate('innerWidth');
/** A screenshot at phone width only, named <name>-finish-375.png. */
const snap = async (name) => { if (await width() === 375) { await settle(); await shot(`${name}-finish`, 375); } };

/** Open the book and tap Finish; the title step shows. */
async function finish(id) {
  if (!await open(`#book/${id}/0`, 'document.querySelector(".keyboard") !== null')) return false;
  await tapButton('Finish');
  return onStep('What\'s your book called?');
}

/** On a finish step: no text field, and it fits. Returns a problem or ''. */
async function looksRight(step) {
  if (!await noFields()) return `${step}: a text field is on screen`;
  const problem = await fitProblem();
  return problem ? `${step}: ${problem}` : '';
}

/** Nothing on screen may read as a test. */
const NOT_A_TEST = /wrong|correct|try again|✗|score|❌/i;
const soundsLikeATest = () => evaluate('document.body.innerText').then((text) => NOT_A_TEST.test(text));

/** Every step taken: hear the book, tap a sentence, "Do it", Finish again, "Not now", the kind message. */
export async function tryLessonSteps() {
  return await withVoice(FAKE_VOICE, async () => {
    await fresh('made-up-take', STORY, { author: 'pip', progress: { lessonsOpened: 2 } }); // lesson 2: tap a sentence
    if (!await finish('made-up-take')) return 'Finish did not open the title step';
    // Saved before anything showed: finished, with its lesson, and lesson 3 open.
    let now = await saved('made-up-take');
    if (now !== `true|${lesson2.id}|3`) return `when the title step showed, the saved state was "${now}"`;

    await tapTop(); // title: Skip
    if (!await waitFor(`document.querySelector('.finish-cover .tray-sticker')`, 3)) return 'no cover step';
    if (await topLabel() !== 'Skip') return 'the cover step should offer Skip (more steps follow)';
    await tapOn('.tray-sticker');
    if (!await waitFor(`document.querySelector('.finish-top .pill').textContent === 'Next ›'`, 2)) return 'a cover sticker should turn Skip into Next (not Done: more steps follow)';
    await tapTop();

    // Hear your book: Read to me from page 1.
    if (!await onStep('Hear your book')) return `no "Hear your book" step (on "${await title()}")`;
    let problem = await looksRight('hear');
    if (problem) return problem;
    if (await evaluate(`document.querySelector('.read-count').textContent`) !== 'Page 1 of 3') return 'Hear your book did not start on page 1';
    await tapOn('.read-voice');
    if (!await waitFor(`window.__spoken.length >= 2`, 3)) return 'Read to me did not read';
    if (await topLabel() !== 'Next ›') return 'after Read to me the step should offer Next';
    const cancels = await evaluate('window.__cancels');
    await tapTop(); // leaving while it reads stops it
    if (await evaluate('window.__cancels') <= cancels) return 'leaving Hear your book did not stop the reading';

    // The self-check, sentence kind.
    if (!await onStep(lesson2.selfCheck.prompt)) return `no sentence self-check (on "${await title()}")`;
    problem = await looksRight('sentence self-check');
    if (problem) return problem;
    const sentences = await evaluate(`[...document.querySelectorAll('.finish-sentence')].map((b) => b.textContent).join('|')`);
    if (sentences !== 'Pip the frog lived in a pond.|Pip wanted to fly.') return `page 1's sentences are "${sentences}"`;
    if (!await evaluate(`document.querySelector('.finish-not-yet').textContent.includes(${JSON.stringify(lesson2.selfCheck.notYet)})`)) return 'no "I don\'t have one yet"';
    await tapOn('.read-nav .pill', 1); // the next page of sentences
    if (!await waitFor(`document.querySelector('.finish-sentence').textContent === 'Pip asked an owl for help.'`, 2)) return 'the sentences did not turn to page 2';
    await tapOn('.read-nav .pill', 0);
    await waitFor(`document.querySelector('.finish-sentence').textContent === 'Pip the frog lived in a pond.'`, 2);
    await tapOn('.finish-sentence', 1);
    if (!await waitFor(`document.querySelector('.finish-sentence.finish-picked')?.textContent === 'Pip wanted to fly.'`, 1)) return 'the tapped sentence was not marked';
    await snap('sentence-check');
    if (await soundsLikeATest()) return 'the self-check reads like a test';

    // One job: "Do it" opens the book to write.
    if (!await onStep('Make it better')) return `the self-check did not move on to the job (on "${await title()}")`;
    if (!(await cardSays()).includes(lesson2.job)) return `the job says "${await cardSays()}"`;
    if (await evaluate(`document.querySelectorAll('.finish-card').length`) !== 1) return 'more than one job';
    problem = await looksRight('job');
    if (problem) return problem;
    await snap('job');
    await tapButton('Do it');
    if (!await waitFor(`location.hash === '#book/made-up-take/0' && document.querySelector('.keyboard')`, 3)) return '"Do it" did not open the book to write';
    if (!await waitFor(`document.querySelectorAll('.picture .sticker').length === 0 && document.querySelector('.writing .ch')`, 2)) return 'the book did not open';

    // Finish the same book again: no second lesson, the same lesson's steps.
    await tapButton('Finish');
    if (!await onStep('What\'s your book called?')) return 'Finish again did not open the title step';
    now = await saved('made-up-take');
    if (now !== `true|${lesson2.id}|3`) return `finishing the same book again saved "${now}" (another lesson opened?)`;
    await tapTop();
    if (!await waitFor(`document.querySelectorAll('.finish-cover .picture .sticker').length === 1`, 3)) return 'the cover sticker was lost';
    await tapTop();
    await onStep('Hear your book');
    await tapTop();
    await onStep(lesson2.selfCheck.prompt);
    await tapOn('.finish-sentence', 1);
    await onStep('Make it better');
    await tapButton('Not now');

    // The kind message names the tapped page; "Read it to someone!"; Done goes to the shelf.
    if (!await waitFor(`document.querySelector('.finish-card-more')`, 3)) return '"Not now" did not show the kind message';
    const kind = await cardSays();
    if (!kind.includes(lesson2.praise.replace('{page}', 1)) || !kind.includes(wording.messages.readItToSomeone)) return `the kind message says "${kind}"`;
    if (await topLabel() !== '✓ Done') return 'the kind message should end with Done';
    problem = await looksRight('kind message');
    if (problem) return problem;
    await snap('kind-message');
    await tapTop();
    if (!await waitFor(`location.hash === '' && document.querySelector('.shelf-message')`, 3)) return 'Done did not go to the shelf';
    now = await saved('made-up-take');
    return now === `true|${lesson2.id}|3` ? '' : `at the end the saved state was "${now}"`;
  });
}

/** Every step skipped (and no voice, so no "Hear your book"); then the plain kind message. */
export async function tryLessonSkips() {
  return await withVoice(NO_VOICE, async () => {
    await fresh('made-up-skip', STORY); // no author, no progress: lesson 1, tap two pages
    if (!await finish('made-up-skip')) return 'Finish did not open the title step';
    await tapTop();
    if (!await onStep('What\'s your author name?')) return 'no author name step';
    await tapTop();
    if (!await onStep('Add stickers to your cover')) return 'no cover step';
    await tapTop();
    if (!await onStep(lesson1.selfCheck.prompt)) return `with no voice the self-check should come next (on "${await title()}")`;
    await tapTop();
    if (!await onStep('Make it better')) return 'Skip on the self-check did not go to the job';
    if (!(await cardSays()).includes(lesson1.job)) return `the job says "${await cardSays()}"`;
    await tapButton('Not now');
    if (!await waitFor(`document.querySelector('.finish-card-more')`, 3)) return 'no kind message';
    if (!(await cardSays()).includes(wording.messages.finished)) return `after skipping, the kind message says "${await cardSays()}"`;
    await tapTop();
    if (!await waitFor(`location.hash === '' && document.querySelector('.book-card')`, 3)) return 'Done did not go to the shelf';
    const now = await saved('made-up-skip');
    return now === `true|${lesson1.id}|2` ? '' : `after skipping everything the saved state was "${now}"`;
  });
}

/** "I don't have one yet", then "Go back and add it"; then Carry on; then two pages tapped. */
export async function tryNotYet() {
  return await withVoice(NO_VOICE, async () => {
    await fresh('made-up-notyet', STORY, { author: 'pip' });
    const toCheck = async () => {
      if (!await finish('made-up-notyet')) return false;
      await tapTop();
      await onStep('Add stickers to your cover');
      await tapTop();
      return onStep(lesson1.selfCheck.prompt);
    };
    if (!await toCheck()) return 'no two-page self-check';
    let problem = await looksRight('two-page self-check');
    if (problem) return problem;
    await tapOn('.finish-not-yet');
    if (!await waitFor(`document.querySelector('.finish-card')?.textContent.includes(${JSON.stringify(lesson1.selfCheck.notYetOffer)})`, 2)) return 'no kind offer after "I don\'t have one yet"';
    problem = await looksRight('not yet');
    if (problem) return problem;
    if (await soundsLikeATest()) return 'the offer reads like a test';
    await tapButton('Go back and add it');
    if (!await waitFor(`location.hash === '#book/made-up-notyet/0' && document.querySelector('.keyboard')`, 3)) return '"Go back and add it" did not open the book to write';

    // Back to the check: one page tapped, then "I don't have one yet" and "Carry on": the kind message names that page.
    if (!await toCheck()) return 'Finish again did not reach the self-check';
    await tapOn('.finish-page', 2);
    await onStep(lesson1.selfCheck.secondPrompt);
    await tapOn('.finish-not-yet');
    await tapButton('Carry on');
    if (!await onStep('Make it better')) return '"Carry on" did not go to the job';
    await tapButton('Not now');
    await waitFor(`document.querySelector('.finish-card-more')`, 3);
    if (!(await cardSays()).includes(lesson1.praise.replace('{page}', 3))) return `after a tap and "Carry on" the kind message says "${await cardSays()}"`;
    await tapTop();
    await waitFor(`location.hash === ''`, 3);

    // Tap a page, then a second page: each is marked; the kind message names the first.
    if (!await toCheck()) return 'a third Finish did not reach the self-check';
    if (await evaluate(`document.querySelectorAll('.finish-page').length`) !== 3) return 'the self-check does not show the 3 pages';
    await tapOn('.finish-page', 0);
    if (!await onStep(lesson1.selfCheck.secondPrompt)) return 'the second prompt did not show after the first tap';
    if (await evaluate(`document.querySelectorAll('.finish-picked').length`) !== 1) return 'the first tap was not marked';
    await snap('page-check');
    await tapOn('.finish-page', 2);
    if (!await waitFor(`document.querySelectorAll('.finish-picked').length === 2`, 1)) return 'the second tap was not marked';
    if (!await onStep('Make it better')) return 'the two-page check did not move on';
    await tapButton('Not now');
    await waitFor(`document.querySelector('.finish-card-more')`, 3);
    if (!(await cardSays()).includes(lesson1.praise.replace('{page}', 1))) return `the kind message says "${await cardSays()}"`;
    const now = await saved('made-up-notyet');
    return now === `true|${lesson1.id}|2` ? '' : `after three Finishes the saved state was "${now}" (one lesson should open)`;
  });
}

/** Close the app at each step, open it again: the book is finished and one lesson opened. */
export async function tryCloseAtEachStep() {
  return await withVoice(FAKE_VOICE, async () => {
    const steps = ['What\'s your book called?', 'Add stickers to your cover', 'Hear your book', lesson1.selfCheck.prompt, 'Make it better', 'kind'];
    for (let n = 0; n < steps.length; n++) {
      await fresh('made-up-close', STORY, { author: 'pip' });
      if (!await finish('made-up-close')) return 'Finish did not open the title step';
      for (let k = 0; k < n; k++) {
        if (steps[k] === 'Make it better') await tapButton('Not now');
        else await tapTop();
        if (steps[k + 1] === 'kind' ? !await waitFor(`document.querySelector('.finish-card-more')`, 3) : !await onStep(steps[k + 1])) return `could not reach step ${k + 2}`;
      }
      await open('', HOME); // closed and opened again
      const now = await saved('made-up-close');
      if (now !== `true|${lesson1.id}|2`) return `closed at "${steps[n]}": saved "${now}"`;
      if (!await waitFor(`document.querySelector('.book-card.finished')`, 3)) return `closed at "${steps[n]}": the shelf does not show the book finished`;
    }
    return '';
  });
}

/** A one-page book: the two-page self-check is left out. */
export async function tryOnePage() {
  return await withVoice(NO_VOICE, async () => {
    await fresh('made-up-one', ['Pip sat on a log.'], { author: 'pip' });
    if (!await finish('made-up-one')) return 'Finish did not open the title step';
    await tapTop();
    await onStep('Add stickers to your cover');
    await tapTop();
    if (!await onStep('Make it better')) return `a one-page book should skip the self-check (on "${await title()}")`;
    await tapButton('Not now');
    await waitFor(`document.querySelector('.finish-card-more')`, 3);
    if (!(await cardSays()).includes(wording.messages.finished)) return `the kind message says "${await cardSays()}"`;
    return '';
  });
}

/** No data/lessons.json: Finish is as before lessons (title, cover, Done, the shelf) and saves no progress. */
export async function tryFinishNoLessons() {
  lessonFiles.missing = true;
  try { return await withVoice(FAKE_VOICE, async () => {
    await fresh('made-up-none', STORY, { author: 'pip' });
    const missing = await evaluate(`fetch('data/lessons.json').then((r) => r.status)`);
    if (missing !== 404) return `data/lessons.json answered ${missing}, not 404`;
    if (!await finish('made-up-none')) return 'Finish did not open the title step';
    await tapTop();
    if (!await onStep('Add stickers to your cover')) return 'no cover step';
    await tapOn('.tray-sticker');
    if (!await waitFor(`document.querySelector('.finish-top .pill').textContent === '✓ Done'`, 2)) return 'without lessons the cover should be the last step (Done)';
    await tapTop();
    if (!await waitFor(`location.hash === '' && document.querySelector('.shelf-message')?.textContent.includes('Your book is on the shelf!')`, 3)) return 'Done did not go to the shelf with its message';
    const now = await saved('made-up-none');
    return now === 'true|none|none' ? '' : `without lessons the saved state was "${now}"`;
  }); } finally { lessonFiles.missing = false; }
}
