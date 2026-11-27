// page-fit.mjs: the Write-mode page screen fits in every mix of its optional parts.
// Lesson row on/off, Tell it on/off, Ideas open/closed, the put-back bar showing or not,
// always with a full page (300 characters). Run at each screen size by tests/screens.mjs.
// Returns a problem, or '' when all is well.

import { evaluate, waitFor, settle, HOME, open, tapButton, fitProblem, STORE, shot } from './lib.mjs';

export const tryPageFits = async (size = 'phone') => {
  await open('', HOME);
  // Removing a page changes the saved book, so every mix starts from two fresh full pages.
  const seed = () => evaluate(`(async () => { ${STORE} await store.startOver();
    const long = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. '.repeat(5).slice(0, 300);
    const lesson = { lesson: 'beginning-middle-end', plan: { who: 'Pip, a small green frog' } };
    for (const [id, extra] of [['made-up-fit-plain', {}], ['made-up-fit-lesson', lesson]]) {
      const one = { ...book.setPageText(book.newBook(id, 1000), 0, long, 1000), ...extra };
      await store.saveBook(book.setPageText(book.addPage(one, 0, 1000), 1, long, 1000));
    }
  })()`);
  const found = [];
  const bar = `document.querySelector('.tell-bar')`;
  for (const lesson of [false, true]) for (const tell of [false, true]) {
    for (const ideas of lesson ? [false, true] : [false]) for (const putBack of [false, true]) {
      const name = `${size}: lesson row ${lesson ? 'on' : 'off'}, Tell it ${tell ? 'on' : 'off'}, Ideas ${ideas ? 'open' : 'closed'}, put-back bar ${putBack ? 'showing' : 'hidden'}`;
      await seed();
      await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', ${tell}); })()`);
      if (!await open(`#book/made-up-fit-${lesson ? 'lesson' : 'plain'}/0`, `document.querySelector('.keyboard') !== null && (${bar} !== null) === ${tell}`)) return `${name}: did not draw`;
      if (putBack) {
        await tapButton('Remove');
        if (!await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`, 3)) return `${name}: no put-back bar`;
      }
      if (ideas) await tapButton('Ideas');
      await settle();
      const problem = await fitProblem();
      if (problem) found.push(`${name}: ${problem}`);
      if (ideas && await evaluate(`document.querySelector('.ideas-panel').getBoundingClientRect().bottom > innerHeight`)) found.push(`${name}: the ideas panel runs off the screen`);
      if (lesson && tell && putBack && ideas === false) await shot('page-worst-case', size === 'phone' ? 375 : size);
    }
  }
  await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', false); await store.startOver(); })()`);
  return found.join('; ');
};
