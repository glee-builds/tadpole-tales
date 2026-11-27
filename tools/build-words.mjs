// build-words.mjs: makes data/known-words.txt, the words the app never questions.
// Run from the repo root:  node tools/build-words.mjs [dictionary-file]
//
// Source: Webster's Second International (1934, public domain), the Mac's
// /usr/share/dict/web2. Kept: 3 to 12 letters (a-z only), lowercase, no
// repeats, plus every word in data/common-words.txt.
// A few old web2 spellings that a child's slip can land on are left out (OLD
// below), because a "known" word is never asked about.
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const dictFile = process.argv[2] ?? '/usr/share/dict/web2';
const MAX_LETTERS = 12; // lower to 10 if the file ever gets too big for an old iPad
const OLD = new Set(['wen', 'rok', 'wont', 'dont', 'agen', 'tho', 'mor', 'wer', 'hav', 'wel', 'ther', 'thay']);

const common = readFileSync(new URL('../data/common-words.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const known = new Set(common);
for (const raw of readFileSync(dictFile, 'latin1').split('\n')) {
  const word = raw.trim().toLowerCase();
  if (/^[a-z]{3,}$/.test(word) && word.length <= MAX_LETTERS && !OLD.has(word)) known.add(word);
}
const out = new URL('../data/known-words.txt', import.meta.url);
writeFileSync(out, [...known].sort().join('\n') + '\n');
console.log(`${known.size} words, ${Math.round(statSync(out).size / 1024)} KB`);
