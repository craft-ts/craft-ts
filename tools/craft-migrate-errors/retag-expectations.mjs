#!/usr/bin/env node
/**
 * Third pass: `code` keys inside test EXPECTATIONS.
 *
 * `expect(x).toMatchObject({ code: 'required' })` is neither a property access
 * nor a typed position, so neither the compiler-driven pass nor the runtime-read
 * pass can see it. It only shows up as a failing assertion.
 *
 * Narrow rule: a `code` property inside an argument of toEqual / toMatchObject /
 * toStrictEqual / objectContaining, AND only when the same object literal also
 * carries an exception-shaped sibling (`payload`, `scope`, `identifier`) or the
 * enclosing call is compared against a craft exception. HTTP body expectations
 * such as `{ code: 'PASSWORD_REQUIRED', message: ... }` have no such sibling and
 * are left alone.
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

const EXCEPTION_SIBLINGS = new Set(['payload', 'scope', 'identifier']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.spec.ts')) yield path;
  }
}

function collect(node, out) {
  if (ts.isObjectLiteralExpression(node)) {
    const names = node.properties
      .map((property) =>
        property.name && ts.isIdentifier(property.name)
          ? property.name.text
          : undefined,
      )
      .filter(Boolean);
    const hasSibling = names.some((name) => EXCEPTION_SIBLINGS.has(name));
    if (hasSibling) {
      for (const property of node.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name &&
          ts.isIdentifier(property.name) &&
          property.name.text === 'code'
        ) {
          out.push({
            start: property.name.getStart(),
            end: property.name.getEnd(),
          });
        }
      }
    }
  }
  node.forEachChild((child) => collect(child, out));
}

let edits = 0;
for (const root of roots) {
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('code')) continue;

    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const pending = [];

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        MATCHERS.has(node.expression.name.text)
      ) {
        for (const argument of node.arguments) collect(argument, pending);
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
