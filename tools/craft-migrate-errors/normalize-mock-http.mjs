#!/usr/bin/env node
/**
 * Fifth pass, and the narrowest: mock-http-request-for-route.spec.ts.
 *
 * That one file holds BOTH meanings of the word in a single object tree:
 *
 *   response: {
 *     kind: 'exception',
 *     _tag: 'PASSWORD_REQUIRED',   <- mirrors the craft discriminant
 *     status: 400,
 *     body: {
 *       code: 'PASSWORD_REQUIRED', <- the SERVER's own error code
 *     },
 *   }
 *
 * The tag strings are deliberately the same, so no cross-check on the literal
 * can separate them. Only the STRUCTURE can: a key nested inside `body:` is the
 * server's, anything else at the response level is craft's.
 *
 * Usage: node tools/craft-migrate-errors/normalize-mock-http.mjs <file...>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: normalize-mock-http.mjs <file...>');
  process.exit(2);
}

const KEY = /^(\s*)(code|_tag)(\s*[:;]\s*'[A-Z_][A-Z0-9_]*'.*)$/;
const BODY_OPEN = /^(\s*)body\s*[:?]?\s*:?\s*\{/;

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let bodyIndent = null;
  let changed = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const opener = BODY_OPEN.exec(line);
    if (opener) {
      bodyIndent = opener[1].length;
      continue;
    }

    const match = KEY.exec(line);
    if (match) {
      const indent = match[1].length;
      const insideBody = bodyIndent !== null && indent > bodyIndent;
      const wanted = insideBody ? 'code' : '_tag';
      if (match[2] !== wanted) {
        lines[i] = `${match[1]}${wanted}${match[3]}`;
        changed += 1;
      }
      continue;
    }

    if (bodyIndent !== null) {
      const stripped = line.trim();
      const indent = line.length - line.trimStart().length;
      if (stripped.startsWith('}') && indent <= bodyIndent) {
        bodyIndent = null;
      }
    }
  }

  writeFileSync(file, lines.join('\n'));
  console.log(`${file}: ${changed} key(s) normalised`);
}
