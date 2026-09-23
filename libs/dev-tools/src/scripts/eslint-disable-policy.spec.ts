import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  effectiveForbiddenEslintRules,
  parseEslintDisablePolicy,
  readEslintDisablePolicy,
  writeEslintDisablePolicy,
} from './eslint-disable-policy';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('eslint disable policy', () => {
  it('normalises, deduplicates, and sorts protected rules', () => {
    expect(
      parseEslintDisablePolicy({
        forbiddenRules: [' z/rule ', 'a/rule', 'z/rule'],
      }),
    ).toEqual({
      forbiddenRules: ['a/rule', 'z/rule'],
      forbidAll: false,
      allowedRules: [],
      appliedRules: [],
    });
  });

  it('round-trips the project policy file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-eslint-policy-'));
    directories.push(root);

    await writeEslintDisablePolicy({
      rootDir: root,
      policy: { forbiddenRules: ['craft-ts/no-throw'] },
    });

    expect(await readEslintDisablePolicy({ rootDir: root })).toEqual({
      forbiddenRules: ['craft-ts/no-throw'],
      forbidAll: false,
      allowedRules: [],
      appliedRules: [],
    });
    expect(await readFile(join(root, '.craft/eslint-disable-policy.json'), 'utf8'))
      .toContain('craft-ts/no-throw');
  });

  it('returns an empty policy when no file exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-eslint-policy-'));
    directories.push(root);
    await expect(readEslintDisablePolicy({ rootDir: root })).resolves.toEqual({
      forbiddenRules: [],
      forbidAll: false,
      allowedRules: [],
      appliedRules: [],
    });
  });

  it('computes protected rules for the protect-all mode', () => {
    expect(
      effectiveForbiddenEslintRules({
        forbiddenRules: [],
        forbidAll: true,
        appliedRules: ['no-alert', 'no-console'],
        allowedRules: ['no-console'],
      }),
    ).toEqual(['no-alert']);
  });
});
