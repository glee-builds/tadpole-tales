// Checks the real lesson wording (data/lessons.json and data/examples.json) field by field, so a slip
// while editing it shows up here with a clear message. Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitSentences } from '../src/sentences.js';
import { LIMIT } from '../src/typing.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const { planning, lessons, messages } = load('lessons.json');
const examples = load('examples.json');
const stickerIds = new Set(load('stickers.json').map((s) => s.id));

const words = (value, where) => assert.ok(typeof value === 'string' && value.trim() !== '', `${where} must be some words`);

test('messages: the three the app shows', () => {
  for (const key of ['finished', 'readItToSomeone', 'noLessonYet']) words(messages?.[key], `lessons.json messages.${key}`);
});

test('planning: questions with unique ids, each with a question and a hint', () => {
  assert.ok(Array.isArray(planning) && planning.length > 0, 'lessons.json planning must be a list of questions');
  planning.forEach((q, i) => {
    words(q.id, `planning[${i}].id`);
    words(q.question, `planning[${i}] (${q.id}).question`);
    words(q.hint, `planning[${i}] (${q.id}).hint`);
  });
  assert.equal(new Set(planning.map((q) => q.id)).size, planning.length, 'planning ids must be different from each other');
});

test('lessons: numbered 1, 2, 3... with unique ids and every field the app reads', () => {
  assert.ok(lessons.length > 0, 'lessons.json lessons must not be empty');
  assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length, 'lesson ids must be different from each other');
  lessons.forEach((l, i) => {
    const at = `lesson ${i + 1} (${l.id})`;
    assert.equal(l.number, i + 1, `${at}: number must be ${i + 1}`);
    for (const key of ['id', 'title', 'idea', 'before', 'after', 'tryIt', 'reminder', 'job']) words(l[key], `${at}.${key}`);
    words(l.praise, `${at}.praise`);
    assert.ok(l.praise.includes('{page}'), `${at}.praise must hold {page}`);
    const c = l.selfCheck;
    assert.ok(['two-pages', 'sentence'].includes(c?.kind), `${at}.selfCheck.kind must be "two-pages" or "sentence"`);
    for (const key of ['prompt', 'notYet', 'notYetOffer']) words(c[key], `${at}.selfCheck.${key}`);
    if (c.kind === 'two-pages') words(c.secondPrompt, `${at}.selfCheck.secondPrompt`);
    if (l.tip != null) {
      assert.ok(['and-then', 'under-three-pages', 'no-talking', 'dream-ending'].includes(l.tip.check), `${at}.tip.check "${l.tip.check}" is not a tip the app knows`);
      words(l.tip.job, `${at}.tip.job`);
    }
  });
});

test('examples: one per lesson, stickers that exist, short pages, and a find that points at a real place', () => {
  assert.deepEqual(examples.map((e) => e.lesson), lessons.map((l) => l.id), 'examples.json needs one story per lesson, in the lessons\' order');
  for (const e of examples) {
    const at = `example "${e.lesson}"`;
    words(e.title, `${at}.title`);
    assert.ok(Array.isArray(e.pages) && e.pages.length > 0, `${at}.pages must not be empty`);
    e.pages.forEach((p, i) => {
      const where = `${at} page ${i + 1}`;
      words(p.text, `${where}.text`);
      assert.ok(p.text.length < LIMIT, `${where} has ${p.text.length} characters; keep it under ${LIMIT}`);
      assert.ok(Array.isArray(p.stickers), `${where}.stickers must be a list`);
      for (const s of p.stickers) {
        assert.ok(stickerIds.has(s.id), `${where}: sticker "${s.id}" is not in data/stickers.json`);
        for (const key of ['x', 'y']) assert.ok(s[key] >= 0 && s[key] <= 1, `${where}: sticker "${s.id}".${key} must be from 0 to 1`);
        assert.ok(s.size > 0, `${where}: sticker "${s.id}".size must be more than 0`);
      }
    });
    const f = e.find;
    assert.ok(['page', 'sentence'].includes(f?.kind), `${at}.find.kind must be "page" or "sentence"`);
    words(f.prompt, `${at}.find.prompt`);
    assert.ok(Number.isInteger(f.page) && f.page >= 0 && f.page < e.pages.length, `${at}.find.page must be 0 to ${e.pages.length - 1}`);
    if (f.kind === 'sentence') {
      const found = splitSentences(e.pages[f.page].text).filter((s) => s.text === f.sentence);
      assert.equal(found.length, 1, `${at}.find.sentence "${f.sentence}" must be exactly one sentence on page ${f.page + 1}`);
    }
  }
});
