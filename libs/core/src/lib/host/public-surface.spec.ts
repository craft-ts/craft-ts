import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreIndex = join(here, '../../index.ts');
const coreSrc = join(here, '../..');
const componentSrc = join(here, '../../../../component/src');
const coreProject = join(here, '../../../project.json');
const componentTypes = join(componentSrc, 'lib/types.ts');
const angularTypeImportSources = [
  componentTypes,
  join(componentSrc, 'lib/render/vnode.ts'),
];
const productionDecorator = /^\s*@(?:Component|Directive|Injectable)\(/m;

function listProductionTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listProductionTs(fullPath);
    }
    if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.fixture.ts')
    ) {
      return [fullPath];
    }
    return [];
  });
}

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

  it('keeps Angular decorators out of core and component production sources', () => {
    const decorated = [
      ...listProductionTs(coreSrc),
      ...listProductionTs(componentSrc),
    ]
      .filter((file) => productionDecorator.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(file.indexOf('/libs/')));
    expect(decorated).toEqual([]);
  });

  it('keeps the default Nx test target on Angular unit-test so TestBed specs boot', () => {
    const project = JSON.parse(readFileSync(coreProject, 'utf8')) as {
      targets: { test: { executor: string } };
    };
    expect(project.targets.test.executor).toBe('@nx/angular:unit-test');
  });
});
