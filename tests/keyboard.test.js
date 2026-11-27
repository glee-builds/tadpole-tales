// Tests for nearestGap in src/keyboard.js: which gap between letters a tap is nearest.
// It reads boxes from the page, so these tests give it pretend boxes instead of a browser.
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

let zoom = '1'; // the CSS zoom the pretend page has
globalThis.getComputedStyle = () => ({ zoom });
const { nearestGap } = await import('../src/keyboard.js');

/** A pretend character (or the end marker) with a box. */
const span = (left, top, width = 10, height = 20, text = 'x', cls = 'ch') => ({
  textContent: text,
  classList: { contains: (name) => name === cls },
  getBoundingClientRect: () => ({ left, right: left + width, top, bottom: top + height, width, height }),
});

/** A pretend writing area holding `spans`; `shown` is how wide it is on screen, `layout` how wide it is laid out (they differ under CSS zoom). */
const area = (spans, { layout = 100, shown = 100 } = {}) => ({
  offsetWidth: layout,
  parentElement: null,
  getBoundingClientRect: () => ({ width: shown }),
  querySelectorAll: () => spans,
});

// "abc" on one line, 10px per letter, then the end marker: the gaps are at x = 0, 10, 20, 30.
const line = () => [span(0, 0), span(10, 0), span(20, 0), span(30, 0, 2, 20, '', 'end')];

test('a tap goes to the nearest gap on its line', () => {
  assert.equal(nearestGap(area(line()), 1, 10), 0);
  assert.equal(nearestGap(area(line()), 12, 10), 1);
  assert.equal(nearestGap(area(line()), 17, 10), 2);
  assert.equal(nearestGap(area(line()), 29, 10), 3);
});

test('a tap past the end of the words goes to the end', () => {
  assert.equal(nearestGap(area(line()), 90, 10), 3);
});

test('a tap below the words goes to the nearest line, and so to its gap', () => {
  const two = [span(0, 0), span(10, 0), span(0, 30), span(10, 30), span(20, 30, 2, 20, '', 'end')];
  assert.equal(nearestGap(area(two), 3, 90), 2); // below line 2: its first gap
  assert.equal(nearestGap(area(two), 3, 5), 0);  // on line 1
});

test('a new line\'s right edge is not a gap: a tap there stays before it', () => {
  const broken = [span(0, 0), span(10, 0, 5, 20, '\n'), span(0, 30), span(20, 30, 2, 20, '', 'end')];
  assert.equal(nearestGap(area(broken), 40, 10), 1); // far right of line 1: before the break, not after it
});

test('under CSS zoom the tap is scaled to the boxes', () => {
  zoom = '2'; // old Safari: boxes in un-zoomed pixels, so a tap at 24 on the screen is at 12 among them
  assert.equal(nearestGap(area(line(), { layout: 100, shown: 100 }), 24, 20), 1);
  // Newer browsers: boxes already in screen pixels (shown twice as wide as laid out), so the tap is used as it is.
  assert.equal(nearestGap(area(line(), { layout: 100, shown: 200 }), 24, 20), 2);
  zoom = '1';
});

test('letters with no box (hidden) are ignored', () => {
  const hidden = [span(0, 0), span(0, 0, 0, 0), span(10, 0), span(20, 0, 2, 20, '', 'end')];
  assert.equal(nearestGap(area(hidden), 11, 10), 1);
});
