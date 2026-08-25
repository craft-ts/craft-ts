#!/usr/bin/env node
/**
 * craft-migrate-errors — moves the craft exception discriminant from `code` to
 * `_tag` (plan tasks 1.1 / 1.2).
 *
 * WHY THIS IS NOT A SED. `code` names three different things in this codebase
 * and only the first may be renamed:
 *
 *   1. the craft exception discriminant                       — the target
 *   2. the HTTP client's matcher source (`{ source: 'code' }`) and the
 *      server-sent error code in a response body               — must survive
 *   3. Standard Schema issue codes and form validator codes    — must survive
 *
 * An earlier regex version of this tool corrupted 2 and 3 twice: it renamed an
 * HTTP matcher destructuring (`{ status, code, content }`) and a `code()` test
 * helper, both of which had to be reverted by hand.
 *
 * HOW IT AVOIDS THAT. Two passes, neither of which guesses:
 *
 *   pass 1 — ask tsc where the program breaks and rewrite ONLY the token at
 *            each reported position. A position tsc did not report is never
 *            touched.
 *   pass 2 — for diagnostics whose position points at an enclosing node rather
 *            than the token (multi-line type literals), parse the file and
 *            rename `code` only WITHIN THAT NODE'S SUBTREE, located through the
 *            AST. This is what replaces the old ±6-line text window.
 *
 * Usage:
 *   node tools/craft-migrate-errors/retag.mjs <tsconfig> [--dry] [--max=N]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const maxRounds = Number(
  (args.find((a) => a.startsWith('--max=')) ?? '--max=15').slice(6),
);

if (!project) {
  console.error('usage: retag.mjs <tsconfig> [--dry] [--max=N]');
  process.exit(2);
}

const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Diagnostics that mean "this `code` is the exception discriminant". Anything
 * else is left alone — a diagnostic we do not understand is a diagnostic we do
 * not act on.
 */
const ACTIONABLE = new Set([
  'TS2344', // does not satisfy the CraftExceptionMeta constraint
  'TS2353', // 'code' does not exist in type { _tag: ... }
  'TS2551', // property does not exist, did you mean
  'TS2339', // property does not exist
  'TS4111', // comes from an index signature
  'TS2464', // computed property name must be string
  'TS2538', // unknown cannot be used as an index type
  'TS7053',
  // Generic assignability failures caused by the missing discriminant. Safe to
  // include because the AST rules below only ever rewrite `code` in a property
  // or member-access position — `{ source: 'code' }` (a string in VALUE
  // position) and `{ status, code, content }` (a binding element) are both
  // left alone by construction, which is what the regex version got wrong.
  'TS2322',
  'TS2352',
  'TS2345',
  'TS2769', // no overload matches — how a stale discriminant ARGUMENT shows up
]);

function runTsc() {
  let output = '';
  try {
    output = execFileSync('npx', ['tsc', '-p', project, '--noEmit'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const diagnostics = [];
  for (const line of output.split('\n')) {
    const match = ERROR_LINE.exec(line.trim());
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5],
      });
    }
  }
  return diagnostics;
}

const sourceCache = new Map();

function sourceFileFor(path) {
  if (!sourceCache.has(path)) {
    const text = readFileSync(path, 'utf8');
    sourceCache.set(
      path,
      ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
    );
  }
  return sourceCache.get(path);
}

function offsetOf(sourceFile, line, column) {
  return ts.getPositionOfLineAndCharacter(sourceFile, line - 1, column - 1);
}

/** The innermost node containing `offset`. */
function nodeAt(sourceFile, offset) {
  let found = sourceFile;
  const visit = (node) => {
    if (node.getStart() <= offset && offset < node.getEnd()) {
      found = node;
      node.forEachChild(visit);
    }
  };
  sourceFile.forEachChild(visit);
  return found;
}

/**
 * Every identifier named `code` inside `node` that occupies a discriminant
 * position: a property name in an object literal or type literal, or the
 * property of a `.code` access. Never a variable, parameter or callee.
 */
