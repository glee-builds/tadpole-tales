// sentences.js: cutting a page's text into sentences, as plain functions.
//
// A sentence ends at . ! or ? (a run like "?!" or "..." counts as one end,
// and a closing quote right after it stays with the sentence), or at a new
// line. Nothing else ends one, so text with no punctuation is one sentence
// per line. This is not grammar: it only finds where to pause.

// A run of end marks on its own, or a piece that starts with anything else
// and runs up to the next end mark or new line, taking the end marks and a
// closing quote with it.
const PIECE = /[.!?]+["”]*|[^.!?\s][^.!?\n]*(?:[.!?]+["”]*)?/g;

/**
 * Cut text into sentences: [{ start, end, text }], where text is
 * text.slice(start, end) with no spaces at either side. `end` is exclusive.
 */
export function splitSentences(text) {
  const out = [];
  for (const match of String(text ?? '').matchAll(PIECE)) {
    const piece = match[0].trimEnd(); // a piece with no end mark keeps its trailing spaces otherwise
    out.push({ start: match.index, end: match.index + piece.length, text: piece });
  }
  return out;
}
