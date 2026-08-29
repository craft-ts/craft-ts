import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSecurityCheck } from './security-check';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-security-check-'));
  temporaryDirectories.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

const DYNAMIC_CODE = 'export const run = (source: string) => eval(source);\n';

describe('runSecurityCheck', () => {
  it('reports dynamic code evaluation in application sources', async () => {
    const rootDir = await fixture({ 'src/app.ts': DYNAMIC_CODE });

    const { diagnostics } = runSecurityCheck({ rootDir });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'CRAFT_SECURITY_DYNAMIC_CODE',
    );
  });

  it('never scans the .references subtree of third-party sources', async () => {
    const rootDir = await fixture({
      'src/app.ts': 'export const safe = true;\n',
      '.references/effect-ts/packages/effect/src/Persistence.ts': DYNAMIC_CODE,
    });

    const { passed, diagnostics } = runSecurityCheck({ rootDir });

    expect(diagnostics).toEqual([]);
    expect(passed).toBe(true);
  });
});
