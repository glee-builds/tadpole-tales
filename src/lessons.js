// lessons.js: the lesson path as plain functions (no screen, no database).
//
// `lessons` is the list from data/lessons.json (in order). A book is as in book.js.
// Progress is saved by store.js as plain entries, so this file keeps only two:
//   lessonsOpened   number of lessons opened so far, 1 at the start (lesson 1 is
//                   taught by the first book). One more than the last lesson
//                   means every lesson is open and none is current.
//   lastFinished    a number made from the id of the book finished last, so
//                   finishing the same book twice opens only one lesson.
// Nothing here says right or wrong: a tap only lights up a place.

import { splitSentences } from './sentences.js';

// messages.noLessonYet (data/lessons.json) is not shown anywhere yet; it is kept for a later phase.

const opened = (progress, lessons) => Math.min(Math.max(Math.floor(progress?.lessonsOpened) || 1, 1), lessons.length + 1);

/** A number for a book id (a progress entry can't hold text). Two ids sharing one is very unlikely. */
const idNumber = (id) => [...String(id)].reduce((sum, ch) => (Math.imul(sum, 31) + ch.charCodeAt(0)) | 0, 7);

/** The lesson for the next book, or null after the last lesson (then the writer picks, see pickOptions). */
export const currentLesson = (progress, lessons) => lessons[opened(progress, lessons) - 1] ?? null;

/**
 * The progress after `bookId` is finished: the next lesson opens. Calling it
 * again for the same book gives the same progress. Without a bookId it always opens one.
 */
export function openLessonAfterFinish(progress, lessons, bookId) {
  const next = { ...progress };
  if (bookId !== undefined && next.lastFinished === idNumber(bookId)) return next;
  next.lessonsOpened = Math.min(opened(progress, lessons) + 1, lessons.length + 1);
  if (bookId !== undefined) next.lastFinished = idNumber(bookId);
  return next;
}

/**
 * This device's progress with a backup's added (restore): the larger
 * `lessonsOpened` wins, so moving to a new device never closes a lesson, and
 * the device's own `lastFinished` is kept unless it has none. Other entries:
 * the device's, else the backup's. Either may be undefined.
 */
export function mergeProgress(device = {}, backup = {}) {
  const merged = { ...backup, ...device };
  const counts = [device.lessonsOpened, backup.lessonsOpened].filter(Number.isFinite);
  if (counts.length) merged.lessonsOpened = Math.max(...counts);
  if (device.lastFinished === undefined && backup.lastFinished !== undefined) merged.lastFinished = backup.lastFinished;
  return merged;
}

/** The lessons the writer can reread, in order. */
export const openedLessons = (progress, lessons) => lessons.slice(0, opened(progress, lessons));

/**
 * After the last lesson (every lesson opened, none current) a new book first asks which
 * lesson to keep in mind: the opened lessons to choose from, or [] when no pick is asked for.
 */
export const pickOptions = (progress, lessons) => (lessons.length && !currentLesson(progress, lessons) ? openedLessons(progress, lessons) : []);

/** The book with the picked lesson id as its `lesson`, or with none (a null id, or an id not in `options`). */
export function withPickedLesson(book, id, options) {
  const { lesson, ...rest } = book;
  return options.some((l) => l.id === id) ? { ...rest, lesson: id } : rest;
}

const hasWords = (page) => page.text.trim() !== '';

/**
 * What the self-check asks: { kind, prompt, secondPrompt, notYet, notYetOffer, pages },
 * where `pages` are the (0-based) pages with words, or null when it can't be done
 * (fewer than two pages with words for "two-pages", no words at all for "sentence").
 */
export function selfCheckFor(lesson, book) {
  const check = lesson?.selfCheck;
  const pages = book.pages.flatMap((page, i) => (hasWords(page) ? [i] : []));
  if (check?.kind === 'two-pages' && pages.length >= 2) return { ...check, pages };
  if (check?.kind === 'sentence' && pages.length >= 1) return { ...check, pages };
  return null;
}

const TIPS = {
  // "and then" three or more times in the whole book (a phrase never runs across two pages).
  'and-then': (book) => book.pages.reduce((n, page) => n + (page.text.match(/\band\s+then\b/gi) ?? []).length, 0) >= 3,
  // No speech marks and none of the speaking words anywhere (a book with no words at all gets no tip).
  'no-talking': (book) => {
    const all = book.pages.map((page) => page.text).join(' ');
    return all.trim() !== '' && !/["\u201C\u201D]|\b(said|asked|shouted|yelled|whispered|called)\b/i.test(all);
  },
  // The last page with words says it was a dream ("it was all/just/only a dream") or "(and) then ... woke up" (up to 3 words between).
  'dream-ending': (book) => {
    const last = book.pages.filter(hasWords).pop()?.text ?? '';
    return /\bit\s+was\s+(?:(?:all|just|only)\s+)+(?:a\s+)?dream\b|\bthen\s+(?:\w+\s+){0,3}woke\s+up\b/i.test(last);
  },
  'under-three-pages': (book) => book.pages.filter(hasWords).length < 3,
};

/**
 * The one tip that fires, as { check, job }, or null. Only tips of lessons
 * already opened count (and `lesson`, the book's lesson, must be one of them);
 * if two fire, the newest lesson's wins.
 */
export function tipFor(lesson, book, openedList) {
  if (!openedList.some((l) => l.id === lesson?.id)) return null;
  return [...openedList].reverse().map((l) => l.tip).find((tip) => tip && TIPS[tip.check]?.(book)) ?? null;
}

/** The job after the self-check: the tip's if one fired, else the lesson's. */
export const jobFor = (lesson, book, openedList) => tipFor(lesson, book, openedList)?.job ?? lesson.job;

/** The kind message, with {page} filled from the first tapped page (0-based in, 1-based out). */
export function praiseFor(lesson, tapped) {
  const first = [].concat(tapped)[0];
  return Number.isInteger(first) ? lesson.praise.replace('{page}', first + 1) : null;
}

/** The tappable sentences on a page: [{ start, end, text }]. */
export const sentencesOf = (book, pageIndex) => splitSentences(book.pages[pageIndex]?.text);

/**
 * Whether a tap is on the place an example story points to: a page tap is
 * { page } and a sentence tap is { page, text }. Only lights the place up.
 */
export function checkFind(example, tap) {
  const find = example.find;
  if (tap?.page !== find.page) return false;
  return find.kind === 'page' || tap.text === find.sentence;
}
