// Scans the app's own code for features newer than Safari 15 (the older iPad's version is unknown).
// Run all tests with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = [
  ...readdirSync(new URL('src/', root)).filter((f) => /\.(js|css)$/.test(f)).map((f) => `src/${f}`),
  'sw.js', 'styles.css',
];

// [pattern, what]. crypto.randomUUID and 100dvh are allowed where they have a fallback (book.js, an @supports block).
const NEWER = [
  [/Object\.hasOwn\b/, 'Object.hasOwn'], [/\.at\(/, '.at('], [/\bstructuredClone\b/, 'structuredClone'],
  [/\.findLast(Index)?\(/, 'findLast'], [/\.group(ToMap)?\(/, 'Array group'], [/\.to(Sorted|Reversed|Spliced)\(/, 'toSorted/toReversed'],
  [/\.with\(/, '.with('], [/(\?<[=!])/, 'regex lookbehind'], [/\bAbortSignal\.(timeout|any)\b/, 'AbortSignal.timeout'],
  [/:has\(/, ':has('], [/@container\b/, '@container'], [/@layer\b/, '@layer'], [/\binert\b/, 'inert'],
  [/^\s*&[\s.:{]|\{\s*&/m, 'CSS nesting'],
  [/\b[sl]vh\b|\d(svh|lvh|svw|lvw|dvw)\b/, 'svh/lvh units'],
];

test('no feature newer than Safari 15 in src/, sw.js or the styles', () => {
  const found = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const [pattern, what] of NEWER) if (pattern.test(text)) found.push(`${file}: ${what}`);
    if (/:focus-visible/.test(text) && !/:focus:not\(:focus-visible\)/.test(text)) found.push(`${file}: :focus-visible without a :focus fallback`);
    if (/color-mix\(/.test(text) && !/@supports[^{]*color-mix/.test(text)) found.push(`${file}: color-mix outside @supports`);
    for (const m of text.matchAll(/\d+dvh/g)) {
      if (!new RegExp(`@supports[^{]*dvh`).test(text)) found.push(`${file}: ${m[0]} without @supports`);
    }
    if (/crypto\.randomUUID\(/.test(text) && !/if \(crypto\.randomUUID\)/.test(text)) found.push(`${file}: randomUUID without a check`);
  }
  assert.deepEqual(found, []);
});
