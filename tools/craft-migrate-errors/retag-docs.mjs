#!/usr/bin/env node
/**
 * Fourth pass: the documentation.
 *
 * Docs mix two things under the same word. Only the first is renamed:
 *
 *   1. the API surface in code samples — `craftException({ code })`,
 *      `exception()?.code`, `matchNode.exhaustive(x, 'code', …)`,
 *      `AnyCraftException & { code }`;
 *   2. prose that says "code" as an ordinary English word — "source code",
 *      "existing code", "declarative code is instrumentable code".
 *
 * A blunt replace would mangle (2) into nonsense, so every rule below is
 * anchored on syntax that only appears in (1).
 *
 * Usage: node tools/craft-migrate-errors/retag-docs.mjs <root...>
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: retag-docs.mjs <root...>');
  process.exit(2);
}

/** [pattern, replacement, description] — each anchored on real syntax. */
const RULES = [
  [/(craftException\(\s*\{\s*)code(\s*:)/g, '$1_tag$2', 'craftException meta'],
  [/(craftException\(\s*\n\s*\{\s*\n\s*)code(\s*:)/g, '$1_tag$2', 'multi-line meta'],
  [/(\.exception\(\)\??\.)code\b/g, '$1_tag', 'exception().code'],
  [/(exception\??\.)code\b/g, '$1_tag', 'exception.code'],
  [/(\.exhaustive\([^,\n]+,\s*)'code'/g, "$1'_tag'", 'exhaustive discriminant arg'],
  [/(AnyCraftException\s*&\s*\{\s*)code(\s*\})/g, '$1_tag$2', 'AnyCraftException & { code }'],
  [/(\{\s*)code(\s*:\s*'[A-Za-z_][\w-]*'\s*\})/g, '$1_tag$2', 'inline meta literal'],
  [/^(\s*)code(\s*:\s*'[A-Za-z_][\w-]*',?\s*)$/gm, '$1_tag$2', 'meta key on its own line'],
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === '.vitepress') continue;
      yield* walk(path);
    } else if (path.endsWith('.md')) {
      yield path;
    }
  }
}

let touched = 0;
let total = 0;

for (const root of roots) {
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('code')) continue;

    let next = text;
    const applied = [];
    for (const [pattern, replacement, description] of RULES) {
      const before = next;
      next = next.replace(pattern, replacement);
      if (next !== before) applied.push(description);
    }

    if (next !== text) {
      writeFileSync(path, next);
      touched += 1;
      total += applied.length;
      console.log(`${path}: ${applied.join(', ')}`);
    }
  }
}

console.log(`\n${touched} doc file(s) touched`);
