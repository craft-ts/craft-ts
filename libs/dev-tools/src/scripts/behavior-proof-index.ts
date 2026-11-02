/**
 * The proofs of the service and template tests, kept out of git.
 *
 * The vitest setup file of `@craft-ts/core` records, for each test, the
 * fingerprint of what it exercised (each distinct invocation and its outcome)
 * into the test's `meta`. The reporter below gathers the fingerprints of the
 * tests that PASSED — a red test proves nothing — into one index per app,
 * `.craft/behavior-proofs.json`, keyed `<test file> > <full test name>`. The
 * architecture suite reads it back next to the e2e references.
 *
 * A partial run rewrites the entries of the files it ran and keeps the
 * others; reading drops the entries of test files that no longer exist. The
 * index is a build output: the architecture suite needs the unit tests to
 * have run first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Reporter, TestModule } from 'vitest/node';
import type { BehaviorTraceLike } from './behavior-proofs.ts';

export const BEHAVIOR_PROOF_INDEX = '.craft/behavior-proofs.json';

/**
 * Where the index of the base branch is looked for when no path is given:
 * CI downloads the one its last run on `main` published, as an artifact.
 */
export const BEHAVIOR_PROOF_INDEX_AT_BASE = '.craft/behavior-proofs.base.json';

type BehaviorProofIndexFile = {
  version: 1;
  tests: Record<string, BehaviorTraceLike>;
};

const SEPARATOR = ' > ';

const toPosix = (path: string) => path.split(sep).join('/');

function readIndexFile(path: string): BehaviorProofIndexFile {
  if (!existsSync(path)) return { version: 1, tests: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BehaviorProofIndexFile>;
  return { version: 1, tests: parsed.version === 1 && parsed.tests ? parsed.tests : {} };
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

/** Writes the fingerprints of the passing tests of a vitest run. */
export function behaviorProofReporter(
  options: Readonly<{ rootDir: string; outputFile?: string }>,
): Reporter {
  const outputFile = resolve(options.rootDir, options.outputFile ?? BEHAVIOR_PROOF_INDEX);
  return {
    onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
      // A mutant run (`craft mutants`) breaks the code on purpose: its
      // results prove nothing.
      if (process.env['CRAFT_BEHAVIOR_MUTANT']) return;
      const index = readIndexFile(outputFile);
      const ran = new Set<string>();
      const fresh: Record<string, BehaviorTraceLike> = {};
      for (const module of testModules) {
        const file = toPosix(relative(options.rootDir, module.moduleId));
        ran.add(file);
        for (const test of module.children.allTests()) {
          // Set by the setup file of `@craft-ts/core`, which declares the field.
          const proof = (test.meta() as { craftBehaviorProof?: BehaviorTraceLike }).craftBehaviorProof;
          if (test.result().state !== 'passed' || !proof) continue;
          fresh[`${file}${SEPARATOR}${test.fullName}`] = {
            steps: proof.steps,
            ...(proof.observedSteps === undefined ? {} : { observedSteps: proof.observedSteps }),
          };
        }
      }
      const kept = Object.entries(index.tests).filter(
        ([test]) => !ran.has(test.slice(0, test.indexOf(SEPARATOR))),
      );
      const tests = sorted({ ...Object.fromEntries(kept), ...fresh });
      mkdirSync(dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, `${JSON.stringify({ version: 1, tests }, null, 2)}\n`);
    },
  };
}

/**
 * The recorded fingerprints, keyed by test. Entries of test files that no
 * longer exist are dropped: their proofs went with them.
 */
export function readBehaviorProofIndex(
  rootDir: string,
  outputFile: string = BEHAVIOR_PROOF_INDEX,
): Record<string, BehaviorTraceLike> {
  const { tests } = readIndexFile(resolve(rootDir, outputFile));
  return sorted(
    Object.fromEntries(
      Object.entries(tests).filter(([test]) =>
        existsSync(join(rootDir, test.slice(0, test.indexOf(SEPARATOR)))),
      ),
    ),
  );
}

/**
 * The fingerprints the unit tests left on the base branch — the index its
 * last run published, at `CRAFT_BEHAVIOR_BASE_PROOFS` or
 * `.craft/behavior-proofs.base.json` — so that the ratchet tells a unit proof
 * that was lost. Unlike the current index, a test whose file is gone is kept:
 * its proofs are exactly what the comparison is looking for. `undefined` when
 * there is no such index (a local run): nothing is compared.
 */
export function readBehaviorProofIndexAtBase(
  rootDir: string,
  indexFile: string = process.env['CRAFT_BEHAVIOR_BASE_PROOFS'] ?? BEHAVIOR_PROOF_INDEX_AT_BASE,
): Record<string, BehaviorTraceLike> | undefined {
  const path = resolve(rootDir, indexFile);
  if (!existsSync(path)) return undefined;
  return sorted(readIndexFile(path).tests);
}
