// page-keyboard-pictures.mjs: the page screen: the app's own keyboard, the picture area and its stickers,
// and that every screen fits at the current size.
// Each tryX returns a problem, or '' when all is well. tests/screens.mjs runs them.

import {
  reachPage,
  page, outside, evaluate, waitFor, frame, settle,
  HOME, open, touch, holdUntil, middleOf, press,
  typed, cursorAt, tapOn, tapButton, drag, noFields,
  isDisabled, fitProblem, STORE, saveNow, shot,
} from './lib.mjs';

/** Open the keyboard from the home screen and try it with real taps. Returns a problem, or ''. */
export async function tryKeyboard() {
  if (!await open('', HOME)) return 'home did not draw';
  const go = await middleOf('.go');
  await touch(go.x, go.y);
  if (!await reachPage()) return 'the keyboard did not open';
  if (await evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length')) return 'a text field is on the screen';

  await press('shift', 'd', 'o', 't', 'space', 's', 'w', 'a', 'm');
  if (await typed() !== 'Dot swam') return `typing "Dot swam" gave "${await typed()}"`;
  if (await evaluate('document.querySelector(".writing").textContent.replace(/\\u200b/g, "")') !== 'Dot swam') return 'the words are not in the writing area for a screen reader';

  // Tap just right of the "t": the cursor goes after it.
  const t = await evaluate(`(() => { const box = document.querySelectorAll('.writing .ch')[2].getBoundingClientRect(); return { x: box.right - 2, y: box.top + box.height / 2 }; })()`);
  await touch(t.x, t.y);
  await press('s');
  if (await typed() !== 'Dots swam') return `tapping after "Dot" then "s" gave "${await typed()}"`;
  // Tap the left part of the "D": the cursor goes before it.
  const d = await evaluate(`(() => { const box = document.querySelector('.writing .ch').getBoundingClientRect(); return { x: box.left + box.width * 0.3, y: box.top + box.height / 2 }; })()`);
  await touch(d.x, d.y);
  if (await cursorAt() !== 0) return `tapping the left of the first letter put the cursor at ${await cursorAt()}`;
  // Tap the empty space below the words: the cursor goes to the end.
  const below = await evaluate(`(() => { const box = document.querySelector('.writing').getBoundingClientRect(); return { x: box.left + box.width - 10, y: box.bottom - 10 }; })()`);
  await touch(below.x, below.y);
  if (await cursorAt() !== 9) return `tapping below the words put the cursor at ${await cursorAt()}, not the end`;

  // One short tap on backspace deletes one letter; holding it keeps deleting.
  await press('backspace');
  if (await typed() !== 'Dots swa') return `one tap on backspace gave "${await typed()}"`;
  const back = await middleOf('[data-key="backspace"]');
  await holdUntil(back.x, back.y, `document.querySelectorAll('.writing .ch').length === 0`); // it stops when everything is deleted
  if (await typed() !== '') return `holding backspace left "${await typed()}"`;

  // Fast typing: the second finger lands before the first lifts. Both letters count, once each.
  const a = await middleOf('[data-key="a"]');
  const b = await middleOf('[data-key="b"]');
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await page('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [b] });
  await page('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await frame();
  if (await typed() !== 'ab') return `two overlapping taps typed "${await typed()}", not "ab"`;
  // A hardware keyboard (or switch control): Enter on a focused key types it once.
  await evaluate(`document.querySelector('[data-key="c"]').focus()`);
  await page('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await frame();
  if (await typed() !== 'abc') return `Enter on the focused "c" key gave "${await typed()}"`;
  await evaluate(`for (let i = 0; i < 3; i++) document.querySelector('[data-key="backspace"]').click()`);
  if (await typed() !== '') return `three keyboard presses of backspace left "${await typed()}"`;

  // The cursor stands out from the white writing area (3:1 or more).
  const contrast = await evaluate(`(() => {
    const rgb = (color) => color.match(/[\\d.]+/g).slice(0, 3).map(Number);
    const light = (color) => { const [r, g, b] = rgb(color).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const one = light(getComputedStyle(document.querySelector('.writing .cursor')).backgroundColor);
    const two = light(getComputedStyle(document.querySelector('.writing')).backgroundColor);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  })()`);
  if (contrast < 3) return `the cursor is only ${contrast.toFixed(1)}:1 against the writing area`;

  // Restored words with an emoji: tapping before the letter after it, then typing, keeps the emoji whole.
  await evaluate(`(async () => {
    const { mountWriter } = await import('/src/keyboard.js');
    const box = document.createElement('div');
    box.className = 'emoji-test';
    box.style.cssText = 'position: fixed; left: 0; top: 0; width: 300px; height: 400px; display: flex; flex-direction: column; background: #fff; z-index: 9';
    document.body.append(box);
    window.__writer = mountWriter(box, { text: '😀b' });
  })()`);
  const letterB = await evaluate(`(() => { const box = [...document.querySelectorAll('.emoji-test .ch')][1].getBoundingClientRect(); return { x: box.left + 1, y: box.top + box.height / 2 }; })()`);
  await touch(letterB.x, letterB.y);
  const withEmoji = await evaluate(`(() => { document.querySelector('.emoji-test [data-key="x"]').click(); const text = window.__writer.getText(); window.__writer.remove(); document.querySelector('.emoji-test').remove(); return text; })()`);
  if (withEmoji !== '😀xb') return `typing x before the b in "😀b" gave ${JSON.stringify(withEmoji)}`;

  // A full page (300 characters) fits in the writing area without scrolling.
  await evaluate(`(() => {
    const words = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. ';
    for (const char of words.repeat(5).slice(0, 305)) {
      const key = char === ' ' ? 'space' : /[A-Z]/.test(char) ? 'shift' : char;
      document.querySelector('[data-key="' + (key === '"' ? '\\\\"' : key) + '"]').click();
      if (key === 'shift') document.querySelector('[data-key="' + char.toLowerCase() + '"]').click();
    }
  })()`);
  if ((await typed()).length !== 300) return `the 300 limit let ${(await typed()).length} characters in`;
  // Tap the left edge of letter 150, in the middle of the page: the cursor goes before it.
  const mid = await evaluate(`(() => { const box = document.querySelectorAll('.writing .ch')[150].getBoundingClientRect(); return { x: box.left + 1, y: box.top + box.height / 2 }; })()`);
  await touch(mid.x, mid.y);
  if (await cursorAt() !== 150) return `tapping letter 150 put the cursor at ${await cursorAt()}`;

  const fit = await evaluate(`(() => {
    const writing = document.querySelector('.writing');
    const keys = [...document.querySelectorAll('.key')];
    const bottom = document.querySelector('.keyboard').getBoundingClientRect().bottom;
    return {
      scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
      offScreen: bottom > innerHeight + 0.5,
      short: keys.filter((key) => key.offsetHeight < 48).length,
      overflow: writing.scrollHeight > writing.clientHeight + 1,
    };
  })()`);
  if (fit.scrolls) return 'the page scrolls';
  if (fit.offScreen) return 'the keyboard goes off the bottom of the screen';
  if (fit.short) return `${fit.short} keys are less than 48px tall`;
  if (fit.overflow) return '300 characters do not fit in the writing area';
  return '';
}


/** Every placed sticker: its middle and width on screen, and as parts of the picture. */
const placed = () => evaluate(`(() => {
  const pic = document.querySelector('.picture').getBoundingClientRect();
  return [...document.querySelectorAll('.picture .sticker')].map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width,
      fx: (box.left + box.width / 2 - pic.left) / pic.width, fy: (box.top + box.height / 2 - pic.top) / pic.height,
      inside: box.left >= pic.left - 1 && box.right <= pic.right + 1 && box.top >= pic.top - 1 && box.bottom <= pic.bottom + 1 };
  });
})()`);
const toolsShow = () => evaluate(`getComputedStyle(document.querySelector('.sticker-tools')).visibility !== 'hidden'`);

/** Add, drag, size and remove stickers in the demo, with real touches. Returns a problem, or ''. */
export async function tryStickers() {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    let one = book.setPageText(book.newBook('made-up-pic-1', 1000), 0, 'page a', 1000);
    one = book.setPageText(book.addPage(one, 0, 1000), 1, 'page b', 1000);
    await store.saveBook(book.setPageText(book.addPage(one, 1, 1000), 2, 'page c', 1000));
  })()`);
  if (!await open('#book/made-up-pic-1/0', 'document.querySelector(".keyboard") !== null')) return 'the page screen did not draw';
  // Write mode shows a small picture; tapping it opens Picture mode, with no keyboard.
  await tapOn('.picture-slot');
  if (!await waitFor('document.querySelector(".tray-sticker .emoji") !== null', 3)) return 'tapping the small picture did not open Picture mode';
  if (await evaluate('document.querySelector(".keyboard") !== null')) return 'the keyboard shows in Picture mode';
  await settle();
  if (await evaluate('document.querySelectorAll("input, textarea, [contenteditable]").length')) return 'a text field is on the screen';
  const shape = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return box.width / box.height; })()`);
  if (Math.abs(shape - 4 / 3) > 0.02) return `the picture is ${shape.toFixed(2)}:1, not 4:3`;

  // Tap the tray three times: three stickers, and the newest one shows its buttons.
  const tray = await middleOf('.tray-sticker');
  for (let i = 0; i < 3; i++) await touch(tray.x, tray.y);
  if ((await placed()).length !== 3) return `three taps on the tray placed ${(await placed()).length} stickers`;
  if (!await toolsShow()) return 'a new sticker does not show its buttons';

  // Drag the top sticker 60px right and 30px down: it follows the finger (this checks the tablet zoom sums).
  const before = (await placed())[2];
  await drag({ x: before.x, y: before.y }, { x: before.x + 60, y: before.y + 30 });
  const after = (await placed())[2];
  if (Math.abs(after.x - before.x - 60) > 2 || Math.abs(after.y - before.y - 30) > 2) {
    return `a 60, 30 drag moved the sticker ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`;
  }

  // Two taps move a sticker: it is selected now, so tap an empty spot in the picture.
  const spot = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return { x: box.left + box.width * 0.15, y: box.top + box.height * 0.85 }; })()`);
  await touch(spot.x, spot.y);
  const tapped = (await placed())[2];
  if (Math.abs(tapped.x - spot.x) > 3 || Math.abs(tapped.y - spot.y) > 3) return `the second tap put the sticker at ${Math.round(tapped.x)}, ${Math.round(tapped.y)}, not ${Math.round(spot.x)}, ${Math.round(spot.y)}`;
  if (!await toolsShow()) return 'the sticker lost its buttons after a two-tap move';
  // Tap the sticker again: it is let go and the buttons hide. Tap once more: they show.
  await touch(tapped.x, tapped.y);
  if (await toolsShow()) return 'tapping the selected sticker did not hide the buttons';
  await touch(tapped.x, tapped.y);
  if (!await toolsShow()) return 'tapping a sticker did not show its buttons';
  // Bigger, then remove.
  const tools = await evaluate(`[...document.querySelectorAll('.sticker-tool')].map((b) => ({ words: b.textContent, tall: b.offsetHeight }))`);
  if (tools.some((tool) => tool.tall < 48)) return `a sticker button is less than 48px tall: ${JSON.stringify(tools)}`;
  const bigger = await evaluate(`(() => { const box = [...document.querySelectorAll('.sticker-tool')].find((b) => b.textContent.includes('Bigger')).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await touch(bigger.x, bigger.y);
  const grown = (await placed())[2];
  if (Math.abs(grown.width / after.width - 1.5) > 0.05) return `"Bigger" made the sticker ${(grown.width / after.width).toFixed(2)} times as wide, not 1.5`;
  const remove = await evaluate(`(() => { const box = [...document.querySelectorAll('.sticker-tool')].find((b) => b.textContent.includes('Remove')).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await touch(remove.x, remove.y);
  if ((await placed()).length !== 2) return `"Remove" left ${(await placed()).length} stickers, not 2`;
  if (await toolsShow()) return 'the buttons still show after the sticker was removed';

  // Up to 12, and no more.
  for (let i = 0; i < 11; i++) await touch(tray.x, tray.y);
  if ((await placed()).length !== 12) return `the tray let ${(await placed()).length} stickers on, not 12`;
  if (await evaluate('document.querySelector(".sticker-full").hidden')) return 'no "12 is the most" note at 12 stickers';

  // Drag one far past the bottom right: it stops at the edge. Nothing spills outside the picture.
  const last = (await placed())[11];
  await drag({ x: last.x, y: last.y }, { x: await evaluate('innerWidth - 2'), y: await evaluate('innerHeight - 2') });
  const end = await placed();
  if (end.some((s) => !s.inside)) return 'a sticker spills outside the picture';
  if (end[11].fx < 0.85 || end[11].fy < 0.8) return `dragging past the corner left the sticker at ${end[11].fx.toFixed(2)}, ${end[11].fy.toFixed(2)}`;

  const beforeReload = await placed();
  // Saved on the page: reload and see them, in Write mode's small picture and in Picture mode.
  await saveNow();
  await open('#book/made-up-pic-1/0', 'document.querySelector(".keyboard") !== null');
  if (!await waitFor(`document.querySelectorAll('.picture .sticker').length === 12`, 3)) return `after a reload Write mode's picture has ${await evaluate(`document.querySelectorAll('.picture .sticker').length`)} stickers, not 12`;
  if (await evaluate(`document.querySelectorAll('.picture button').length`)) return "Write mode's small picture has buttons";
  await tapButton('Picture');
  await waitFor(`document.querySelectorAll('.picture .sticker').length === 12`, 3);
  const kept = await placed();
  if (kept.some((k, i) => Math.abs(k.x - beforeReload[i].x) > 2 || Math.abs(k.y - beforeReload[i].y) > 2)) return 'the stickers are not where they were after a reload';
  if (await evaluate(`document.querySelectorAll('.picture .sticker').length`) !== 12) return 'the stickers did not come back';

  // Move page: page 1 later puts it second, and the stickers go with it. The ends are off.
  if (!await isDisabled('Earlier')) return 'Move earlier should be off on page 1';
  await tapButton('Later');
  if (!await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 2 of 3'`, 3)) return 'Move later did not go to page 2';
  if ((await placed()).length !== 12) return 'the stickers did not move with the page';
  await tapButton('Later');
  await waitFor(`document.querySelector('.screen-title')?.textContent === 'Page 3 of 3'`, 3);
  if (!await isDisabled('Later')) return 'Move later should be off on the last page';
  await saveNow();
  await open('#book/made-up-pic-1/2', 'document.querySelector(".keyboard") !== null');
  const order = await evaluate(`(async () => { ${STORE} const [one] = await store.loadBooks(); return one.pages.map((p) => p.text + ':' + p.stickers.length).join(); })()`);
  if (order !== 'page b:0,page c:0,page a:12') return `after moving page 1 to the end and a reload the pages are "${order}"`;
  await tapButton('Picture');
  await waitFor('document.querySelector(".tray-sticker") !== null', 3);

  const fit = await evaluate(`(() => ({
    scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
    small: [...document.querySelectorAll('.tray-sticker, .pill, .mode-choice')].filter((b) => b.offsetParent !== null && (b.offsetWidth < 48 || b.offsetHeight < 48)).map((b) => b.textContent + b.offsetWidth + 'x' + b.offsetHeight).join(),
  }))()`);
  if (fit.scrolls) return 'the page scrolls';
  if (fit.small) return `${fit.small} buttons are smaller than 48px`;

  // The read-only picture puts a sticker in the same place.
  const reading = await evaluate(`(async () => {
    const { mountPicture, loadStickerList } = await import('/src/stickers.js');
    const [first] = await loadStickerList();
    const box = document.createElement('div');
    box.style.cssText = 'position: fixed; left: 0; top: 0; width: 200px';
    document.body.append(box);
    mountPicture(box, { stickers: [{ id: first.id, x: 0.25, y: 0.6, size: 1 }] });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pic = box.querySelector('.picture').getBoundingClientRect();
    const s = box.querySelector('.sticker').getBoundingClientRect();
    const result = { buttons: box.querySelectorAll('button').length, fx: (s.left + s.width / 2 - pic.left) / pic.width, fy: (s.top + s.height / 2 - pic.top) / pic.height };
    box.remove();
    return result;
  })()`);
  if (reading.buttons) return 'the read-only picture has buttons';
  if (Math.abs(reading.fx - 0.25) > 0.02 || Math.abs(reading.fy - 0.6) > 0.02) return `the read-only picture put 0.25, 0.6 at ${reading.fx.toFixed(2)}, ${reading.fy.toFixed(2)}`;
  return '';
}


/** Every screen fits at this size: the shelf, a full page, a page, the reading view. Returns a problem, or ''. */
export async function tryFits() {
  await open('', HOME);
  await evaluate(`(async () => { ${STORE} await store.startOver();
    const long = 'The frog hops to the big rock, and sees a tiny fish! "Hello," says the frog. '.repeat(5).slice(0, 300);
    const ids = (await (await fetch('/data/stickers.json')).json()).slice(0, 12).map((s) => s.id);
    let one = book.setPageText(book.newBook('made-up-fit-1', 1000), 0, long, 1000);
    one.pages[0].stickers = ids.map((id, i) => ({ id, x: 0.12 + (i % 4) * 0.25, y: 0.2 + Math.floor(i / 4) * 0.3, size: 1 }));
    one = book.setPageText(book.addPage(one, 0, 1000), 1, 'Two fish had a party.', 1000);
    await store.saveBook(one);
    await store.saveBook({ ...book.setPageText(book.newBook('made-up-fit-2', 2000), 0, 'A snail raced a leaf.', 2000), finished: true, title: 'The Big Rock' });
    await store.saveBook(book.setPageText(book.newBook('made-up-fit-3', 3000), 0, 'The moon fell in the pond and made a splash.', 3000));
  })()`);
  const width = await evaluate('innerWidth');
  for (const [name, address, ready] of [
    ['the shelf', '', '[...document.querySelectorAll(".book-card:not(.example-card)")].length === 3'],
    ['a full page', '#book/made-up-fit-1/0', 'document.querySelector(".keyboard") !== null'],
    ['a short page', '#book/made-up-fit-1/1', 'document.querySelector(".keyboard") !== null'],
    ['the reading view', '#read/made-up-fit-1', 'document.querySelector(".read-page") !== null'],
  ]) {
    if (!await open(address, ready)) return `${name} did not draw`;
    await settle();
    const problem = await fitProblem();
    if (problem) return `${name}: ${problem}`;
    if (name === 'the reading view') {
      await waitFor('document.querySelectorAll(".read-art .sticker").length === 12', 3);
      if (await evaluate('document.querySelectorAll(".read-art .sticker").length') !== 12) return 'the reading view does not show the 12 stickers';
      if (!await evaluate('document.querySelector(".read-voice").offsetHeight >= 48 || document.querySelector(".read-voice").hidden')) return 'Read to me is shorter than 48px';
      const problem2 = await fitProblem();
      if (problem2) return `${name} with its stickers: ${problem2}`;
    }
    if (name !== 'the shelf' && !await noFields()) return `${name} has a text field`;
    if (name === 'a full page') { // the picture keeps a sensible size even on a full page, with a put-back bar showing
      const size = await evaluate(`(() => { const box = document.querySelector('.picture').getBoundingClientRect(); return { w: box.width, h: box.height }; })()`);
      if (size.h < 50 || size.w < 66) return `the picture on a full page is only ${Math.round(size.w)} x ${Math.round(size.h)}`;
    }
    await shot(name, width);
  }
  // A page with a put-back bar: still fits.
  if (!await open('#book/made-up-fit-1/1', 'document.querySelector(".keyboard") !== null')) return 'the put-back page did not draw';
  await tapButton('Remove');
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Put page back'))`, 3);
  await settle();
  const barProblem = await fitProblem();
  if (barProblem) return `with the put-back bar: ${barProblem}`;
  await shot('put-back bar', width);
  // Picture mode, on a full page and on a page of a short book.
  for (const [name, address] of [['picture mode', '#book/made-up-fit-1/0'], ['picture mode, last page', '#book/made-up-fit-1/1']]) {
    if (!await open(address, 'document.querySelector(".keyboard") !== null')) return `${name} did not draw`;
    await tapButton('Picture');
    if (!await waitFor('document.querySelector(".tray-sticker .emoji") !== null', 3)) return `${name} did not open`;
    await settle();
    const problem = await fitProblem();
    if (problem) return `${name}: ${problem}`;
    if (!await noFields()) return `${name} has a text field`;
    await shot(name, width);
  }
  return '';
}


