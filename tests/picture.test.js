// Tests for the plain functions in src/stickers.js (the picture area's sums).
// The sticker list itself is checked in tests/stickers.test.js.
// Run all tests with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_STICKERS, SIZES, BASE, addSticker, canAddSticker, clampPosition, moveSticker,
  stepSize, resizeSticker, removeSticker, pointerToFraction,
} from '../src/stickers.js';

/** True when a sticker is wholly inside the 4:3 picture. */
const inside = ({ x, y, size }) => {
  const w = (BASE * size) / 2;
  const h = w * (4 / 3);
  return x - w >= -1e-9 && x + w <= 1 + 1e-9 && y - h >= -1e-9 && y + h <= 1 + 1e-9;
};

test('adding puts a sticker near the middle, each one a little apart, up to 12', () => {
  let stickers = [];
  for (let i = 0; i < MAX_STICKERS; i++) stickers = addSticker(stickers, 'frog');
  assert.equal(stickers.length, 12);
  assert.deepEqual([stickers[0].x, stickers[0].y], [0.5, 0.5], 'the first goes in the middle');
  assert.equal(new Set(stickers.map((s) => `${s.x},${s.y}`)).size, 12, 'no two on the same spot');
  for (const s of stickers) {
    assert.deepEqual(Object.keys(s), ['id', 'x', 'y', 'size']);
    assert.ok(Math.abs(s.x - 0.5) < 0.31 && Math.abs(s.y - 0.5) < 0.26, `${s.x},${s.y} is near the middle`);
    assert.ok(inside(s));
  }
  assert.equal(canAddSticker(stickers), false);
  assert.equal(addSticker(stickers, 'sun'), stickers, 'the 13th is not added');
});

test('adding does not change the list passed in', () => {
  const before = [{ id: 'sun', x: 0.2, y: 0.3, size: 1 }];
  const copy = structuredClone(before);
  addSticker(before, 'frog');
  moveSticker(before, 0, 0.9, 0.9);
  resizeSticker(before, 0, 1);
  removeSticker(before, 0);
  assert.deepEqual(before, copy);
});

test('a position is kept so the whole sticker is inside the picture', () => {
  assert.deepEqual(clampPosition(0.5, 0.5, 1), { x: 0.5, y: 0.5 });
  assert.deepEqual(clampPosition(-3, 9, 1), { x: 0.1, y: 0.866 });
  for (const size of SIZES) {
    for (const [x, y] of [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, -1], [2, 0.5]]) {
      assert.ok(inside({ ...clampPosition(x, y, size), size }), `size ${size} at ${x},${y}`);
    }
  }
  assert.deepEqual(clampPosition(NaN, undefined, 1), { x: 0.5, y: 0.5 }, 'a broken place goes to the middle');
});

test('moving keeps the sticker inside and changes only that one', () => {
  const stickers = [{ id: 'a', x: 0.5, y: 0.5, size: 1 }, { id: 'b', x: 0.3, y: 0.3, size: 2 }];
  const moved = moveSticker(stickers, 1, 0.99, 0.01);
  assert.equal(moved[0], stickers[0]);
  assert.ok(inside(moved[1]));
  assert.equal(moved[1].x, 0.8);
});

test('size steps go up and down and stop at the ends', () => {
  assert.equal(stepSize(1, 1), 1.5);
  assert.equal(stepSize(1, -1), 0.75);
  assert.equal(stepSize(SIZES.at(-1), 1), SIZES.at(-1));
  assert.equal(stepSize(SIZES[0], -1), SIZES[0]);
  assert.equal(stepSize(1.2, 1), 1.5, 'an odd size starts from the nearest step');
  // The biggest sticker still fits in the picture.
  assert.ok(inside({ ...clampPosition(0.5, 0.5, SIZES.at(-1)), size: SIZES.at(-1) }));
});

test('making a sticker bigger near an edge moves it back inside', () => {
  let stickers = [{ id: 'a', ...clampPosition(1, 1, 1), size: 1 }];
  for (let i = 0; i < SIZES.length; i++) {
    stickers = resizeSticker(stickers, 0, 1);
    assert.ok(inside(stickers[0]));
  }
  assert.equal(stickers[0].size, SIZES.at(-1));
});

test('remove takes out just that sticker', () => {
  const stickers = [{ id: 'a', x: 0.5, y: 0.5, size: 1 }, { id: 'b', x: 0.5, y: 0.5, size: 1 }, { id: 'c', x: 0.5, y: 0.5, size: 1 }];
  assert.deepEqual(removeSticker(stickers, 1).map((s) => s.id), ['a', 'c']);
  assert.equal(removeSticker(stickers, 9).length, 3);
});

test('a pointer becomes parts of the picture, with or without the tablet zoom counted', () => {
  // A newer browser: the box is in screen pixels already (scale 1).
  assert.deepEqual(pointerToFraction({ left: 100, top: 50, width: 400, height: 300 }, 1, 300, 125), { x: 0.5, y: 0.25 });
  // Old Safari under zoom 1.3: the box is un-zoomed, the pointer is in screen pixels.
  const box = { left: 100, top: 50, width: 400, height: 300 };
  const { x, y } = pointerToFraction(box, 1.3, (100 + 400) * 1.3, (50 + 150) * 1.3);
  assert.ok(Math.abs(x - 1) < 1e-9 && Math.abs(y - 0.5) < 1e-9);
});
