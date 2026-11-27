// finish.js: what comes after "Finish". The book's title, the author name
// (only the first time) and the cover; then, once the lesson wording
// (data/lessons.json) is there, the steps that teach: "Hear your book", the
// self-check, one "make it better" job, an optional spelling check, and a kind message. Without the
// wording it stops after the cover, as before lessons.
//
// The page screen's Finish button calls startFinish, which opens the next
// lesson and saves it; then the book is saved as finished; only then does
// this screen open. `lessons` is loadLessonData() (lesson-screens.js), null without the files. Every step saves as it goes (through onBook and onAuthor),
// so closing the app at any step loses nothing. Each step can be skipped.
// Nothing here says right or wrong: a self-check tap is only marked.
//
//   showFinish(screen, { book, author, lessons, onBook(book), onAuthor(name), onWrite(), onDone() })

import { make, button } from './ui.js';
import { mountWriter } from './keyboard.js';
import { mountPicture } from './stickers.js';
import { showReading } from './reading.js';
import { showPolish, namesFrom } from './polish-screen.js';
import { canSpeak, voiceMissing } from './voice.js';
import { getSetting, setSetting, saveNow } from './store.js';
import { TITLE_LIMIT, setTitle, setCoverStickers } from './book.js';
import { currentLesson, openLessonAfterFinish, selfCheckFor, jobFor, praiseFor, sentencesOf } from './lessons.js';

export const NAME_LIMIT = 20;
const MARKED = 700; // ms a marked self-check tap stays on show before the next step
const HAS_SOUND = /[\p{L}\p{N}]/u; // a "sentence" that is only "..." can't be tapped

/**
 * At "Finish": the book's lesson id (kept if it has one, else the current
 * lesson's; null when every lesson is done) and the progress with the next
 * lesson open. A book finished before (opened again with Edit) opens none.
 */
export function finishLesson(book, progress, lessons) {
  if (book.finished) return { lesson: book.lesson ?? null, progress };
  return {
    lesson: book.lesson ?? currentLesson(progress, lessons)?.id ?? null,
    progress: openLessonAfterFinish(progress ?? {}, lessons, book.id),
  };
}

/**
 * "Finish" was tapped: open the next lesson and save that first. Returns the
 * fields to add to the book ({ lesson }, or nothing without the lesson files).
 * Throws if the progress can't be saved.
 */
export async function startFinish(book, data) {
  if (!data) return {};
  const progress = await getSetting('progress');
  const done = finishLesson(book, progress, data.lessons);
  if (done.progress !== progress) await setSetting('progress', done.progress);
  return { lesson: done.lesson };
}

/**
 * What the steps after the cover need: the book's lesson (null if it has none),
 * its self-check and its one job (each null when left out). Only tips of
 * lessons up to the book's own can choose the job.
 */
export function lessonPlan(lessons, book) {
  const at = lessons.findIndex((one) => one.id === book.lesson);
  const lesson = lessons[at] ?? null;
  return {
    lesson,
    check: lesson && selfCheckFor(lesson, book),
    job: (lesson && jobFor(lesson, book, lessons.slice(0, at + 1))) || null,
  };
}

/** The kind message: the lesson's praise for the tapped page(s), else the plain "you finished" one. */
export const kindWords = (data, lesson, tapped) => (lesson && praiseFor(lesson, tapped)) || data.messages.finished;

/** The steps, in order. Without the lesson wording, only the first three. */
export function stepsFor(author, data, plan) {
  const steps = ['title', ...(author ? [] : ['name']), 'cover'];
  if (!data) return steps;
  return [...steps, 'hear', ...(plan.check ? ['check'] : []), ...(plan.job ? ['job'] : []), 'polish', 'kind'];
}

