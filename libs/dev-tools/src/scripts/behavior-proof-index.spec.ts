/**
 * The out-of-git index of the unit tests' fingerprints: only passing tests
 * prove, a partial run keeps the files it did not run, a deleted test file
 * takes its proofs with it.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestModule } from 'vitest/node';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BEHAVIOR_PROOF_INDEX,
  behaviorProofReporter,
  readBehaviorProofIndex,
} from './behavior-proof-index.ts';

const rootDir = mkdtempSync(join(tmpdir(), 'behavior-proof-index-'));
afterAll(() => rmSync(rootDir, { recursive: true, force: true }));

const step = (key: string) => ({ key, kind: 'invocation', detail: { outcome: 'succeeded' } });

type FakeTest = { name: string; state: 'passed' | 'failed'; steps?: ReturnType<typeof step>[]; observedSteps?: number };

const testModule = (file: string, tests: FakeTest[]) =>
  ({
    moduleId: join(rootDir, file),
    children: {
      allTests: () =>
        tests.map((test) => ({
          fullName: test.name,
          meta: () =>
            test.steps ? { craftBehaviorProof: { steps: test.steps, observedSteps: test.observedSteps } } : {},
          result: () => ({ state: test.state }),
        })),
    },
  }) as unknown as TestModule;

const run = (...modules: TestModule[]) =>
  behaviorProofReporter({ rootDir }).onTestRunEnd?.(modules, [], 'passed');

for (const file of ['src/cart.spec.ts', 'src/session.spec.ts']) {
  mkdirSync(join(rootDir, 'src'), { recursive: true });
  writeFileSync(join(rootDir, file), '');
}

describe('behaviorProofReporter', () => {
  it('keeps the passing tests only, keyed by file and full name', async () => {
    await run(
      testModule('src/cart.spec.ts', [
        { name: 'cart > adds', state: 'passed', steps: [step('invocation:service:cart / method:add')], observedSteps: 1 },
        { name: 'cart > breaks', state: 'failed', steps: [step('invocation:service:cart / method:clear')] },
      ]),
    );
    expect(readBehaviorProofIndex(rootDir)).toEqual({
      'src/cart.spec.ts > cart > adds': { steps: [step('invocation:service:cart / method:add')], observedSteps: 1 },
    });
  });

  it('rewrites the files a run covered and keeps the others', async () => {
    await run(testModule('src/session.spec.ts', [{ name: 'signs in', state: 'passed', steps: [] }]));
    await run(testModule('src/cart.spec.ts', [{ name: 'cart > empties', state: 'passed', steps: [] }]));
    expect(Object.keys(readBehaviorProofIndex(rootDir))).toEqual([
      'src/cart.spec.ts > cart > empties',
      'src/session.spec.ts > signs in',
    ]);
    expect(readFileSync(join(rootDir, BEHAVIOR_PROOF_INDEX), 'utf8')).toMatch(/\n$/);
  });

  it('forgets the proofs of a deleted test file', () => {
    rmSync(join(rootDir, 'src/session.spec.ts'));
    expect(Object.keys(readBehaviorProofIndex(rootDir))).toEqual(['src/cart.spec.ts > cart > empties']);
  });
});
