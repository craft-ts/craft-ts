/**
 * The `test` subject: a test suite, attested like anything else.
 *
 * The point of running the registry against tests first is that it needs no
 * browser, no determinism harness and no pixels — so the mechanism can be
 * proven before anything visual depends on it. It also produces, for free, the
 * one category no test runner reports:
 *
 *   **green, although the code under it moved.**
 *
 * Every runner tells you what turned red. None tells you that a test which
 * passed yesterday and passes today is now exercising different code. That is
 * `renewed` applied to a test, and it is the whole reason this adapter exists.
 *
 * The adapter stays free of any runner: a test is a name, a file and an
 * outcome, and the fingerprint is handed in by whoever owns the code graph.
 */
import { evidenceHashOf } from '../evidence-store.js';
import type { SubjectObservation } from '../attestation.js';

export type TestStatus = 'passed' | 'failed' | 'skipped';

export interface TestCase {
  /** Repository-relative. */
  readonly file: string;
  /** `describe > describe > it`, exactly as the runner nests it. */
  readonly fullName: string;
  readonly status: TestStatus;
  /** Failure message, normalised by the caller if it carries timings. */
  readonly message?: string;
}

export interface TestRun {
  readonly cases: readonly TestCase[];
}

/** `test:<file>#<full name>`. Stable under a file being reordered. */
export const testSubjectId = (testCase: Pick<TestCase, 'file' | 'fullName'>): string =>
  `test:${testCase.file}#${testCase.fullName}`;

/**
 * What a test *produced*, hashed.
 *
 * The message is part of the evidence: a test that goes from one failure to a
 * different failure has changed its output, and treating both as "red" would
 * carry a judgement across two unrelated defects.
 */
export const testEvidence = (testCase: TestCase): string =>
  evidenceHashOf({ status: testCase.status, message: testCase.message ?? null });

export interface TestFingerprints {
  /** Merkle of the test body's slice, unioned with the code under test. */
  (testCase: TestCase): string;
}

export function observeTests(
  run: TestRun,
  fingerprintOf: TestFingerprints,
): readonly SubjectObservation[] {
  return run.cases
    .map((testCase) => ({
      subject: testSubjectId(testCase),
      kind: 'test' as const,
      fingerprint: fingerprintOf(testCase),
      evidence: testEvidence(testCase),
      assumptions: [],
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
}

export interface TestRunDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Same test, different outcome. */
  readonly changed: readonly string[];
  /**
   * Passing before and after, over code that moved.
   *
   * Not a failure and not nothing: it is the set of tests whose green light
   * now means something different from what it meant when someone last read
   * it. Nothing else in a test report says this.
   */
  readonly greenOverMovedCode: readonly string[];
  readonly red: readonly string[];
}

/**
 * The five categories, from two runs and the fingerprints that produced them.
 *
 * `fingerprints` is indexed by subject and holds the *code* fingerprint of each
 * run — the fourth category cannot be computed from outcomes alone, which is
 * precisely why every runner is missing it.
 */
export function diffTestRuns(
  before: TestRun,
  after: TestRun,
  fingerprints: {
    readonly before: Readonly<Record<string, string>>;
    readonly after: Readonly<Record<string, string>>;
  } = { before: {}, after: {} },
): TestRunDiff {
  const index = (run: TestRun) =>
    new Map(run.cases.map((testCase) => [testSubjectId(testCase), testCase]));
  const left = index(before);
  const right = index(after);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const greenOverMovedCode: string[] = [];
  const red: string[] = [];

  for (const [subject, testCase] of right) {
    if (testCase.status === 'failed') red.push(subject);
    const previous = left.get(subject);
    if (!previous) {
      added.push(subject);
      continue;
    }
    if (testEvidence(previous) !== testEvidence(testCase)) {
      changed.push(subject);
      continue;
    }
    if (
      testCase.status === 'passed' &&
      fingerprints.before[subject] !== undefined &&
      fingerprints.after[subject] !== undefined &&
      fingerprints.before[subject] !== fingerprints.after[subject]
    ) {
      greenOverMovedCode.push(subject);
    }
  }
  for (const subject of left.keys()) {
    if (!right.has(subject)) removed.push(subject);
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    greenOverMovedCode: greenOverMovedCode.sort(),
    red: red.sort(),
  };
}

/* ------------------------------------------------------------------------ *
 * Reading a runner's report
 * ------------------------------------------------------------------------ */

interface VitestAssertion {
  readonly fullName?: string;
  readonly title?: string;
  readonly status?: string;
  readonly failureMessages?: readonly string[];
}

interface VitestFile {
  readonly name?: string;
  readonly assertionResults?: readonly VitestAssertion[];
}

/**
 * Vitest' `--reporter=json` output, turned into an inventory.
 *
 * Read from the report rather than parsed out of the source: a report lists
 * skipped and dynamically generated tests, which a `describe`/`it` scan
 * silently misses — and a subject that silently disappears is a subject nobody
 * is ever asked about again.
 */
export function parseVitestReport(
  report: unknown,
  options: { readonly rootDir?: string } = {},
): TestRun {
  const files = (report as { testResults?: readonly VitestFile[] } | null)
    ?.testResults;
  if (!Array.isArray(files)) return { cases: [] };

  const relative = (path: string): string => {
    const root = options.rootDir;
    const normalised = path.split('\\').join('/');
    if (!root) return normalised;
    const prefix = root.split('\\').join('/').replace(/\/$/, '');
    return normalised.startsWith(`${prefix}/`)
      ? normalised.slice(prefix.length + 1)
      : normalised;
  };

  const cases: TestCase[] = [];
  for (const file of files) {
    for (const assertion of file.assertionResults ?? []) {
      const status: TestStatus =
        assertion.status === 'failed'
          ? 'failed'
          : assertion.status === 'passed'
            ? 'passed'
            : 'skipped';
      const message = assertion.failureMessages?.join('\n');
      cases.push({
        file: relative(file.name ?? ''),
        fullName: assertion.fullName ?? assertion.title ?? '(unnamed)',
        status,
        // A failure message carries timings and absolute paths that differ on
        // every machine. Only its first line is evidence; the rest is noise
        // that would put a subject in the queue for having been run elsewhere.
        ...(message ? { message: message.split('\n')[0] } : {}),
      });
    }
  }
  return {
    cases: cases.sort((left, right) =>
      testSubjectId(left).localeCompare(testSubjectId(right)),
    ),
  };
}
