// lesson-screens.js: the lesson screens and the pieces of the other screens that come from lessons.
//
// The wording is data (data/lessons.json and data/examples.json). If either file can't be
// loaded (not there yet, or offline and never saved), loadLessonData() gives null and the
// app does what it did before lessons: no card, no planning, no second shelf.
//
// Screens, by location.hash (the book id is '-' when no book is open):
//   lesson/<book>/<lesson>/<from>   the lesson card. <from> is where it was opened:
//                                   'new' (a new book: "Try it" goes on to planning), 'shelf', or a page number
//   plan/<book>/<n>                 "Plan your story", question n (from 0)
//   example/<book>/<lesson>/<from>  the example story, then "Find it"; <from> as above, or 'direct' from the shelf
// Nothing here says right or wrong: a tap only lights up a place.

import { make, button } from './ui.js';
import { mountWriter } from './keyboard.js';
import { mountPicture } from './stickers.js';
import { showReading } from './reading.js';
import { sentencesOf, openedLessons, checkFind } from './lessons.js';
import { PLAN_LIMIT, planOf } from './plan.js';

let loaded; // the one load of the lesson files, for this visit to the app

/** { lessons, planning, messages, examples } from the lesson files, or null if they are missing or odd. */
export function loadLessonData() {
  loaded ??= (async () => {
    try {
      const [lessons, examples] = await Promise.all([
        fetch(new URL('../data/lessons.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)),
        fetch(new URL('../data/examples.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!Array.isArray(lessons?.lessons) || !lessons.lessons.length || !Array.isArray(lessons.planning) || !Array.isArray(examples)) return null;
      return { lessons: lessons.lessons, planning: lessons.planning, messages: lessons.messages, examples };
    } catch {
      return null; // offline and never saved: just no lessons
    }
  })();
  return loaded;
}

const exampleOf = (data, lesson) => data.examples.find((one) => one.lesson === lesson.id);

const backButton = (onClick, label) => {
  const back = button('back', '←', onClick);
  back.setAttribute('aria-label', label);
  return back;
};

/**
 * Draw the screen for a lesson address into `root`. `host` has { data, book, onAnswer(id, text),
 * go(hash, replace) }. Returns false if the address names nothing that can be drawn,
 * else an object with remove() (or null).
 */
export function drawLessonRoute(root, [kind, bookId, extra, from], { data, book, onAnswer, go }) {
  const lesson = data.lessons.find((one) => one.id === extra);
  if (kind === 'plan') {
    const index = Number(extra) || 0;
    if (!book || index < 0 || index >= data.planning.length) return false;
    return showPlanning(root, { planning: data.planning, book, index, onAnswer, go, bookId });
  }
  if (!lesson) return false;
  const example = exampleOf(data, lesson);
  const card = `lesson/${bookId}/${lesson.id}/${from}`;
  if (kind === 'example') {
    if (!example) return false;
    showExample(root, example, { onClose: () => go(from === 'direct' ? '' : card) });
    return null;
  }
  const page = /^\d+$/.test(from) ? from : null; // opened from a page of the book
  showLessonCard(root, {
    lesson,
    example,
    done: from === 'shelf' ? 'Done' : null,
    onBack: () => go(page === null ? '' : `book/${bookId}/${page}`),
    onExample: () => go(`example/${bookId}/${lesson.id}/${from}`),
    onTry: () => go(from === 'new' ? `plan/${bookId}/0` : page === null ? '' : `book/${bookId}/${page}`, true),
  });
  return null;
}

// ---------- The lesson card ----------

function showLessonCard(root, { lesson, example, done, onBack, onExample, onTry }) {
  const top = root.appendChild(make('div', 'screen-top'));
  top.append(backButton(onBack, 'Back'), make('h1', 'screen-title', `Lesson ${lesson.number}`), make('span', 'top-balance')); // the spacer keeps the title in the middle

  const card = root.appendChild(make('section', 'lesson-card'));
  const head = card.appendChild(make('div', 'lesson-head'));
  const mascot = head.appendChild(make('img', 'lesson-mascot'));
  mascot.src = 'assets/tadpole.svg';
  mascot.alt = '';
  head.append(make('h2', 'lesson-title', lesson.title));
  card.append(make('p', 'lesson-idea', lesson.idea));
  const pair = card.appendChild(make('div', 'lesson-pair'));
  for (const [cls, tag, words] of [['before', '✏️ Before', lesson.before], ['after', '✨ After', lesson.after]]) {
    const box = pair.appendChild(make('div', `lesson-line ${cls}`));
    box.append(make('span', 'lesson-tag', tag), make('p', 'lesson-sentence', words));
  }

  const actions = root.appendChild(make('div', 'lesson-actions'));
  if (example) actions.append(button('pill', '👀 Look at an example', onExample));
  actions.append(button('pill pill-go', done ? `✓ ${done}` : '✏️ Try it in your book', onTry));
}

// ---------- Plan your story ----------

function showPlanning(root, { planning, book, index, onAnswer, go, bookId }) {
  const question = planning[index];
  const last = index === planning.length - 1;
  const write = () => go(`book/${bookId}/0`, true);
  const top = root.appendChild(make('div', 'screen-top'));
  top.append(backButton(() => go(''), 'Back to the bookshelf'), make('h1', 'screen-title', 'Plan your story'));
  top.append(button('pill plan-skip', 'Skip planning', write));

  const ask = root.appendChild(make('div', 'plan-ask'));
  ask.append(make('p', 'plan-count', `Idea ${index + 1} of ${planning.length}`), make('h2', 'plan-question', question.question));
  if (question.hint) ask.append(make('p', 'plan-hint', `Like: ${question.hint}`));

  const next = button('pill', '', () => (last ? write() : go(`plan/${bookId}/${index + 1}`, true)));
  const label = (text) => {
    const has = text.trim() !== '';
    next.textContent = last ? '✏️ Start writing' : has ? 'Next ›' : 'Skip ›';
    next.classList.toggle('pill-go', last || has);
  };
  const writer = mountWriter(root, {
    text: planOf(book)[question.id] ?? '',
    limit: PLAN_LIMIT,
    label: question.question,
    onChange: (text) => { onAnswer(question.id, text); label(text); },
  });
  label(writer.getText());
  const actions = root.appendChild(make('div', 'plan-actions'));
  actions.append(next);
  return writer;
}

// ---------- The example story ----------

function showExample(root, example, { onClose }) {
  const story = { title: example.title, pages: example.pages.map((p) => ({ text: p.text, stickers: p.stickers ?? [] })) };
  const find = () => showFind(root, example, { onStory: () => showExample(root, example, { onClose }), onClose });
  showReading(root, story, { onClose, action: { label: '🔍 Find it', onClick: find } });
}

/** The find step: the lesson's prompt, then any tap lights up where the idea is. Never right or wrong. */
function showFind(root, example, { onStory, onClose }) {
  const { find } = example;
  const story = example.pages;
  root.replaceChildren();
  const top = root.appendChild(make('div', 'screen-top'));
  top.append(button('pill', '‹ Story', onStory)); // to read it again, on the left
  top.append(make('h1', 'screen-title', 'Find it'));
  const skip = top.appendChild(button('pill', '✕ Skip', onClose)); // Done once the place is shown, on the right
  const message = root.appendChild(make('p', 'find-prompt', find.prompt));
  message.setAttribute('role', 'status');
  const stage = root.appendChild(make('div', 'find-stage'));
  let tapped = false;

  const reveal = () => {
    tapped = true;
    message.textContent = '👀 Here\'s where I see it.';
    message.classList.add('find-answer');
    skip.textContent = '✓ Done';
    skip.classList.add('pill-go');
  };

  if (find.kind === 'page') {
    const grid = stage.appendChild(make('div', 'find-pages'));
    story.forEach((page, i) => {
      const tile = grid.appendChild(button('find-tile', ''));
      tile.setAttribute('aria-label', `Page ${i + 1}`);
      const art = tile.appendChild(make('div', 'find-art'));
      if (page.stickers?.length) mountPicture(art, { stickers: page.stickers });
      tile.append(make('span', 'find-label', `Page ${i + 1}`));
      tile.addEventListener('click', () => {
        if (tapped) return;
        reveal();
        tile.classList.add('tapped');
        const target = grid.children[find.page];
        target?.classList.add('found');
        target?.append(make('span', 'found-badge', '👀 Here'));
        target?.setAttribute('aria-label', `Page ${find.page + 1}: here`);
      });
    });
    return;
  }

  // A sentence: one page at a time, each sentence a button.
  let at = 0;
  let mark = null; // the sentence the writer tapped: { page, text }
  const nav = root.appendChild(make('div', 'read-nav'));
  const previous = nav.appendChild(button('pill', '‹ Previous', () => draw(at - 1)));
  const count = nav.appendChild(make('p', 'read-count'));
  const next = nav.appendChild(button('pill', 'Next ›', () => draw(at + 1)));
  function draw(to) {
    at = Math.min(Math.max(to, 0), story.length - 1);
    stage.replaceChildren();
    const list = stage.appendChild(make('div', 'find-sentences'));
    for (const sentence of sentencesOf({ pages: story }, at)) {
      const line = list.appendChild(button('find-sentence', sentence.text));
      if (tapped && checkFind(example, { page: at, text: sentence.text })) { line.classList.add('found'); line.append(make('span', 'found-badge', '👀 Here')); }
      if (mark && mark.page === at && mark.text === sentence.text && !line.classList.contains('found')) line.classList.add('tapped');
      line.addEventListener('click', () => {
        if (tapped) return;
        mark = { page: at, text: sentence.text };
        reveal();
        draw(find.page); // the place is lit up, on its own page
      });
    }
    count.textContent = `Page ${at + 1} of ${story.length}`;
    previous.disabled = at === 0;
    next.disabled = at === story.length - 1;
  }
  draw(0);
}

// ---------- On the page screen: the reminder and the idea cards ----------

/**
 * A row for the top of the page screen: the lesson's reminder (tap to open its card) and
 * "Ideas" (the plan answers as small cards, over the picture, so the keys never move).
 * `cards` is ideaCards(...); either part is left out when it has nothing to show.
 */
export function lessonBar({ lesson, cards, onLesson }) {
  const bar = make('div', 'lesson-bar');
  const row = bar.appendChild(make('div', 'lesson-row'));
  if (lesson) {
    const reminder = row.appendChild(button('pill lesson-reminder', '', onLesson));
    reminder.append(make('span', 'bar-icon', '📖'), make('span', 'bar-words', lesson.reminder));
    reminder.setAttribute('aria-label', `Lesson reminder: ${lesson.reminder}. Open the lesson.`);
  }
  if (cards.length) {
    const panel = bar.appendChild(make('div', 'ideas-panel'));
    panel.hidden = true;
    for (const card of cards) {
      const one = panel.appendChild(make('div', 'idea-card'));
      one.append(make('span', 'idea-label', `${card.icon} ${card.label}`), make('span', 'idea-text', card.text));
    }
    const ideas = row.appendChild(button('pill ideas-button', '💡 Ideas', () => {
      panel.hidden = !panel.hidden;
      ideas.setAttribute('aria-expanded', String(!panel.hidden));
    }));
    ideas.setAttribute('aria-expanded', 'false');
  }
  return bar;
}

// ---------- The second shelf ----------

/**
 * The cards for "Tadpole's books": the example stories of the lessons opened so far, each
 * with a button for its lesson. Returns a list of nodes for the bookshelf's grid (none if there are none).
 */
export function tadpoleBooks(data, progress) {
  const cards = openedLessons(progress, data.lessons).flatMap((lesson) => {
    const example = exampleOf(data, lesson);
    if (!example) return [];
    const card = make('div', 'book-card example-card');
    const open = card.appendChild(make('a', 'book-open'));
    open.href = `#example/-/${lesson.id}/direct`;
    const cover = open.appendChild(make('div', `cover cover-${lesson.number % 4}`));
    cover.append(make('span', 'cover-title', example.title));
    if (example.pages[0]?.stickers?.length) mountPicture(cover, { stickers: example.pages[0].stickers });
    const info = open.appendChild(make('div', 'card-info'));
    info.append(make('span', 'card-status', '📖 Read it'), make('span', 'card-pages', `Lesson ${lesson.number}`));
    const lessonLink = card.appendChild(button('pill card-edit', '💡 Lesson', () => { location.hash = `lesson/-/${lesson.id}/shelf`; }));
    lessonLink.setAttribute('aria-label', `Lesson ${lesson.number}: ${lesson.title}`);
    return [card];
  });
  return cards.length ? [make('h2', 'shelf-heading', '🐸 Tadpole\'s books'), ...cards] : [];
}
