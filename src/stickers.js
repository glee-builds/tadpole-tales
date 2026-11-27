// stickers.js: the picture area, where stickers are placed, moved and sized.
//
// A placed sticker is { id, x, y, size }. x and y are where its middle is, as
// parts (0 to 1) of the picture's width and height, so a page looks the same
// on the phone, the iPad and in the reading view. size is a step from SIZES.
// The picture is always 4:3. The sticker list is data/stickers.json:
// [{ id, group, label, emoji }]. A sticker is drawn with the device's own
// emoji (nothing to download), as text sized to the picture.
//
// Use it from any screen:
//   const picture = mountPicture(box, { stickers: page.stickers, editable: true, onChange: (stickers) => ... });
//   picture.getStickers(); picture.setStickers([...]); picture.remove();
//
// The plain functions (adding, clamping, sizes, pointer to parts) need no
// page, so tests/stickers.test.js runs them in Node.

import { make, button, wiggle } from './ui.js';

export const MAX_STICKERS = 12;
export const SIZES = [0.75, 1, 1.5, 2, 3]; // the "smaller" and "bigger" steps
export const BASE = 0.2; // a size-1 sticker is this part of the picture's width
const RATIO = 4 / 3; // the picture's width over its height
const DRAG_START = 8; // screen pixels a finger moves before a tap becomes a drag

const round = (n) => Math.round(n * 1000) / 1000; // keeps saved books tidy

/** A sticker's half width and half height, as parts of the picture. Stickers are square. */
function halfSize(size) {
  const half = (BASE * size) / 2;
  return { w: half, h: half * RATIO };
}

/** (x, y) moved just enough that a sticker of `size` is wholly inside the picture. */
export function clampPosition(x, y, size) {
  const { w, h } = halfSize(size);
  // Rounded inward, so a rounded place is never a hair outside.
  const clamp = (n, half) => Math.min(Math.floor((1 - half) * 1000) / 1000, Math.max(Math.ceil(half * 1000) / 1000, Number.isFinite(n) ? round(n) : 0.5));
  return { x: clamp(x, w), y: clamp(y, h) };
}

// Where new stickers go: the middle first, then spots around it, so they don't pile up.
const SPOTS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [2, 1]];

/** Add sticker `id` near the middle (each new one on its own spot). Unchanged at 12. */
export function addSticker(stickers, id) {
  if (stickers.length >= MAX_STICKERS) return stickers;
  const [dx, dy] = SPOTS[stickers.length];
  return [...stickers, { id, ...clampPosition(0.5 + dx * 0.15, 0.5 + dy * 0.25, 1), size: 1 }];
}

export const canAddSticker = (stickers) => stickers.length < MAX_STICKERS;

/** Move sticker `index` to (x, y), kept inside the picture. */
export function moveSticker(stickers, index, x, y) {
  return stickers.map((s, i) => (i === index ? { ...s, ...clampPosition(x, y, s.size) } : s));
}

/** The size one step up (+1) or down (-1) from `size`, within SIZES. */
export function stepSize(size, step) {
  // A size that isn't a step (an old or odd record) starts from the nearest one.
  const nearest = SIZES.reduce((best, s, i) => (Math.abs(s - size) < Math.abs(SIZES[best] - size) ? i : best), 0);
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, nearest + step))];
}

/** Make sticker `index` one step bigger (+1) or smaller (-1), still inside the picture. */
export function resizeSticker(stickers, index, step) {
  return stickers.map((s, i) => {
    if (i !== index) return s;
    const size = stepSize(s.size, step);
    return { ...s, size, ...clampPosition(s.x, s.y, size) };
  });
}

export const removeSticker = (stickers, index) => stickers.filter((_, i) => i !== index);

/**
 * Where a pointer at (clientX, clientY) is on a box, as parts of it (0 to 1).
 * `box` is its getBoundingClientRect(); `scale` is 1 where the box already
 * counts CSS zoom (newer browsers) and the zoom where it doesn't (old Safari).
 * The same sum as `across` in Little Pond's scene.js, for both directions.
 */
