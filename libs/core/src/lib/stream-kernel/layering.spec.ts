import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

function productionSources(root: string): string[] {
  const absolute = join(workspaceRoot, root);
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'node_modules') walk(path);
      } else if (
        path.endsWith('.ts') &&
        !path.endsWith('.spec.ts') &&
        !path.endsWith('.prototype.ts')
      ) {
        files.push(path);
      }
    }
  };
  try {
    walk(absolute);
  } catch {
    // The root may not exist yet (a lib that is not scaffolded).
  }
  return files;
}

function offenders(roots: string[], pattern: RegExp): string[] {
  return roots
    .flatMap(productionSources)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(workspaceRoot, file));
}

describe('stream layering', () => {
  it('finds the production sources it is meant to police', () => {
    expect(productionSources('libs/core/src').length).toBeGreaterThan(50);
    expect(productionSources('libs/stream/src').length).toBeGreaterThan(0);
  });

  it('keeps rxjs out of production sources (core, component, stream)', () => {
    expect(
      offenders(
        ['libs/core/src', 'libs/component/src', 'libs/stream/src'],
        /from\s+['"]rxjs/,
      ),
    ).toEqual([]);
  });

  it('never imports @craft-ts/stream from core (stream depends on core, not the reverse)', () => {
    expect(offenders(['libs/core/src'], /['"]@craft-ts\/stream['"/]/)).toEqual(
      [],
    );
  });

  it('keeps the core stream kernel free of operators', () => {
    expect(
      offenders(
        ['libs/core/src/lib/stream-kernel'],
        /\b(switchMap|mergeMap|concatMap|combineLatest|debounceTime)\b/,
      ),
    ).toEqual([]);
  });
});
