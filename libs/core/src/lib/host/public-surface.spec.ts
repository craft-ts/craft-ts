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

  it('runs the core suite off a plain command, with no Angular target left', () => {
    const project = JSON.parse(readFileSync(coreProject, 'utf8')) as {
      targets: Record<string, { executor: string }>;
    };
    expect(project.targets['test'].executor).toBe('nx:run-commands');
    expect(Object.keys(project.targets)).not.toContain('test-angular');
  });

  it('does not export toCraftService or injectService from the core barrel', async () => {
    const core = await import('@craft-ts/core');
    expect('toCraftService' in core).toBe(false);
    expect('injectService' in core).toBe(false);
  });

  // The Angular exit narrowed this suite to a handful of files, which hid a
  // batch of real regressions until it was widened again. Whole directories, or
  // the guard is worthless.
  it('runs every core and component spec, with nothing carved out', () => {
    const vitestConfig = readFileSync(
      join(here, '../../../../../vitest.config.ts'),
      'utf8',
    );
    expect(vitestConfig).toContain("'libs/core/src/**/*.spec.ts'");
    expect(vitestConfig).toContain("'libs/component/src/**/*.spec.ts'");
    expect(vitestConfig).not.toMatch(/^\s*exclude:/m);
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

  it('ships no Angular peer dependency', () => {
    const pkg = JSON.parse(
      readFileSync(join(here, '../../../package.json'), 'utf8'),
    ) as { peerDependencies?: Record<string, string> };
    expect(
      Object.keys(pkg.peerDependencies ?? {}).filter((name) =>
        name.startsWith('@angular/'),
      ),
    ).toEqual([]);
  });
});
