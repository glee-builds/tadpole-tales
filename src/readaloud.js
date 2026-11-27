// readaloud.js: "Read to me". Speaks a book one sentence at a time with the
// device's own voice, and tells the reading screen what is being said.
//
// The speaking part (readAloud) is thin. What can be worked out without a
// speaker (queueOf, wordSpan) is plain functions with tests.

import { splitSentences } from './sentences.js';
import { pickVoice, canSpeak } from './voice.js';

const HAS_SOUND = /[\p{L}\p{N}]/u; // "..." or "?" alone has nothing to say

/** Every sentence of every page, in order, as [{ pageIndex, start, end, text }]. Pieces with no letters or digits are left out. */
export function queueOf(pages) {
  return pages.flatMap((text, pageIndex) =>
    splitSentences(text).filter((s) => HAS_SOUND.test(s.text)).map((s) => ({ pageIndex, ...s })));
}

/**
 * Where a spoken word sits in the page's text. `charIndex` (and `charLength`,
 * which some browsers leave out) come from the browser's boundary event for
 * an utterance that said sentence.text. Returns { start, end } as offsets in
 * the page's text, or null if the event doesn't point into the sentence.
 */
export function wordSpan(sentence, charIndex, charLength) {
  const { text } = sentence;
  if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex >= text.length) return null;
  const length = Number.isInteger(charLength) && charLength > 0
    ? charLength
    : /^\S+/.exec(text.slice(charIndex))?.[0].length ?? 1; // no length sent: the word runs to the next space
  return { start: sentence.start + charIndex, end: sentence.start + Math.min(charIndex + length, text.length) };
}

/**
 * Read `pages` (an array of page texts) aloud. Calls onSentence(pageIndex, sentence)
 * as each sentence starts, onWord(pageIndex, start, end) only if the browser
 * sends word timing, and onDone() when the end is reached or the page is hidden.
 * Returns stop(), which stops at once and does not call onDone.
 * With no on-device voice it says nothing and calls onDone() at once.
 */
export function readAloud(pages, { onSentence, onWord, onDone } = {}) {
  const queue = queueOf(pages);
  const synth = canSpeak() ? window.speechSynthesis : null;
  const voice = synth ? pickVoice(synth.getVoices()) : null;
  if (!voice || !queue.length) { onDone?.(); return () => {}; }

  let stopped = false;
  let utterance = null; // held so Safari doesn't drop it before it finishes
  const hidden = () => { if (document.hidden) finish(); };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', finish);
    synth.cancel();
  };
  function finish() { if (!stopped) { stop(); onDone?.(); } }

  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', finish);
  synth.cancel(); // drop anything left over from before

  const next = (i) => {
    if (stopped) return;
    if (i >= queue.length) return finish();
    const { pageIndex, start, end, text } = queue[i];
    onSentence?.(pageIndex, { start, end, text });
    utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.9;
    // Only a boundary event named 'word' counts: that is how we find out the browser sends word timing.
    utterance.onboundary = (event) => {
      if (stopped || event.name !== 'word') return;
      const span = wordSpan(queue[i], event.charIndex, event.charLength);
      if (span) onWord?.(pageIndex, span.start, span.end);
    };
    utterance.onend = () => next(i + 1);
    utterance.onerror = () => finish();
    synth.speak(utterance);
  };
  next(0);
  return stop;
}
