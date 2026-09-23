import { ESLint } from 'eslint';
import { resolve } from 'node:path';

import { sourceFilesUnder } from './eslint-disables.js';

const severityOf = (value: unknown): number | string | undefined => {
  if (Array.isArray(value)) return severityOf(value[0]);
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
};

/**
 * Resolves the rules that are enabled by the project's ESLint configuration.
 * The result is the inventory shown by Review Attest, so the policy editor can
 * protect rules without asking the reviewer to remember their exact names.
 */
export async function listAppliedEslintRules(options: {
  readonly rootDir: string;
  readonly files?: readonly string[];
}): Promise<readonly string[]> {
  const rootDir = resolve(options.rootDir);
  const eslint = new ESLint({
    cwd: rootDir,
    errorOnUnmatchedPattern: false,
  });
  const rules = new Set<string>();
  for (const file of options.files ?? sourceFilesUnder(rootDir)) {
    const config = await eslint.calculateConfigForFile(resolve(rootDir, file));
    for (const [name, setting] of Object.entries(config?.rules ?? {})) {
      const severity = severityOf(setting);
      if (severity === 0 || severity === 'off') continue;
      rules.add(name);
    }
  }
  return [...rules].sort((left, right) => left.localeCompare(right));
}
