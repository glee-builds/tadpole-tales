// page-fit.mjs: the Write-mode page screen fits in every mix of its optional parts.
// Lesson row (each real lesson's reminder, from data/lessons.json) on/off, Tell it on/off, with and
// without a recording, with its note showing or not, Ideas open/closed, the put-back arrow showing or
// not, always with a full page (300 characters). Run at each screen size by tests/screens.mjs.
// Returns a problem, or '' when all is well.

import { readFileSync } from 'node:fs';
import { evaluate, waitFor, settle, HOME, open, tapOn, tapButton, fitProblem, STORE, shot } from './lib.mjs';

const LESSONS = JSON.parse(readFileSync(new URL('../../data/lessons.json', import.meta.url), 'utf8')).lessons;

/** Tap the visible button with this aria-label (the Tell it buttons are only icons). */
async function tapLabel(label) {
  const n = await evaluate(`[...document.querySelectorAll('button')].findIndex((b) => b.offsetParent !== null && (b.getAttribute('aria-label') || '').startsWith(${JSON.stringify(label)}))`);
  if (n < 0) throw new Error(`no button is labelled "${label}"`);
  await tapOn('button', n);
}

// What is wrong with the lesson row, the Tell it note and the page chip, or ''.
const rowProblem = () => evaluate(`(() => {
  const shown = (node) => node && node.offsetParent !== null;
  const words = document.querySelector('.lesson-reminder .bar-words');
  if (shown(words)) {
    const line = parseFloat(getComputedStyle(words).lineHeight) || words.clientHeight;
    if (words.clientHeight > line * 2 + 2) return 'the reminder takes more than two lines';
  }
  const note = document.querySelector('.tell-note');
  if (shown(note)) {
    const box = note.getBoundingClientRect();
    const hit = [...document.querySelectorAll('button')].filter((b) => shown(b)).find((b) => {
      const r = b.getBoundingClientRect();
      return r.left < box.right - 1 && r.right > box.left + 1 && r.top < box.bottom - 1 && r.bottom > box.top + 1;
    });
    if (hit) return 'the Tell it note covers "' + (hit.getAttribute('aria-label') || hit.textContent.trim()) + '"';
  }
  const slot = document.querySelector('.picture-slot');
  if (slot && slot.getBoundingClientRect().height > 0 && slot.getBoundingClientRect().height < 24 && getComputedStyle(slot).visibility !== 'hidden') return 'a sliver of picture is showing';
  const clipped = [...document.querySelectorAll('.page-tools .pill')].find((b) => b.scrollWidth > b.clientWidth + 1);
  if (clipped) return 'the words on "' + clipped.textContent.trim() + '" are clipped';
  const chip = document.querySelector('.screen-title');
  const r = chip.getBoundingClientRect();
  if (!shown(chip) || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) return 'the page chip is off the screen';
  const tools = document.querySelector('.page-tools').getBoundingClientRect();
  const slotBox = slot.getBoundingClientRect();
  const inSlot = slot.contains(chip);
  if (inSlot && (r.top < slotBox.top - 1 || r.bottom > slotBox.bottom + 1)) return 'the page chip is clipped by the picture area';
  if (!inSlot && (r.bottom < tools.top - 30 || r.top > tools.bottom + 30)) return 'the page chip is not by the page tools';
  return '';
})()`);

export const tryPageFits = async (size = 'phone') => {
  await open('', HOME);
  // Removing a page changes the saved book, so every mix starts from two fresh full pages.
  // With `has` every page has a recording.
  const seed = (lessonId, has) => evaluate(`(async () => { ${STORE} await store.startOver();
    const long = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. '.repeat(5).slice(0, 300);
    const lesson = { lesson: ${JSON.stringify(lessonId)}, plan: { who: 'Pip, a small green frog' } };
    for (const [id, extra] of [['made-up-fit-plain', {}], ['made-up-fit-lesson', lesson]]) {
      const one = { ...book.setPageText(book.newBook(id, 1000), 0, long, 1000), ...extra };
      const two = book.setPageText(book.addPage(one, 0, 1000), 1, long, 1000);
      await store.saveBook(two);
      if (${has}) for (const one of two.pages) await store.saveRecording(id, one.id, new TextEncoder().encode('sound').buffer, 'audio/webm');
    }
  })()`);
  const found = [];
  const bar = `document.querySelector('.tell-bar')`;
  const variants = [{ lesson: null }, ...LESSONS.map((one) => ({ lesson: one }))];
  for (const { lesson } of variants) for (const [tell, has, note] of [[false, false, false], [true, false, false], [true, true, false], [true, true, true]]) {
    for (const ideas of lesson ? [false, true] : [false]) for (const putBack of [false, true]) {
      if (note && ideas) continue; // the open Ideas panel covers the note's row anyway; it is checked on its own
      const name = `${size}: ${lesson ? `lesson ${lesson.number} row on` : 'lesson row off'}, Tell it ${tell ? 'on' : 'off'}${has ? ' with a recording' : ''}${note ? ' and its note' : ''}, Ideas ${ideas ? 'open' : 'closed'}, put-back arrow ${putBack ? 'showing' : 'hidden'}`;
      await seed(lesson?.id ?? 'none', has);
      await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', ${tell}); })()`);
      if (!await open(`#book/made-up-fit-${lesson ? 'lesson' : 'plain'}/0`, `document.querySelector('.keyboard') !== null && (${bar} !== null) === ${tell} && (!${has} || ${bar}.querySelector('.tell-hear') ?.hidden === false)`)) return `${name}: did not draw`;
      if (putBack) {
        await tapButton('Remove');
        if (!await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back') || b.getAttribute('aria-label') === 'Put page back')`, 3)) return `${name}: no put-back arrow`;
      }
      if (ideas) await tapButton('Ideas');
      if (note) { // a refused microphone gives the longest note
        await evaluate(`navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test: refused', 'NotAllowedError'); }`);
        await tapLabel('Tell it');
        if (!await waitFor(`document.querySelector('.tell-note').textContent.includes('microphone')`, 3)) return `${name}: no note`;
      }
      await settle();
      const problem = await fitProblem() || await rowProblem();
      if (problem) found.push(`${name}: ${problem}`);
      if (ideas && await evaluate(`document.querySelector('.ideas-panel').getBoundingClientRect().bottom > innerHeight`)) found.push(`${name}: the ideas panel runs off the screen`);
      if (lesson?.number === 3 && tell && has && !ideas && putBack) await shot(note ? 'page-tell-note' : 'page-worst-case', size === 'phone' ? 375 : size);
      if (note && lesson?.number === 3 && putBack) { // the note goes by itself (not the "Recording" one) after about 4 seconds
        if (!await waitFor(`document.querySelector('.tell-note').textContent === ''`, 6)) found.push(`${name}: the note did not go away`);
        else if (await evaluate(`document.querySelector('.lesson-row').classList.contains('has-note')`)) found.push(`${name}: the reminder did not come back`);
      }
    }
  }
  await evaluate(`(async () => { ${STORE} await store.setSetting('tellIt', false); await store.startOver(); })()`);
  return found.join('; ');
};
