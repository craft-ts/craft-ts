#!/usr/bin/env node
/**
 * Companion pass to retag.mjs, for the reads the compiler cannot see.
 *
 * A spec that asserts `exception.code` compiles fine after the rename — the
 * value is often `any`, or carries an index signature — and then fails at
 * RUNTIME reading undefined. The main codemod is compiler-driven, so by
 * construction it cannot reach these.
 *
 * This pass is AST-based too, and only rewrites `.code` when the receiver
 * expression names an exception: `exception`, `raised`, `err`, `error`, or a
 * `.exception` member access. `payload.code` (a server-sent body code) and
 * `issue.code` (Standard Schema) do not match and are left alone.
 *
 * Usage: node tools/craft-migrate-errors/retag-runtime-reads.mjs <root...>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: retag-runtime-reads.mjs <root...>');
  process.exit(2);
}

const EXCEPTION_RECEIVER = /^(exception|raised|err|error|thrown)/i;

function looksLikeException(expression) {
  if (ts.isIdentifier(expression)) {
    return EXCEPTION_RECEIVER.test(expression.text);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return (
      EXCEPTION_RECEIVER.test(expression.name.text) ||
      looksLikeException(expression.expression)
    );
  }
  if (ts.isParenthesizedExpression(expression)) {
    return looksLikeException(expression.expression);
  }
  if (ts.isAsExpression(expression)) {
    return (
      looksLikeException(expression.expression) ||
      /Exception|ShortCircuit/.test(expression.type.getText())
    );
  }
  if (ts.isCallExpression(expression)) {
    return looksLikeException(expression.expression);
  }
  return false;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (path.endsWith('.ts')) {
      yield path;
    }
  }
}

let files = 0;
let edits = 0;

for (const root of roots) {
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('.code')) continue;

    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const pending = [];

    const visit = (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'code' &&
        looksLikeException(node.expression)
      ) {
        pending.push({ start: node.name.getStart(), end: node.name.getEnd() });
      }
      node.forEachChild(visit);
    };
    source.forEachChild(visit);

    if (pending.length === 0) continue;

    let next = text;
    for (const edit of pending.sort((a, b) => b.start - a.start)) {
      next = `${next.slice(0, edit.start)}_tag${next.slice(edit.end)}`;
    }
    writeFileSync(path, next);
    files += 1;
    edits += pending.length;
    console.log(`${path}: ${pending.length}`);
  }
}

console.log(`\n${edits} read(s) rewritten across ${files} file(s)`);
