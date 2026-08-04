import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runComponentsMigration } from './migrate-components';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('components migration', () => {
  it('migrates the legacy component factory, adds its name, and is idempotent', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'card.ts': `
        import { component } from '@craft-ng/component';
        export const Card = component({}, () => ({}), () => []);
      `,
    });

    const first = await runComponentsMigration({
      rootDir: root,
      write: true,
      log: () => undefined,
    });
    const output = await readFile(join(root, 'card.ts'), 'utf8');

    expect(first.diagnostics).toEqual([]);
    expect(first.changedFiles).toContain(join(root, 'card.ts'));
    expect(output).toContain(
      "import { craftComponent } from '@craft-ng/component'",
    );
    expect(output).toContain(
      "craftComponent('Card', {}, () => ({}), () => [])",
    );

    const second = await runComponentsMigration({
      rootDir: root,
      write: true,
      log: () => undefined,
    });
    expect(second.changedFiles).toEqual([]);
    expect(second.diagnostics).toEqual([]);
  });

  it('reports when a component name cannot be inferred', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'inline.ts': `
        import { component } from '@craft-ng/component';
        export function createValue() {
          return component({}, () => ({}), () => []);
        }
      `,
    });

    const result = await runComponentsMigration({
      rootDir: root,
      write: true,
      failOnManual: true,
      log: () => undefined,
    });
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics[0]?.code).toBe('NAME_NOT_DEDUCIBLE');
  });

  it('fails check mode when legacy code is present and the migration is not written', async () => {
    const root = await fixture({
      'tsconfig.json': '{}',
      'legacy.ts': `
        import { component } from '@craft-ng/component';
        export const Legacy = component({}, () => ({}), () => []);
      `,
    });

    const result = await runComponentsMigration({
      rootDir: root,
      check: true,
      write: false,
      log: () => undefined,
    });
    expect(result.exitCode).toBe(1);
    expect(result.remainingLegacyComponents).toBe(1);
  });
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-components-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}
