// Tests for src/plan.js: a restored plan answer is capped at PLAN_LIMIT. Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMIT, planOf, ideaCards } from '../src/plan.js';

test('a restored answer longer than the limit is cut to it', () => {
  const plan = planOf({ plan: { who: 'x'.repeat(5000) } });
  assert.equal(plan.who.length, PLAN_LIMIT);
});

test('an idea card never shows more than the limit', () => {
  const [card] = ideaCards([{ id: 'who', question: 'Who?' }], { plan: { who: 'y'.repeat(900) } });
  assert.equal(card.text.length, PLAN_LIMIT);
});
