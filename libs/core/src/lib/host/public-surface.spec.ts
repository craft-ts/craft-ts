import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const coreIndex = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../index.ts',
);
const angularTypeImportSources = [
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../component/src/lib/types.ts',
  ),
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../component/src/lib/render/vnode.ts',
  ),
];

describe('public surface', () => {
  it('does not mention @angular in the package index', () => {
    const source = readFileSync(coreIndex, 'utf8');
    expect(source).not.toMatch(/@angular\//);
  });

  it('does not expose Angular Signal through SignalSource', () => {
    const signalSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../signal-source.ts'),
      'utf8',
    );
    expect(signalSource).not.toMatch(
      /export type SignalSource<[^>]+>\s*=\s*Signal</,
    );
  });

  it.each(angularTypeImportSources)(
    'does not expose Angular types from %s',
    (sourcePath) => {
      const source = readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(/from ['"]@angular\//);
    },
  );
});
