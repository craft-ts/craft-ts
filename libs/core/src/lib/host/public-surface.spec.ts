import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const coreIndex = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../index.ts',
);
const componentTypes = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../component/src/lib/types.ts',
);
const angularTypeImportSources = [
  componentTypes,
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

  it('models readonly host signals without requiring set', () => {
    const source = readFileSync(componentTypes, 'utf8');
    expect(source).not.toMatch(/type HostSignal<[\s\S]{0,120}\bset\s*\(/);
  });

  it.each(angularTypeImportSources)(
    'does not expose Angular types from %s',
    (sourcePath) => {
      const source = readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(/from ['"]@angular\//);
    },
  );
});
