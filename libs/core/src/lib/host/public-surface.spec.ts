import { execSync } from 'node:child_process';
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

  it('keeps TestBed specs on the Angular unit-test target', () => {
    const project = JSON.parse(readFileSync(coreProject, 'utf8')) as {
      targets: { test: { executor: string }; 'test-angular': { executor: string } };
    };
    expect(project.targets.test.executor).toBe('nx:run-commands');
    expect(project.targets['test-angular'].executor).toBe(
      '@nx/angular:unit-test',
    );
  });

  it('does not export toCraftService or injectService from the core barrel', async () => {
    const core = await import('@craft-ng/core');
    expect('toCraftService' in core).toBe(false);
    expect('injectService' in core).toBe(false);
  });

  it('covers the default vitest suite beyond host and state', () => {
    const vitestConfig = readFileSync(
      join(here, '../../../vitest.config.ts'),
      'utf8',
    );
    expect(vitestConfig).toContain("include: ['src/**/*.spec.ts']");
    expect(vitestConfig).toContain('test-angular');
  });

  it(
    'typechecks that Angular DI names stay off the public index',
    { timeout: 20_000 },
    () => {
    execSync('npx tsc -p libs/core/tsconfig.public-surface.json --noEmit', {
      encoding: 'utf8',
      cwd: join(here, '../../../../../'),
    });
    },
  );

  it('declares @angular/common as a peer of @craft-ng/angular', () => {
    const pkg = JSON.parse(
      readFileSync(
        join(here, '../../../../angular/package.json'),
        'utf8',
      ),
    ) as { peerDependencies: Record<string, string> };
    expect(pkg.peerDependencies['@angular/common']).toBe('^21.0.0');
  });
});
