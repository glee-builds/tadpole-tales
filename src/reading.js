// reading.js: the reading view. One page at a time: its picture above its
// words in big type, and "Read to me" to have the book read aloud.

import { make, button } from './ui.js';
import { mountPicture } from './stickers.js';
import { readAloud } from './readaloud.js';
import { canSpeak, voiceMissing } from './voice.js';

const BIGGEST = 24; // px: the words start this big...
const SMALLEST = 20; // ...and only shrink to this, and only once the picture has shrunk
const MIN_PICTURE = 110; // px tall: below this the words shrink a little instead
const GAP = 12; // px between the picture and the words

/** Draw `book` into `root` (a flex column that fills the screen). `onClose` leaves it. */
export function showReading(root, book, { onClose }) {
  let index = 0;
  let stopSpeaking = null; // set while "Read to me" is reading
  let picture = null;
  root.replaceChildren();

  const top = root.appendChild(make('div', 'screen-top'));
  const close = top.appendChild(button('pill', '✕ Close', () => { stopReading(); onClose(); }));
  close.setAttribute('aria-label', 'Close the book');
  top.append(make('h1', 'screen-title', book.title || 'Your book'));

  const page = root.appendChild(make('div', 'read-page'));
  page.setAttribute('aria-live', 'polite');
  const art = page.appendChild(make('div', 'read-art'));
  const words = page.appendChild(make('p', 'read-text'));

  const voice = root.appendChild(button('pill pill-go read-voice', '', () => (stopSpeaking ? stopReading() : startReading())));
  voice.hidden = !canSpeak();
  // A device with no English voice would be silent, so the button hides there too.
  if (!voice.hidden) voiceMissing().then((missing) => { if (missing && !stopSpeaking) voice.hidden = true; });
  setVoiceLabel();

  const nav = root.appendChild(make('div', 'read-nav'));
  const previous = nav.appendChild(button('pill', '‹ Previous', () => show(index - 1)));
  const count = nav.appendChild(make('p', 'read-count'));
  count.style.margin = '0';
  const next = nav.appendChild(button('pill', 'Next ›', () => show(index + 1)));

  function setVoiceLabel() {
    voice.textContent = stopSpeaking ? '⏹ Stop' : '🔊 Read to me';
    voice.setAttribute('aria-pressed', String(stopSpeaking !== null));
  }

  /** The words, with text[start, end) marked (a sentence, or a word) when given. */
  function drawWords(start, end, cls) {
    const text = book.pages[index].text;
    words.className = text ? 'read-text' : 'read-text read-empty';
    if (!text) words.textContent = 'This page has no words yet.';
    else if (start === undefined) words.textContent = text;
    else words.replaceChildren(text.slice(0, start), make('span', cls, text.slice(start, end)), text.slice(end));
  }

  /** Shrink the picture first to make room for the words, then the words a little (never below 20px). */
  function fit() {
    const style = getComputedStyle(page);
    const room = page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const across = page.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const has = picture !== null;
    let size = BIGGEST;
    let left;
    for (;; size--) {
      words.style.fontSize = `${size}px`;
      left = room - words.offsetHeight - (has ? GAP : 0);
      if (left >= (has ? MIN_PICTURE : 0) || size <= SMALLEST) break;
    }
    if (!has) return;
    const high = Math.max(0, Math.floor(left));
    art.style.height = `${high}px`;
    art.style.marginBottom = high ? `${GAP}px` : '0';
    picture.node.style.width = `${Math.min(across, Math.floor((high * 4) / 3))}px`;
  }

  function show(to, byHand = true) {
    if (byHand) stopReading(); // turning a page by hand ends reading aloud
    index = Math.min(Math.max(to, 0), book.pages.length - 1);
    picture?.remove();
    picture = null;
    const stickers = book.pages[index].stickers; // no stickers field (an older page): no picture, no fuss
    if (stickers?.length) picture = mountPicture(art, { stickers });
    art.style.height = '';
    drawWords();
    fit();
    page.scrollTop = 0;
    count.textContent = `Page ${index + 1} of ${book.pages.length}`;
    previous.disabled = index === 0;
    next.disabled = index === book.pages.length - 1;
  }

  function startReading() {
    const from = index;
    let ended = false;
    const stop = readAloud(book.pages.slice(from).map((one) => one.text), {
      onSentence(at, sentence) {
        if (at + from !== index) show(at + from, false); // turn the page by itself
        drawWords(sentence.start, sentence.end, 'read-now');
      },
      onWord: (at, start, end) => drawWords(start, end, 'read-word'),
      onDone() { ended = true; stopSpeaking = null; drawWords(); setVoiceLabel(); },
    });
    if (ended) return; // no voice, or nothing to say: it was over before it began
    stopSpeaking = stop;
    setVoiceLabel();
    window.addEventListener('hashchange', stopReading, { once: true }); // leaving by the back button
  }

  function stopReading() {
    if (!stopSpeaking) return;
    const stop = stopSpeaking;
    stopSpeaking = null;
    stop();
    drawWords();
    setVoiceLabel();
  }

  show(0, false);
  if (document.fonts?.ready) document.fonts.ready.then(fit); // the words' height changes once Andika loads
  if (window.ResizeObserver) new ResizeObserver(fit).observe(page); // a turned iPad
}
