#!/usr/bin/env node
/**
 * Third pass: `code` keys inside test EXPECTATIONS.
 *
 * `expect(x).toMatchObject({ code: 'required' })` is neither a property access
 * nor a typed position, so neither the compiler-driven pass nor the runtime-read
 * pass can see it. It only shows up as a failing assertion.
 *
 * Rule, in two parts, both required:
 *
 *   1. the `code` property sits inside an argument of toEqual / toMatchObject /
 *      toStrictEqual / objectContaining;
 *   2. its value is a string literal that the SAME FILE also builds as a `_tag`
 *      — i.e. the file really does construct that exception.
 *
 * The second part is the interesting one: it is a cross-check, not a guess. An
 * HTTP body expectation like `{ code: 'PASSWORD_REQUIRED' }` is only renamed if
 * the file itself creates a craft exception tagged 'PASSWORD_REQUIRED', which
 * is exactly the case where the rename is correct.
 *
 * An earlier version keyed on a `payload`/`scope` sibling instead. It was too
 * strict — it caught 1 site and missed every form-validator expectation.
 *
 * Usage: node tools/craft-migrate-errors/retag-expectations.mjs <root...>
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: retag-expectations.mjs <root...>');
  process.exit(2);
}

const MATCHERS = new Set([
  'toEqual',
  'toMatchObject',
  'toStrictEqual',
  'objectContaining',
]);

/** Every string used as a `_tag` value anywhere in the file. */
function knownTags(source) {
  const tags = new Set();
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === '_tag' &&
      ts.isStringLiteral(node.initializer)
    ) {
      tags.add(node.initializer.text);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return tags;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.spec.ts')) yield path;
  }
}

function collect(node, out, tags) {
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        property.name &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'code' &&
        ts.isStringLiteral(property.initializer) &&
        tags.has(property.initializer.text)
      ) {
        out.push({
          start: property.name.getStart(),
          end: property.name.getEnd(),
        });
      }
    }
  }
  node.forEachChild((child) => collect(child, out, tags));
}

let edits = 0;
for (const root of roots) {
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('code')) continue;

    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const tags = knownTags(source);
    if (tags.size === 0) continue;
    const pending = [];

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        MATCHERS.has(node.expression.name.text)
      ) {
        for (const argument of node.arguments) collect(argument, pending, tags);
      }
      node.forEachChild(visit);
    };
    source.forEachChild(visit);

    if (pending.length === 0) continue;

    const unique = [...new Map(pending.map((p) => [p.start, p])).values()];
    let next = text;
    for (const edit of unique.sort((a, b) => b.start - a.start)) {
      next = `${next.slice(0, edit.start)}_tag${next.slice(edit.end)}`;
    }
    writeFileSync(path, next);
    edits += unique.length;
    console.log(`${path}: ${unique.length}`);
  }
}
console.log(`\n${edits} expectation key(s) rewritten`);