export function pointerToFraction(box, scale, clientX, clientY) {
  return {
    x: (clientX / scale - box.left) / box.width,
    y: (clientY / scale - box.top) / box.height,
  };
}

// ---------- On the page ----------

/** How much CSS zoom (the tablet rule in styles.css) enlarges `node` on the screen. */
function zoomOf(node) {
  let zoom = 1;
  for (let at = node; at; at = at.parentElement) zoom *= Number(getComputedStyle(at).zoom) || 1;
  return zoom;
}

/** A pointer's place on `node`, as parts of it, under tablet zoom in old and new browsers. */
function fractionOn(node, clientX, clientY) {
  const box = node.getBoundingClientRect();
  return pointerToFraction(box, (zoomOf(node) * node.offsetWidth) / box.width, clientX, clientY);
}

let list; // data/stickers.json, fetched once
/** The sticker list: Promise<[{ id, group, label, emoji }]>. */
export function loadStickerList() {
  list ??= fetch(new URL('../data/stickers.json', import.meta.url)).then((response) => {
    if (!response.ok) throw new Error(`stickers.json: ${response.status}`);
    return response.json();
  });
  return list;
}

let styled = false;
function addStyles() {
  if (styled) return;
  styled = true;
  const link = document.head.appendChild(document.createElement('link'));
  link.rel = 'stylesheet';
  link.href = new URL('./stickers.css', import.meta.url).href;
}

/**
 * Add the picture area to `parent`. Editable: a tray to add stickers, drag to
 * move, tap a sticker for "bigger", "smaller" and "remove". Read-only: just
 * the picture. `onChange(stickers)` runs after every change. Returns
 * { node, getStickers(), setStickers(stickers), remove() }. The picture is as
 * wide as `parent` lets it be; set a width or max-width on .picture to shrink it.
 */
