import { appendFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';

/**
 * An end-to-end mutant run: the behaviour an obligation names, broken in the
 * page, and only the tests whose reference proves it run. The runner of
 * `@craft-ts/dev-tools` (`craft mutants --e2e`) sets `CRAFT_BEHAVIOR_MUTANT`.
 *
 * The page applies the mutant itself (`provideCraftDevTools` of
 * `@craft-ts/core` reads it at start) and calls the binding each time it did;
 * a test that failed after that killed it, one that never got there did not
 * reach it. Keep the two names in step with core's `behavior-mutant.ts`.
 */
export const BEHAVIOR_MUTANT_PAGE_GLOBAL = '__craftBehaviorMutant';
export const BEHAVIOR_MUTANT_APPLIED_BINDING = '__craftBehaviorMutantApplied';

export type E2eBehaviorMutantRun = Readonly<{
  keys: readonly string[];
  mode: 'skip' | 'succeed';
  /** Project → the craftSession ids of the tests to run; the others skip. */
  tests: Readonly<Record<string, readonly string[]>>;
  /** A line per test the mutant reached is appended here. */
  appliedFile: string;
}>;

export function readE2eBehaviorMutant(
  env: Readonly<Record<string, string | undefined>>,
): E2eBehaviorMutantRun | undefined {
  const raw = env['CRAFT_BEHAVIOR_MUTANT'];
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as Partial<E2eBehaviorMutantRun>;
  if (!Array.isArray(parsed.keys) || !parsed.tests || typeof parsed.appliedFile !== 'string')
    throw new Error('CRAFT_BEHAVIOR_MUTANT : keys, tests et appliedFile sont requis.');
  return { keys: parsed.keys, mode: parsed.mode === 'succeed' ? 'succeed' : 'skip', tests: parsed.tests, appliedFile: parsed.appliedFile };
}

export function runsUnderMutant(run: E2eBehaviorMutantRun, project: string, testId: string): boolean {
  return run.tests[project]?.includes(testId) === true;
}

/** Every page of `context` gets the mutant, and reports applying it. */
export async function applyE2eBehaviorMutant(context: BrowserContext, run: E2eBehaviorMutantRun, test: string): Promise<void> {
  await context.addInitScript(({ name, mutant }) => {
    (globalThis as Record<string, unknown>)[name] = mutant;
  }, { name: BEHAVIOR_MUTANT_PAGE_GLOBAL, mutant: { keys: run.keys, mode: run.mode } });
  let reported = false;
  await context.exposeBinding(BEHAVIOR_MUTANT_APPLIED_BINDING, () => {
    if (reported) return;
    reported = true;
    appendFileSync(run.appliedFile, `${test}\n`);
  });
}
