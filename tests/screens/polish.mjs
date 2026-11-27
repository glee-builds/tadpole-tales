// polish.mjs: the "Spelling check" step after the "make it better" job. Words are made up
// misspellings; the lesson wording is the real data/lessons.json.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import {
  page, evaluate, waitFor, settle, HOME, open, tapOn, tapButton, noFields, fitProblem, STORE, shot,
} from './lib.mjs';

const NO_VOICE = `(() => { delete window.speechSynthesis; delete Window.prototype.speechSynthesis; })()`;
const TEXT0 = 'I have a frend. We sit on a rok.';
const TEXT1 = 'pipp went hom and had fun.';
const MANY = 'I like my frend and my rok and hom. We ate lunc with bred. The dogg is nise. At scool I had a cak. My mothr and sistr plaed.';

/** Run `check` with `source` put in every page before it loads. */
async function withScript(source, check) {
  const { identifier } = await page('Page.addScriptToEvaluateOnNewDocument', { source });
  try { return await check(); } finally { await page('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
}

/** Start over with one finished-looking book: pages `texts`, a plan (who), and the author name "tess". */
async function fresh(id, texts, who = 'Pipp the frog') {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    const texts = ${JSON.stringify(texts)};
    let b = book.setPageText(book.newBook(${JSON.stringify(id)}, 1000), 0, texts[0], 1000);
    for (let i = 1; i < texts.length; i++) b = book.setPageText(book.addPage(b, i - 1, 1000), i, texts[i], 1000);
    await store.saveBook({ ...b, plan: { who: ${JSON.stringify(who)} } });
    await store.setSetting('author', 'tess');
  })()`);
}

/** The saved text of every page of the book. */
const savedPages = (id) => evaluate(`(async () => { ${STORE}
  return (await store.loadBooks()).find((b) => b.id === ${JSON.stringify(id)}).pages.map((p) => p.text);
})()`);

const title = () => evaluate(`document.querySelector('.finish-top h1')?.textContent ?? ''`);
const asks = () => evaluate(`document.querySelector('.polish .finish-card-words')?.textContent ?? ''`);
const highlighted = () => evaluate(`document.querySelector('.polish-word')?.textContent ?? ''`);
const onKind = () => waitFor(`document.querySelector('.finish-card-more')`, 4);

/** Open the book, tap Finish and go on to the spelling check. Resolves to what the screen shows then. */
async function toPolish(id) {
  if (!await open(`#book/${id}/0`, 'document.querySelector(".keyboard") !== null')) return 'the book did not open';
  await tapButton('Finish');
  for (let i = 0; i < 12; i++) {
    await waitFor(`document.querySelector('.finish-top h1, .finish-card-more')`, 3);
    if (await evaluate(`document.querySelector('.finish-card-more') !== null`)) return 'kind message';
    if (await asks()) return 'asks';
    const heading = await title();
    if (heading === 'Make it better') await tapButton('Not now');
    else if (await evaluate(`document.querySelector('.finish-page') !== null`)) { await tapOn('.finish-page', 0); await tapOn('.finish-page', 1); await waitFor(`document.querySelector('.finish-top h1')?.textContent !== ${JSON.stringify(heading)}`, 3); }
    else await tapOn('.finish-top .pill');
    await settle();
  }
  return 'lost';
}

/** The step's words and buttons, at its best: a problem or ''. */
async function looksRight() {
  if (!await noFields()) return 'a text field is on screen';
  const problem = await fitProblem();
  if (problem) return problem;
  const text = await evaluate('document.body.innerText');
  if (/wrong|incorrect|mistake|error|✗|❌/i.test(text)) return `the step says something that reads as a fault: "${text}"`;
  return evaluate(`[...document.querySelectorAll('.polish button')].every((b) => b.getBoundingClientRect().height >= 48) ? '' : 'a button is under 48px'`);
}