export function mountPicture(parent, { stickers: start = [], onChange, editable = false } = {}) {
  addStyles();
  let stickers = start;
  let selected = -1;
  let byId = new Map();

  const picture = make('div', `picture${editable ? ' picture-edit' : ''}`);
  picture.setAttribute('role', editable ? 'group' : 'img'); // an "img" would hide the sticker buttons from screen readers
  const parts = [picture];

  let tools, tray, full, bigger, smaller;
  if (editable) {
    tools = make('div', 'sticker-tools');
    bigger = tools.appendChild(toolButton('+', 'Bigger', () => change(resizeSticker(stickers, selected, 1))));
    smaller = tools.appendChild(toolButton('−', 'Smaller', () => change(resizeSticker(stickers, selected, -1))));
    tools.appendChild(toolButton('✕', 'Remove', () => { const index = selected; selected = -1; change(removeSticker(stickers, index)); }));
    full = make('p', 'sticker-full', '✋ 12 stickers is the most');
    tray = make('div', 'sticker-tray');
    tray.setAttribute('aria-label', 'Stickers');
    parts.push(tools, full, tray);
  }

  function change(next) {
    stickers = next;
    draw();
    onChange?.(stickers);
  }

  function select(index) {
    selected = index;
    draw();
  }

  function draw() {
    picture.textContent = '';
    picture.setAttribute('aria-label', `Picture: ${stickers.map((s) => byId.get(s.id)?.label ?? s.id).join(', ') || 'empty'}`);
    stickers.forEach((sticker, index) => {
      const known = byId.get(sticker.id);
      if (!known) return; // art not in this version: kept in the book, not drawn
      const node = editable ? button('sticker') : make('span', 'sticker');
      node.append(emoji(known));
      if (editable) {
        node.dataset.index = index;
        node.setAttribute('aria-label', known.label);
        node.setAttribute('aria-pressed', String(index === selected));
      }
      place(node, sticker);
      picture.append(node);
    });
    if (!editable) return;
    const sticker = stickers[selected];
    tools.style.visibility = sticker ? '' : 'hidden';
    if (sticker) {
      bigger.disabled = sticker.size >= SIZES[SIZES.length - 1];
      smaller.disabled = sticker.size <= SIZES[0];
    }
    full.hidden = canAddSticker(stickers);
    tray.classList.toggle('tray-full', !canAddSticker(stickers));
  }

  if (editable) {
    // Drag a sticker to move it; a tap without moving shows or hides its buttons.
    let drag = null;
    picture.addEventListener('pointerdown', (event) => {
      const node = event.target.closest('.sticker');
      if (!node) { if (selected !== -1) select(-1); return; } // a tap on the empty picture hides the buttons
      event.preventDefault();
      const index = Number(node.dataset.index);
      drag = { index, node, id: event.pointerId, sx: event.clientX, sy: event.clientY, moved: false, from: stickers[index], start: fractionOn(picture, event.clientX, event.clientY) };
      try { node.setPointerCapture(event.pointerId); } catch { /* fine without it */ }
    });
    picture.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < DRAG_START) return;
      drag.moved = true;
      drag.node.classList.add('lifted');
      const now = fractionOn(picture, event.clientX, event.clientY);
      stickers = moveSticker(stickers, drag.index, drag.from.x + now.x - drag.start.x, drag.from.y + now.y - drag.start.y);
      place(drag.node, stickers[drag.index]);
    });
    const drop = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { moved, index } = drag;
      drag = null;
      if (moved) change(stickers); // also after pointercancel: the sticker stays where the finger left it
      else if (event.type === 'pointerup') select(selected === index ? -1 : index);
    };
    picture.addEventListener('pointerup', drop);
    picture.addEventListener('pointercancel', drop);
    // A screen reader or keyboard "click" (no pointer) shows the buttons.
    picture.addEventListener('click', (event) => {
      const node = event.target.closest('.sticker');
      if (node && event.detail === 0) select(selected === Number(node.dataset.index) ? -1 : Number(node.dataset.index));
    });
    picture.addEventListener('contextmenu', (event) => event.preventDefault());

    tray.addEventListener('click', (event) => {
      const id = event.target.closest('[data-sticker]')?.dataset.sticker;
      if (!id) return;
      if (!canAddSticker(stickers)) { wiggle(full); return; }
      selected = stickers.length; // the new one, so it can be sized straight away
      change(addSticker(stickers, id));
    });
  }

  // Emoji are text, so their size comes from the picture's width (--picture-width,
  // in the picture's own pixels). Container units would do this, but Safari 15.4 has none.
  const sizer = new ResizeObserver(() => picture.style.setProperty('--picture-width', `${picture.offsetWidth}px`));
  sizer.observe(picture);

  parent.append(...parts);
  draw();
  loadStickerList().then((all) => {
    byId = new Map(all.map((s) => [s.id, s]));
    if (editable) {
      for (const s of all) {
        const node = tray.appendChild(button('tray-sticker'));
        node.dataset.sticker = s.id;
        node.setAttribute('aria-label', s.label);
        node.append(emoji(s));
      }
    }
    draw();
  }).catch((error) => console.error('Could not load the stickers:', error));

  return {
    node: picture,
    getStickers: () => stickers,
    setStickers(next) { stickers = next; selected = -1; draw(); },
    remove() { sizer.disconnect(); for (const part of parts) part.remove(); },
  };
}

/** Put a sticker's node where it belongs, at its size (both as parts of the picture). */
function place(node, { x, y, size }) {
  const at = clampPosition(x, y, size); // an odd saved place is drawn inside, and left as it is in the book
  node.style.left = `${at.x * 100}%`;
  node.style.top = `${at.y * 100}%`;
  node.style.width = `${BASE * size * 100}%`;
  node.style.setProperty('--size', BASE * size);
}

/** A sticker's emoji. Screen readers get its name from the button or the picture's label. */
function emoji({ emoji: picture }) {
  const node = make('span', 'emoji', picture);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function toolButton(icon, words, onClick) {
  const node = button('sticker-tool', '', onClick);
  node.append(make('span', 'tool-icon', icon), make('span', '', words));
  node.firstChild.setAttribute('aria-hidden', 'true');
  return node;
}
