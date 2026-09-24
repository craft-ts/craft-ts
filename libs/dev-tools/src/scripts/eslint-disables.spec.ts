import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { scanEslintDisables } from './eslint-disables';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('scanEslintDisables', () => {
  it('finds directives, preserves source, and ignores string literals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-eslint-disables-'));
    directories.push(root);
    await mkdir(join(root, 'nested'));
    await writeFile(
      join(root, 'nested', 'example.ts'),
      [
        "const label = 'eslint-disable no-warning-comments';",
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy API',
        'const value: any = input;',
        '/* eslint-disable-line no-console */ console.log(value);',
      ].join('\n'),
    );

    const result = scanEslintDisables({ rootDir: root });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      filePath: 'nested/example.ts',
      line: 2,
      highlightLine: 3,
      directive: 'disable-next-line',
      rule: '@typescript-eslint/no-explicit-any',
      reason: 'legacy API',
    });
    expect(result[1]).toMatchObject({
      line: 4,
      highlightLine: 4,
      directive: 'disable-line',
      rule: 'no-console',
    });
    expect(result[0]?.source).toContain('const value: any = input;');
  });

  it('reads comments only, keys by rule and ordinal, and keeps blanket directives', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-eslint-disables-'));
    directories.push(root);
    await writeFile(
      join(root, 'rule.spec.ts'),
      [
        "const fixture = '// eslint-disable-next-line craft-ts/no-raw-class';",
        // A bare token scan loses its place after `${` and would read this.
        'const card = (prefix) => `${prefix}// eslint-disable-next-line no-console -- in a string\\nx`;',
        '/* eslint-disable */',
        'import a from "a";',
        '// eslint-disable-next-line craft-ts/no-raw-class -- vendor widget',
        "div({ class: 'vendor' });",
        '// eslint-disable-next-line craft-ts/no-raw-class, no-console',
        "div({ class: 'other' });",
      ].join('\n'),
    );

    const result = scanEslintDisables({ rootDir: root });

    expect(result.map((entry) => entry.subject)).toEqual([
      'eslint-disable:rule.spec.ts:*:1',
      'eslint-disable:rule.spec.ts:craft-ts/no-raw-class:1',
      'eslint-disable:rule.spec.ts:craft-ts/no-raw-class:2',
      'eslint-disable:rule.spec.ts:no-console:1',
    ]);
    expect(result[1]).toMatchObject({ line: 5, reason: 'vendor widget' });
    expect(result[2]?.reason).toBeUndefined();
  });

  it('does not scan agent worktrees inside the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-eslint-disables-'));
    directories.push(root);
    await mkdir(join(root, '.claude', 'worktrees'), { recursive: true });
    await writeFile(
      join(root, '.claude', 'worktrees', 'ignored.ts'),
      '// eslint-disable-next-line no-console\nconsole.log("ignored");',
    );
    await writeFile(
      join(root, 'kept.ts'),
      '// eslint-disable-next-line no-console\nconsole.log("kept");',
    );

    const result = scanEslintDisables({ rootDir: root });

    expect(result).toHaveLength(1);
    expect(result[0]?.filePath).toBe('kept.ts');
  });
});
