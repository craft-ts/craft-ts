import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const librariesRoot = join(workspaceRoot, 'libs');
/** Identifiers that only the e-commerce demo may know. */
const DEMO_IDENTIFIERS = [/\becommerce\./, /\batelier\b/i];
const SOURCE = /\.(?:ts|mts|cts|cjs|mjs|js)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.craft', 'test-results']);

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourcesUnder(path);
    // Specs describe scenarios and may borrow the demo's vocabulary.
    return SOURCE.test(entry.name) && !/\.spec\.[cm]?[jt]s$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('library boundaries', () => {
  it('keeps the e-commerce demo out of every library source', () => {
    const offenders = sourcesUnder(librariesRoot).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return DEMO_IDENTIFIERS.some((pattern) => pattern.test(text))
        ? [relative(workspaceRoot, file)]
        : [];
    });
    expect(offenders).toEqual([]);
  });
});