function discriminantIdentifiers(node) {
  const hits = [];
  const push = (target, shorthand) => {
    if (!hits.some((hit) => hit.node.getStart() === target.getStart())) {
      hits.push({ node: target, shorthand });
    }
  };

  const consider = (current) => {
    // `{ code: ... }`, `code?: ...` in a type literal, or `{ code }`.
    if (
      (ts.isPropertyAssignment(current) ||
        ts.isPropertySignature(current) ||
        ts.isShorthandPropertyAssignment(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      current.name.text === 'code'
    ) {
      push(current.name, ts.isShorthandPropertyAssignment(current));
      return;
    }
    // `something.code`
    if (ts.isPropertyAccessExpression(current) && current.name.text === 'code') {
      push(current.name, false);
      return;
    }
    // `Exception['code']` in a type, and `value['code']` in an expression.
    if (
      ts.isStringLiteral(current) &&
      current.text === 'code' &&
      current.parent &&
      (ts.isIndexedAccessTypeNode(current.parent) ||
        ts.isLiteralTypeNode(current.parent) ||
        ts.isElementAccessExpression(current.parent))
    ) {
      push(current, false);
      return;
    }
    // The discriminant passed as an ARGUMENT:
    // `matchNode.exhaustive(value, 'code', handlers)` and its craftMatch twin.
    // Narrow on purpose — second argument of a `.exhaustive` call and nothing
    // else — so `{ source: 'code' }` and other string uses stay untouched.
    if (
      ts.isStringLiteral(current) &&
      current.text === 'code' &&
      current.parent &&
      ts.isCallExpression(current.parent) &&
      current.parent.arguments[1] === current &&
      ts.isPropertyAccessExpression(current.parent.expression) &&
      current.parent.expression.name.text === 'exhaustive'
    ) {
      push(current, false);
      return;
    }
  };

  const visit = (current) => {
    consider(current);
    current.forEachChild(visit);
  };
  visit(node);

  // The reported position often lands ON the `code` identifier itself, whose
  // parent carries the meaning. Walk up a few levels before giving up.
  let ancestor = node;
  for (let depth = 0; depth < 4 && ancestor && hits.length === 0; depth += 1) {
    consider(ancestor);
    // A stale discriminant ARGUMENT reports at the callee, not at the string,
    // so look at the call's arguments too.
    if (ts.isCallExpression(ancestor)) {
      for (const argument of ancestor.arguments) consider(argument);
    }
    ancestor = ancestor.parent;
  }

  // The position can also land on a SIBLING property's value — typically the
  // `scope` of a `{ code, scope }` meta, because that is where inference gives
  // up once `_tag` is missing. Climb to the enclosing object/type literal and
  // look only at its DIRECT members: never deeper, so an unrelated nested
  // `code` is out of reach.
  let container = node;
  for (let depth = 0; depth < 6 && container && hits.length === 0; depth += 1) {
    if (
      ts.isObjectLiteralExpression(container) ||
      ts.isTypeLiteralNode(container)
    ) {
      for (const member of container.properties ?? container.members ?? []) {
        consider(member);
      }
      break;
    }
    container = container.parent;
  }
  return hits;
}

function applyEdits(path, edits) {
  if (edits.length === 0) return 0;
  const text = readFileSync(path, 'utf8');
  // Apply right-to-left so earlier offsets stay valid.
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let next = text;
  for (const edit of ordered) {
    next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
  }
  if (!dry) writeFileSync(path, next);
  sourceCache.delete(path);
  return edits.length;
}

let round = 0;
let previousCount = Infinity;

while (round < maxRounds) {
  round += 1;
  const diagnostics = runTsc();
  if (diagnostics.length === 0) {
    console.log(`round ${round}: clean`);
    break;
  }

  const editsByFile = new Map();
  let planned = 0;

  for (const diagnostic of diagnostics) {
    if (!ACTIONABLE.has(diagnostic.code)) continue;
    const path = resolve(diagnostic.file);
    let sourceFile;
    try {
      sourceFile = sourceFileFor(path);
    } catch {
      continue;
    }

    const offset = offsetOf(sourceFile, diagnostic.line, diagnostic.column);
    const node = nodeAt(sourceFile, offset);
    const hits = discriminantIdentifiers(node);
    if (hits.length === 0) continue;

    const edits = editsByFile.get(path) ?? [];
    for (const hit of hits) {
      const start = hit.node.getStart();
      const end = hit.node.getEnd();
      if (edits.some((edit) => edit.start === start)) continue;
      edits.push({
        start,
        end,
        // A shorthand `{ code }` must become `{ _tag: code }`, not `{ _tag }`,
        // or the binding it refers to is lost.
        replacement: hit.shorthand
          ? '_tag: code'
          : ts.isStringLiteral(hit.node)
            ? "'_tag'"
            : '_tag',
      });
      planned += 1;
    }
    editsByFile.set(path, edits);
  }

  let applied = 0;
  for (const [path, edits] of editsByFile) {
    applied += applyEdits(path, edits);
  }

  console.log(
    `round ${round}: ${diagnostics.length} diagnostics, rewrote ${applied}`,
  );

  if (dry) break;
  if (applied === 0 || diagnostics.length >= previousCount) {
    console.log('\nno further progress; remaining diagnostics:');
    for (const diagnostic of diagnostics.slice(0, 30)) {
      console.log(
        `  ${diagnostic.file}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code}: ${diagnostic.message.slice(0, 120)}`,
      );
    }
    break;
  }
  previousCount = diagnostics.length;
}
