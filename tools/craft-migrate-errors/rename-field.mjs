#!/usr/bin/env node
/**
 * Compiler-driven rename of one FIELD name across a TypeScript project.
 *
 * Generalises retag.mjs, which was hard-wired to `code` -> `_tag`. Task 1.4
 * needs the same machinery for `scope` -> `providedIn`, and the two renames
 * have opposite hazards:
 *
 *   code  -> _tag       the field is OPTIONAL in structural extracts, so a
 *                       missed site degrades to `never` instead of erroring.
 *                       The compiler barely helps.
 *   scope -> providedIn the field is REQUIRED, so every missed site errors
 *                       loudly. The compiler does most of the work.
 *
 * The `--not-with` guard exists for renames that must skip one meaning of a
 * shared word: `scope` is BOTH a service's providedIn and a craft exception's
 * origin, and only the first moves. An object literal carrying `_tag` is an
 * exception meta, so its `scope` is left alone.
 *
 * Usage:
 *   node tools/craft-migrate-errors/rename-field.mjs <tsconfig> \
 *     --from=scope --to=providedIn [--not-with=_tag] [--max=N]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const project = args.find((a) => !a.startsWith('--'));
const option = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const FROM = option('from');
const TO = option('to');
const NOT_WITH = option('not-with');
const maxRounds = Number(option('max', '15'));

if (!project || !FROM || !TO) {
  console.error(
    'usage: rename-field.mjs <tsconfig> --from=X --to=Y [--not-with=Z] [--max=N]',
  );
  process.exit(2);
}

const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

const ACTIONABLE = new Set([
  'TS2344', 'TS2353', 'TS2551', 'TS2339', 'TS4111', 'TS2464',
  'TS2538', 'TS7053', 'TS2322', 'TS2352', 'TS2345', 'TS2769',
  'TS2741', // property is missing
  'TS2739',
  'TS2740',
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
      });
    }
  }
  return diagnostics;
}

const cache = new Map();
const sourceFileFor = (path) => {
  if (!cache.has(path)) {
    cache.set(
      path,
      ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ),
    );
  }
  return cache.get(path);
};

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

/** True when this member's own object literal carries the excluded sibling. */
function guarded(member) {
  if (!NOT_WITH) return false;
  const container = member.parent;
  if (!container) return false;
  const members =
    container.properties ?? container.members ?? undefined;
  if (!members) return false;
  return members.some(
    (other) =>
      other.name && ts.isIdentifier(other.name) && other.name.text === NOT_WITH,
  );
}

function hits(node) {
  const found = [];
  const push = (target, shorthand) => {
    if (!found.some((hit) => hit.node.getStart() === target.getStart())) {
      found.push({ node: target, shorthand });
    }
  };

  const consider = (current) => {
    if (
      (ts.isPropertyAssignment(current) ||
        ts.isPropertySignature(current) ||
        ts.isShorthandPropertyAssignment(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      current.name.text === FROM
    ) {
      if (!guarded(current)) {
        push(current.name, ts.isShorthandPropertyAssignment(current));
      }
      return;
    }
    if (
      ts.isPropertyAccessExpression(current) &&
      current.name.text === FROM
    ) {
      push(current.name, false);
      return;
    }
    if (
      ts.isStringLiteral(current) &&
      current.text === FROM &&
      current.parent &&
      (ts.isIndexedAccessTypeNode(current.parent) ||
        ts.isLiteralTypeNode(current.parent) ||
        ts.isElementAccessExpression(current.parent))
    ) {
      push(current, false);
    }
  };

  const visit = (current) => {
    consider(current);
    current.forEachChild(visit);
  };
  visit(node);

  let ancestor = node;
  for (let depth = 0; depth < 4 && ancestor && found.length === 0; depth += 1) {
    consider(ancestor);
    ancestor = ancestor.parent;
  }

  let container = node;
  for (let depth = 0; depth < 6 && container && found.length === 0; depth += 1) {
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

  return found;
}

let round = 0;
let previous = Infinity;

while (round < maxRounds) {
  round += 1;
  const diagnostics = runTsc();
  if (diagnostics.length === 0) {
    console.log(`round ${round}: clean`);
    break;
  }

  const byFile = new Map();
  for (const diagnostic of diagnostics) {
    if (!ACTIONABLE.has(diagnostic.code)) continue;
    const path = resolve(diagnostic.file);
    let sourceFile;
    try {
      sourceFile = sourceFileFor(path);
    } catch {
      continue;
    }
    const offset = ts.getPositionOfLineAndCharacter(
      sourceFile,
      diagnostic.line - 1,
      diagnostic.column - 1,
    );
    const edits = byFile.get(path) ?? [];
    for (const hit of hits(nodeAt(sourceFile, offset))) {
      const start = hit.node.getStart();
      if (edits.some((edit) => edit.start === start)) continue;
      edits.push({
        start,
        end: hit.node.getEnd(),
        replacement: hit.shorthand
          ? `${TO}: ${FROM}`
          : ts.isStringLiteral(hit.node)
            ? `'${TO}'`
            : TO,
      });
    }
    byFile.set(path, edits);
  }

  let applied = 0;
  for (const [path, edits] of byFile) {
    if (edits.length === 0) continue;
    let text = readFileSync(path, 'utf8');
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
    }
    writeFileSync(path, text);
    cache.delete(path);
    applied += edits.length;
  }

  console.log(
    `round ${round}: ${diagnostics.length} diagnostics, rewrote ${applied}`,
  );
  if (applied === 0 || diagnostics.length >= previous) {
    console.log('\nno further progress; remaining:');
    for (const diagnostic of diagnostics.slice(0, 25)) {
      console.log(
        `  ${diagnostic.file}(${diagnostic.line},${diagnostic.column}) ${diagnostic.code}`,
      );
    }
    break;
  }
  previous = diagnostics.length;
}