export async function tryPolish() {
  return await withScript(NO_VOICE, async () => {
      // A misspelled book is asked, one word at a time, names from the plan left out.
      await fresh('made-up-polish', [TEXT0, TEXT1]);
      if (await toPolish('made-up-polish') !== 'asks') return 'a book with misspellings was not asked';
      if (await title() !== 'Spelling check') return `the title is "${await title()}"`;
      if (await asks() !== 'Did you mean friend?' || await highlighted() !== 'frend') return `the first question is "${await asks()}" on "${await highlighted()}"`;
      if (!await evaluate(`document.querySelector('.polish-sentence').textContent === ${JSON.stringify(TEXT0.split('. ')[0] + '.')}`)) return 'the word is not shown in its own sentence';
      if (await evaluate(`document.querySelector('.polish-count').textContent`) !== '1 of 3') return 'pipp (a name in the plan) was asked, or the count is wrong';
      let problem = await looksRight();
      if (problem) return `question: ${problem}`;
      if (await evaluate(`document.querySelectorAll('.finish-top .pill')[0].textContent`) !== 'Skip') return 'no Skip';
      await shot('polish-step', 375);

      // "Use it" changes only that word, and saves right away (before the next word shows).
      await tapButton('friend');
      if (!await waitFor(`document.querySelector('.polish .finish-card-words')?.textContent === 'Did you mean rock?'`, 3)) return '"friend" did not go on to the next word';
      const afterFirst = await savedPages('made-up-polish');
      if (afterFirst.join('|') !== `I have a friend. We sit on a rok.|${TEXT1}`) return `after "friend" the saved pages are "${afterFirst.join('|')}"`;
      // "Keep mine" changes nothing.
      await tapButton('Keep mine');
      if (!await waitFor(`document.querySelector('.polish .finish-card-words')?.textContent === 'Did you mean home?'`, 3)) return '"Keep mine" did not go on';
      if ((await savedPages('made-up-polish')).join('|') !== afterFirst.join('|')) return '"Keep mine" changed the book';
      // Skip mid-way keeps the earlier choices and goes on to the kind message.
      await tapOn('.finish-top .pill');
      if (!await onKind()) return 'Skip did not go on to the kind message';
      if ((await savedPages('made-up-polish')).join('|') !== afterFirst.join('|')) return 'Skip changed the book';

      // Close mid-way and open again: the choice made is kept, and the word answered is not asked again.
      await fresh('made-up-close', [TEXT0, TEXT1]);
      await toPolish('made-up-close');
      await tapButton('friend');
      await waitFor(`document.querySelector('.polish .finish-card-words')?.textContent === 'Did you mean rock?'`, 3);
      await open('', HOME); // as if the app was closed and opened again
      if ((await savedPages('made-up-close'))[0] !== 'I have a friend. We sit on a rok.') return 'closing mid-way lost the chosen word';
      if (await toPolish('made-up-close') !== 'asks' || await asks() !== 'Did you mean rock?') return `opening again asked "${await asks()}"`;

      // A correctly spelled book skips the step.
      await fresh('made-up-clean', ['Pipp the frog lived in a pond.', 'It was a good day. The end.']);
      if (await toPolish('made-up-clean') !== 'kind message') return 'a correctly spelled book was asked';

      // At most 8 words, and answering all of them reaches the kind message.
      await fresh('made-up-many', [MANY]);
      if (await toPolish('made-up-many') !== 'asks') return 'a book with many misspellings was not asked';
      if (await evaluate(`document.querySelector('.polish-count').textContent`) !== '1 of 8') return `a long list shows "${await evaluate(`document.querySelector('.polish-count').textContent`)}"`;
      for (let i = 0; i < 8; i++) { await tapButton('Keep mine'); await settle(); }
      if (!await onKind()) return 'eight answers did not reach the kind message';
      if ((await savedPages('made-up-many'))[0] !== MANY) return 'keeping every word changed the book';
      return '';
  });
}

/** The word lists can't be loaded: the step is skipped quietly. */
export async function tryPolishNoLists() {
  const block = `(() => { const real = window.fetch; window.fetch = (url, ...rest) => (String(url).includes('-words.txt') ? Promise.reject(new TypeError('offline')) : real(url, ...rest)); })()`;
  return await withScript(`${NO_VOICE}; ${block}`, async () => {
      await fresh('made-up-nolists', [TEXT0, TEXT1]);
      if (await toPolish('made-up-nolists') !== 'kind message') return 'with no word lists the step was not skipped';
      return (await savedPages('made-up-nolists')).join('|') === `${TEXT0}|${TEXT1}` ? '' : 'the book changed';
  });
}