export function showFinish(screen, { book, author, lessons, onBook, onAuthor, onWrite, onDone }) {
  if (!lessons?.messages) lessons = null; // no kind message to end on: the steps stop after the cover
  let writer = null;
  let picture = null;
  let reading = null;
  let polish = null;
  let at = 0;
  let tapped = []; // the self-check's marked page(s), 0-based
  const plan = lessons ? lessonPlan(lessons.lessons, book) : null;
  let steps = stepsFor(author, lessons, plan);
  if (!canSpeak()) steps = steps.filter((step) => step !== 'hear');
  else {
    voiceMissing().then((missing) => { // no English voice: "Hear your book" is left out, unless already on show
      const hear = steps.indexOf('hear');
      if (missing && hear > at) steps.splice(hear, 1);
    });
  }

  /** Draw step `at`: a heading and its button on top, then the step itself. */
  function draw() {
    clear();
    const step = steps[at];
    if (step === 'polish') { // draws its own title and Skip, or nothing when there is nothing to ask
      polish = showPolish(screen, {
        book, names: namesFrom(book, author), onExit: next,
        onBook: async (changed) => { book = changed; onBook(book); await saveNow(); }, // saved before the next word
      });
      return;
    }
    const top = screen.appendChild(make('div', 'screen-top finish-top'));
    const heading = top.appendChild(make('h1', 'screen-title', {
      title: 'What\'s your book called?',
      name: 'What\'s your author name?',
      cover: 'Add stickers to your cover',
      hear: 'Hear your book',
      check: plan?.check?.prompt,
      job: 'Make it better',
      kind: book.title.trim() || 'My book',
    }[step]));
    const go = top.appendChild(button('pill', 'Skip', next));
    /** One button: "Skip" while empty, then "Next" or "Done". */
    const label = (has) => {
      go.textContent = has ? (at === steps.length - 1 ? '✓ Done' : 'Next ›') : 'Skip';
      go.classList.toggle('pill-go', has);
    };
    heading.setAttribute('tabindex', '-1');

    if (step === 'title') {
      label(Boolean(book.title));
      writer = mountWriter(screen, {
        text: book.title, limit: TITLE_LIMIT, label: 'Your book\'s title',
        onChange: (text) => { book = setTitle(book, text, Date.now()); onBook(book); label(Boolean(text.trim())); },
      });
    } else if (step === 'name') {
      label(false);
      writer = mountWriter(screen, {
        text: '', limit: NAME_LIMIT, label: 'Your author name',
        onChange: (text) => { author = text.trim(); onAuthor(author); label(Boolean(author)); },
      });
    } else if (step === 'cover') {
      const cover = screen.appendChild(make('div', 'finish-cover'));
      cover.append(make('p', 'finish-title', book.title.trim() || 'My book'));
      picture = mountPicture(cover, {
        stickers: book.cover?.stickers ?? [],
        editable: true,
        onChange: (stickers) => { book = setCoverStickers(book, stickers, Date.now()); onBook(book); label(stickers.length > 0); },
      });
      if (author) picture.node.after(make('p', 'finish-by', `by ${author}`));
      label((book.cover?.stickers ?? []).length > 0);
    } else if (step === 'hear') {
      label(false);
      const area = screen.appendChild(make('div', 'finish-hear'));
      reading = showReading(area, book, {}); // from page 1, with no top row of its own
      area.querySelector('.read-voice').addEventListener('click', () => label(true));
    } else if (step === 'check') {
      drawCheck(heading);
    } else if (step === 'job') {
      go.remove(); // "Not now" is this step's Skip
      card('✨', plan.job, [button('pill', 'Not now ›', next), button('pill pill-go', '✏️ Do it', onWrite)]);
    } else {
      label(true);
      card('🎉', kindWords(lessons, plan.lesson, tapped), []).append(make('p', 'finish-card-more', `📖 ${lessons.messages.readItToSomeone}`));
    }
  }

  /** A big card: an icon, words, and buttons under them. */
  function card(icon, words, buttons) {
    const box = screen.appendChild(make('div', 'finish-card'));
    box.append(make('p', 'finish-card-icon', icon), make('p', 'finish-card-words', words));
    box.firstChild.setAttribute('aria-hidden', 'true');
    if (buttons.length) box.appendChild(make('div', 'finish-choices')).append(...buttons);
    return box;
  }

  /** The self-check: tap a page then a second one, or tap a sentence. A tap is marked, then the next step comes. */
  function drawCheck(heading) {
    const check = plan.check;
    tapped = [];
    let done = false;
    const mark = (node, page) => {
      if (done) return;
      node.classList.add('finish-picked');
      node.setAttribute('aria-pressed', 'true');
      tapped.push(page);
      if (check.kind === 'two-pages' && tapped.length === 1) { heading.textContent = check.secondPrompt; return; }
      done = true;
      const here = at;
      setTimeout(() => { if (at === here && screen.isConnected) next(); }, MARKED);
    };

    if (check.kind === 'two-pages') {
      const grid = screen.appendChild(make('div', `finish-pages${check.pages.length > 4 ? ' finish-pages-many' : ''}`));
      for (const page of check.pages) {
        const tile = grid.appendChild(button('finish-page', '', () => mark(tile, page)));
        tile.append(make('span', 'finish-page-number', `Page ${page + 1}`), make('span', 'finish-page-words', book.pages[page].text));
      }
    } else {
      // One page of sentences at a time, each one a button.
      const list = screen.appendChild(make('div', 'finish-sentences'));
      const nav = make('div', 'read-nav');
      const previous = nav.appendChild(button('pill', '‹ Previous', () => showPage(shown - 1)));
      const count = nav.appendChild(make('p', 'read-count'));
      const following = nav.appendChild(button('pill', 'Next ›', () => showPage(shown + 1)));
      let shown = 0;
      const showPage = (to) => {
        shown = to;
        const page = check.pages[shown];
        list.replaceChildren(...sentencesOf(book, page).filter((one) => HAS_SOUND.test(one.text)).map((one) => {
          const choice = button('finish-sentence', one.text.trim(), () => mark(choice, page));
          return choice;
        }));
        count.textContent = `Page ${page + 1}`;
        previous.disabled = shown === 0;
        following.disabled = shown === check.pages.length - 1;
      };
      showPage(0);
      if (check.pages.length > 1) screen.append(nav);
    }

    // "I don't have one yet": a kind offer to go back and add it, or carry on. A first tap
    // already made (a two-page check) is kept, so the kind message can still name it.
    screen.appendChild(button('pill finish-not-yet', `✋ ${check.notYet}`, () => {
      if (done) return;
      clear();
      screen.appendChild(make('div', 'screen-top finish-top')).append(make('h1', 'screen-title', check.prompt));
      card('🌱', check.notYetOffer, [button('pill', 'Carry on ›', next), button('pill pill-go', '✏️ Go back and add it', onWrite)]);
    }));
  }

  function clear() {
    writer?.remove();
    picture?.remove();
    reading?.stop();
    polish?.remove();
    writer = picture = reading = polish = null;
    screen.replaceChildren();
  }

  function next() {
    if (at < steps.length - 1) { at++; draw(); } else onDone();
  }

  draw();
  return { remove: clear };
}
