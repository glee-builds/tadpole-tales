// Tests for src/polish.js (spelling suggestions). Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWordLists, wordsToAsk, applySuggestion, MAX_ASKED } from '../src/polish.js';

const read = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
const lists = loadWordLists(read('known-words.txt'), read('common-words.txt'));
const bookOf = (...texts) => ({ format: 1, id: 'b', title: '', pages: texts.map((text) => ({ text, stickers: [] })) });
const ask = (text, names = []) => wordsToAsk(bookOf(text), lists, names);
const suggest = (word) => ask(word)[0]?.suggestion ?? null;

test('loadWordLists reads one word per line, lowercased, in order', () => {
  const l = loadWordLists('Cat\ndog\n', 'The\nand\nthe\n\n');
  assert.deepEqual(l.common, ['the', 'and']);
  assert.ok(l.known.has('cat') && l.known.has('the') && l.commonSet.has('and') && !l.commonSet.has('cat'));
});

test('the word lists are real: 2,500 to 4,000 common words, many known ones, and common is inside known', () => {
  assert.ok(lists.common.length >= 2500 && lists.common.length <= 4000, `common has ${lists.common.length}`);
  assert.ok(lists.known.size > 100000);
  assert.deepEqual(lists.common.filter((w) => !lists.known.has(w)), []);
  assert.ok(lists.common.every((w) => /^[a-z]+(?:'[a-z]+)?$/.test(w)));
  for (const w of ['okay', 'robot', "don't", 'mom', 'dinosaur', 'because', 'friend']) assert.ok(lists.known.has(w), w);
});

test('never asks about a known word', () => {
  const text = 'The dragon said I can\'t go home because my friends played. okay! robots and pizza. dogs, cats.';
  assert.deepEqual(ask(text), []);
  assert.deepEqual(ask([...lists.common.slice(0, 500)].join(' ')), []);
});

test('the example slips', () => {
  const expected = { rok: 'rock', frend: 'friend', jumpd: 'jumped', teh: 'the', beautful: 'beautiful', wen: 'when', freind: 'friend', becuz: null };
  for (const [word, want] of Object.entries(expected)) assert.equal(suggest(word), want, word);
});

test('skips capitals, names, numbers and odd characters', () => {
  assert.deepEqual(ask('Frend Rok TEH'), []);
  assert.deepEqual(ask('2frend frend2 b4 123 café'), []);
  assert.deepEqual(ask('rok and frend', ['Rok', 'FREND']), []);
  assert.deepEqual(ask('rok and frend', ['rok']).map((item) => item.word), ['frend']);
});

test('gives the place of the word, reading order, each misspelling once', () => {
  const book = bookOf('I like to jumpd.', 'My frend and jumpd and rok. A rok.');
  const items = wordsToAsk(book, lists, []);
  assert.deepEqual(items.map((i) => [i.pageIndex, i.word, i.suggestion]), [[0, 'jumpd', 'jumped'], [1, 'frend', 'friend'], [1, 'rok', 'rock']]);
  for (const i of items) assert.equal(book.pages[i.pageIndex].text.slice(i.start, i.end), i.word);
});

test('quotes, apostrophes and a trailing s do not confuse it', () => {
  assert.deepEqual(ask('"frend," said it. \'rok\' dogs\' dog\'s'), [
    { pageIndex: 0, start: 1, end: 6, word: 'frend', suggestion: 'friend' },
    { pageIndex: 0, start: 19, end: 22, word: 'rok', suggestion: 'rock' },
  ]);
  assert.equal(suggest('wont'), "won't");
  assert.equal(suggest('dont'), "don't");
});

test('at most 8 words for the whole book, across pages', () => {
  const slips = ['frend', 'rok', 'teh', 'jumpd', 'beautful', 'wen', 'freind', 'littel', 'howse', 'verry'];
  const items = wordsToAsk(bookOf(slips.slice(0, 5).join(' '), slips.slice(5).join(' ')), lists, []);
  assert.equal(items.length, MAX_ASKED);
  assert.equal(MAX_ASKED, 8);
});

test('every suggestion is a word from the common list, and never a known-right word the writer typed', () => {
  const book = bookOf(SLIPS.join(' '));
  for (let i = 0; i < SLIPS.length; i += 4) {
    for (const item of wordsToAsk(bookOf(SLIPS.slice(i, i + 4).join(' ')), lists, [])) {
      assert.ok(lists.commonSet.has(item.suggestion), item.suggestion);
      assert.ok(!lists.known.has(item.word), item.word);
    }
  }
  assert.ok(wordsToAsk(book, lists, []).length <= 8);
});

test('applySuggestion changes only that one word', () => {
  const book = bookOf('my frend and my frend', 'untouched');
  const before = JSON.stringify(book);
  const [item] = wordsToAsk(book, lists, []);
  const next = applySuggestion(book, item);
  assert.equal(next.pages[0].text, 'my friend and my frend');
  assert.equal(next.pages[1], book.pages[1]);
  assert.equal(next.id, book.id);
  assert.equal(JSON.stringify(book), before, 'the old book is not changed');
  assert.equal(applySuggestion(next, item), next, 'a moved word is left alone');
});

// Typical slips of young writers: sounded-out words. The test prints each one.
const SLIPS = ('sed wus thay becos wont sum wer frum agen verry littel howse wuz sead ther thier theyr wat wich whitch yoo yu ' +
  'nite nigt skool scool frens freinds frends haf hav luv lvoe sayd wunce prety pritty becuse becaus becase beacuse runing swiming ' +
  'jumpt jumpd walkd playd plaied lookd stopd tryed cryed trid dragun dragan dragen drgon castel casle casul rokit roket rocet pupy ' +
  'puppie dinosor dinasaur spaceshp spacship tresure treasur forrest forist forrist diamnd diamand pirat wizerd wizzard wizad ' +
  'kingdum kigdom prinsess pricess whent wen mornig moring tomorow tomarrow tommorow todai todae yestarday yesturday ' +
  'eny evry everone sumthing somthin nuthing nothin allways alwayz agian agin againe tooday pleese plese sory sorrey excitted exited ' +
  'scarey scairy hapy happey brav braev gaint giaint monstr monstor monstar bik kno nu').split(' ');

test('about 100 typical slips: print each word and its suggestion, check the ones that must be right', () => {
  assert.ok(SLIPS.length >= 100);
  const lines = SLIPS.map((word) => `${word} -> ${suggest(word) ?? '(quiet)'}`);
  console.log(lines.join('\n'));
  const right = {
    frend: 'friend', hav: 'have', littel: 'little', howse: 'house', verry: 'very', prety: 'pretty', becuse: 'because',
    castel: 'castle', dinosor: 'dinosaur', treasur: 'treasure', forrest: 'forest', tomorow: 'tomorrow', todai: 'today',
    sumthing: 'something', agian: 'again', sory: 'sorry', pleese: 'please', hapy: 'happy', roket: 'rocket', wer: null,
    wus: 'was', dont: "don't", skool: null, thay: 'they', sed: 'said',
  };
  for (const [word, want] of Object.entries(right)) assert.equal(suggest(word), want, word);
});

import { namesFrom, sentenceAround } from '../src/polish-screen.js';

test('the screen: names come from the plan and the author', () => {
  assert.deepEqual(namesFrom({ plan: { who: "Pipp, a small frog", where: 'a pond' } }, 'tess'), ['Pipp', 'a', 'small', 'frog', 'tess']);
  assert.deepEqual(namesFrom({}, undefined), []);
});

test('the screen: the word is shown in its own sentence, a long one cut short', () => {
  const text = 'I have a frend. We sit on a rok.';
  assert.deepEqual(sentenceAround(text, { start: 9, end: 14 }), ['I have a ', 'frend', '.']);
  const long = `${'word '.repeat(40)}rok ${'more '.repeat(40)}`;
  const at = long.indexOf('rok');
  const [before, word, after] = sentenceAround(long, { start: at, end: at + 3 });
  assert.equal(word, 'rok');
  assert.ok(before.length < 70 && after.length < 70 && before.startsWith('…') && after.endsWith('…'));
});
