#!/usr/bin/env node
/**
 * Finds the type-position reads that a field rename breaks SILENTLY.
 *
 * A value-position read errors at every site. A type-position read — a
 * conditional or an Extract — resolves to `never` instead, and the capability
 * behind it just stops existing with no diagnostic anywhere. Five such sites
 * were found by accident during the wave-1 renames, each after the fact.
 *
 * This is the tool that should have existed first. Run it BEFORE a rename to
 * get the list, and after, to prove the list is empty.
 *
 * Usage: node tools/craft-migrate-errors/find-silent-sites.mjs <field> <root...>
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const [field, ...roots] = process.argv.slice(2);
if (!field || roots.length === 0) {
  console.error('usage: find-silent-sites.mjs <field> <root...>');
  process.exit(2);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

const findings = [];

for (const root of roots) {
  for (const path of walk(root)) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes(field)) continue;

    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

    const visit = (node) => {
      // `X extends { field: … }` — a conditional type whose check reads it.
      if (ts.isConditionalTypeNode(node)) {
        const extendsType = node.extendsType;
        if (ts.isTypeLiteralNode(extendsType)) {
          for (const member of extendsType.members) {
            if (
              member.name &&
              ts.isIdentifier(member.name) &&
              member.name.text === field
            ) {
              findings.push({
                path,
                line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                kind: 'conditional',
                text: node.getText().split('\n')[0].slice(0, 90),
              });
            }
          }
        }
      }

      // `Extract<X, { field: … }>` and friends.
      if (
        ts.isTypeReferenceNode(node) &&
        ts.isIdentifier(node.typeName) &&
        ['Extract', 'Exclude', 'Omit', 'Pick'].includes(node.typeName.text)
      ) {
        for (const argument of node.typeArguments ?? []) {
          if (!ts.isTypeLiteralNode(argument)) continue;
          for (const member of argument.members) {
            if (
              member.name &&
              ts.isIdentifier(member.name) &&
              member.name.text === field
            ) {
              findings.push({
                path,
                line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                kind: node.typeName.text,
                text: node.getText().replace(/\s+/g, ' ').slice(0, 90),
              });
            }
          }
        }
      }

      node.forEachChild(visit);
    };
    source.forEachChild(visit);
  }
}

if (findings.length === 0) {
  console.log(`No type-position read of \`${field}\` found. Nothing can break silently.`);
  process.exit(0);
}

console.log(
  `\n${findings.length} type-position read(s) of \`${field}\` — each one fails SILENTLY if renamed:\n`,
);
for (const finding of findings) {
  console.log(`  ${finding.path}:${finding.line}  [${finding.kind}]`);
  console.log(`      ${finding.text}`);
}
console.log('');
process.exit(1);
