// Tests for data/stickers.json: stickers are the device's own emoji.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stickers = JSON.parse(readFileSync(new URL('../data/stickers.json', import.meta.url), 'utf8'));
const GROUPS = ['characters', 'animals', 'places', 'things', 'weather', 'feelings'];

test('ids are unique kebab-case', () => {
  const ids = stickers.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[a-z]+(-[a-z]+)*$/));
});

test('every sticker has id, group, label and emoji, and no src', () => {
  for (const s of stickers) {
    assert.deepEqual(Object.keys(s).sort(), ['emoji', 'group', 'id', 'label']);
    for (const key of ['id', 'group', 'label', 'emoji']) assert.ok(s[key] && typeof s[key] === 'string', `${s.id}.${key}`);
  }
});

test('groups are allowed and appear in order', () => {
  const seen = [...new Set(stickers.map((s) => s.group))];
  assert.deepEqual(seen, GROUPS);
});

test('each emoji is a single grapheme', { skip: typeof Intl.Segmenter !== 'function' }, () => {
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  for (const s of stickers) assert.equal([...seg.segment(s.emoji)].length, 1, s.id);
});
