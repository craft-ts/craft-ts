/**
 * Vitest setup file: records what each test exercised and hands it to the
 * behaviour-proof reporter of `@craft-ts/dev-tools/behavior-catalog` through
 * the test's `meta`. Left out of the published build: it imports vitest.
 *
 *   setupFiles: ['@craft-ts/core/behavior-proofs-setup'],
 *   reporters: ['default', behaviorProofReporter({ rootDir })],
 *
 * Under `craft mutants`, the run instead applies the mutant described by
 * `CRAFT_BEHAVIOR_MUTANT` and runs only the tests said to prove it.
 */
import { appendFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { afterEach, beforeEach, expect } from 'vitest';
import {
  ɵprovideBehaviorProofRecording,
  ɵstartBehaviorProofRecording,
  ɵstopBehaviorProofRecording,
  type ɵBehaviorProofRecording,
} from './lib/behavior-proof-recorder';
import { ɵprovideBehaviorMutant, type ɵBehaviorMutant } from './lib/behavior-mutant';
import { ɵregisterCraftTestProviders } from './lib/craft-test-providers';

declare module 'vitest' {
  interface TaskMeta {
    craftBehaviorProof?: ɵBehaviorProofRecording;
  }
}

/** Written by the mutant runner of `@craft-ts/dev-tools`. */
type MutantRun = ɵBehaviorMutant & {
  /** The app root the test files are relative to. */
  root: string;
  /** Test file → the full names (without the file) of the tests to run. */
  tests: Readonly<Record<string, readonly string[]>>;
  /** Where to note that the mutant changed an invocation. */
  appliedFile: string;
};

const mutantRun = process.env['CRAFT_BEHAVIOR_MUTANT'];

if (mutantRun) {
  const run = JSON.parse(mutantRun) as MutantRun;
  ɵregisterCraftTestProviders([
    ɵprovideBehaviorMutant(run, () => appendFileSync(run.appliedFile, '1')),
  ]);
  beforeEach(({ task, skip }) => {
    const file = relative(run.root, task.file.filepath).split(sep).join('/');
    if (!run.tests[file]?.includes(task.fullTestName ?? task.name)) skip();
  });
} else {
  ɵregisterCraftTestProviders([ɵprovideBehaviorProofRecording()]);

  beforeEach(() => {
    // An invocation no assertion came after was exercised, not observed.
    ɵstartBehaviorProofRecording({
      assertions: () => expect.getState().assertionCalls,
    });
  });

  afterEach(({ task }) => {
    task.meta.craftBehaviorProof = ɵstopBehaviorProofRecording();
  });
}
