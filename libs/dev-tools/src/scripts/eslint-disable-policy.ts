import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_ESLINT_DISABLE_POLICY_FILE =
  '.craft/eslint-disable-policy.json';

export interface EslintDisablePolicy {
  readonly forbiddenRules: readonly string[];
  /** Protect every rule in `appliedRules`, except `allowedRules`. */
  readonly forbidAll?: boolean;
  readonly allowedRules?: readonly string[];
  /** Rules currently resolved from the project's ESLint configuration. */
  readonly appliedRules?: readonly string[];
}

const emptyPolicy = (): EslintDisablePolicy => ({
  forbiddenRules: [],
  forbidAll: false,
  allowedRules: [],
  appliedRules: [],
});

const normaliseRules = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('forbiddenRules must be an array of rule names.');
  }
  const rules = value
    .map((rule) => {
      if (typeof rule !== 'string' || rule.trim().length === 0) {
        throw new TypeError('forbiddenRules must contain non-empty strings.');
      }
      return rule.trim();
    })
    .filter((rule, index, all) => all.indexOf(rule) === index)
    .sort((left, right) => left.localeCompare(right));
  return rules;
};

export function parseEslintDisablePolicy(value: unknown): EslintDisablePolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('the policy root must be an object.');
  }
  const record = value as {
    forbiddenRules?: unknown;
    forbidAll?: unknown;
    allowedRules?: unknown;
    appliedRules?: unknown;
  };
  if (record.forbidAll !== undefined && typeof record.forbidAll !== 'boolean') {
    throw new TypeError('forbidAll must be a boolean.');
  }
  return {
    forbiddenRules: normaliseRules(record.forbiddenRules ?? []),
    forbidAll: record.forbidAll ?? false,
    allowedRules: normaliseRules(record.allowedRules ?? []),
    appliedRules: normaliseRules(record.appliedRules ?? []),
  };
}

export function effectiveForbiddenEslintRules(
  policy: EslintDisablePolicy,
): readonly string[] {
  if (!policy.forbidAll) return policy.forbiddenRules;
  const allowed = new Set(policy.allowedRules ?? []);
  return (policy.appliedRules ?? [])
    .filter((rule) => !allowed.has(rule))
    .sort((left, right) => left.localeCompare(right));
}

export function eslintDisablePolicyPath(
  rootDir: string,
  file = DEFAULT_ESLINT_DISABLE_POLICY_FILE,
): string {
  return resolve(rootDir, file);
}

export function readEslintDisablePolicySync(options: {
  readonly rootDir: string;
  readonly file?: string;
}): EslintDisablePolicy {
  const file = eslintDisablePolicyPath(options.rootDir, options.file);
  if (!existsSync(file)) return emptyPolicy();
  try {
    return parseEslintDisablePolicy(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    throw new Error(
      `eslint-disable-policy: could not load '${file}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function readEslintDisablePolicy(options: {
  readonly rootDir: string;
  readonly file?: string;
}): Promise<EslintDisablePolicy> {
  const file = eslintDisablePolicyPath(options.rootDir, options.file);
  try {
    return parseEslintDisablePolicy(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyPolicy();
    }
    throw new Error(
      `eslint-disable-policy: could not load '${file}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function writeEslintDisablePolicy(options: {
  readonly rootDir: string;
  readonly file?: string;
  readonly policy: EslintDisablePolicy;
}): Promise<EslintDisablePolicy> {
  const policy = parseEslintDisablePolicy(options.policy);
  const file = eslintDisablePolicyPath(options.rootDir, options.file);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        forbiddenRules: policy.forbiddenRules,
        forbidAll: policy.forbidAll ?? false,
        allowedRules: policy.allowedRules ?? [],
        appliedRules: policy.appliedRules ?? [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return policy;
}
