import { describe, expect, it } from 'vitest';
import {
  diffTestRuns,
  observeTests,
  parseVitestReport,
  testSubjectId,
  type TestRun,
} from './test.js';

const run = (
  ...cases: readonly [string, 'passed' | 'failed' | 'skipped', string?][]
): TestRun => ({
  cases: cases.map(([fullName, status, message]) => ({
    file: 'libs/core/src/lib/state.spec.ts',
    fullName,
    status,
    ...(message ? { message } : {}),
  })),
});

describe('diffTestRuns', () => {
  it('separates the five categories', () => {
    const before = run(
      ['kept green', 'passed'],
      ['went red', 'passed'],
      ['removed', 'passed'],
      ['moved under', 'passed'],
    );
    const after = run(
      ['kept green', 'passed'],
      ['went red', 'failed', 'expected 1 to be 2'],
      ['added', 'passed'],
      ['moved under', 'passed'],
    );

    const subject = (name: string) =>
      testSubjectId({ file: 'libs/core/src/lib/state.spec.ts', fullName: name });

    const diff = diffTestRuns(before, after, {
      before: { [subject('moved under')]: 'code-1' },
      after: { [subject('moved under')]: 'code-2' },
    });

    expect(diff.added).toEqual([subject('added')]);
    expect(diff.removed).toEqual([subject('removed')]);
    expect(diff.changed).toEqual([subject('went red')]);
    expect(diff.red).toEqual([subject('went red')]);
    // The category no runner reports: still green, over code that moved.
    expect(diff.greenOverMovedCode).toEqual([subject('moved under')]);
  });

  it('does not call a test green-over-moved-code when the code held still', () => {
    const both = run(['stable', 'passed']);
    const subject = testSubjectId({
      file: 'libs/core/src/lib/state.spec.ts',
      fullName: 'stable',
    });
    const diff = diffTestRuns(both, both, {
      before: { [subject]: 'code-1' },
      after: { [subject]: 'code-1' },
    });
    expect(diff.greenOverMovedCode).toEqual([]);
  });

  it('treats two different failures as a changed outcome', () => {
    const before = run(['red', 'failed', 'expected 1 to be 2']);
    const after = run(['red', 'failed', 'expected 1 to be 3']);
    expect(diffTestRuns(before, after).changed).toHaveLength(1);
  });
});

describe('observeTests', () => {
  it('produces one sorted observation per test', () => {
    const observations = observeTests(
      run(['b', 'passed'], ['a', 'passed']),
      () => 'code-1',
    );
    expect(observations.map((observation) => observation.subject)).toEqual([
      'test:libs/core/src/lib/state.spec.ts#a',
      'test:libs/core/src/lib/state.spec.ts#b',
    ]);
    expect(observations[0]?.kind).toBe('test');
  });

  it('gives two tests with the same outcome the same evidence', () => {
    const [first, second] = observeTests(
      run(['a', 'passed'], ['b', 'passed']),
      () => 'code-1',
    );
    expect(first?.evidence).toBe(second?.evidence);
  });
});

describe('parseVitestReport', () => {
  it('reads the inventory, skipped tests included', () => {
    const parsed = parseVitestReport(
      {
        testResults: [
          {
            name: '/repo/libs/core/src/lib/state.spec.ts',
            assertionResults: [
              { fullName: 'state > counts', status: 'passed' },
              { fullName: 'state > skipped', status: 'pending' },
              {
                fullName: 'state > fails',
                status: 'failed',
                failureMessages: ['AssertionError: nope\n    at line 3'],
              },
            ],
          },
        ],
      },
      { rootDir: '/repo' },
    );

    expect(parsed.cases).toEqual([
      {
        file: 'libs/core/src/lib/state.spec.ts',
        fullName: 'state > counts',
        status: 'passed',
      },
      {
        file: 'libs/core/src/lib/state.spec.ts',
        fullName: 'state > fails',
        status: 'failed',
        message: 'AssertionError: nope',
      },
      {
        file: 'libs/core/src/lib/state.spec.ts',
        fullName: 'state > skipped',
        status: 'skipped',
      },
    ]);
  });

  it('keeps only the first line of a failure message', () => {
    // A stack trace carries absolute paths and timings; keeping it would put a
    // subject in the queue for having been run on another machine.
    const parsed = parseVitestReport({
      testResults: [
        {
          name: 'a.spec.ts',
          assertionResults: [
            {
              fullName: 'x',
              status: 'failed',
              failureMessages: ['boom\n  at /Users/someone/repo/a.spec.ts:3'],
            },
          ],
        },
      ],
    });
    expect(parsed.cases[0]?.message).toBe('boom');
  });

  it('returns nothing rather than throwing on a report it does not recognise', () => {
    expect(parseVitestReport(null).cases).toEqual([]);
    expect(parseVitestReport({ nope: true }).cases).toEqual([]);
  });
});
