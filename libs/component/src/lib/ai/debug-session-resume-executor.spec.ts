import { describe, expect, it, vi } from 'vitest';
import {
  classifyResumeFidelity,
  createResumeFidelityReport,
  decideResumeCall,
  executeDebugSessionResumePlan,
  ResumeTechnicalError,
  type DebugSessionResumeExecutionAdapter,
  type ResumeStepResult,
} from './debug-session-resume-executor';
import type {
  DebugSessionResumePlan,
  DebugSessionResumeStep,
} from './debug-session-resume-plan';

function plan(
  steps: readonly DebugSessionResumeStep[] = [
    {
      id: 'acquire:session',
      kind: 'acquire',
      primitive: 'session',
      resource: 'session',
      blocking: true,
    },
    {
      id: 'restore:cart',
      kind: 'restore',
      primitive: 'cart',
      resource: 'cart',
      blocking: true,
    },
  ],
): DebugSessionResumePlan {
  return {
    format: 'craft-debug-session-resume-plan',
    version: 1,
    targetElapsedMs: 10,
    status: 'ready',
    steps,
    problems: [],
    expectedCalls: [],
    substitutions: [],
  };
}

const passed: DebugSessionResumeExecutionAdapter['preflight'] = async () => ({
  status: 'passed',
  missing: [],
});

function results(
  outcomes: Readonly<Record<string, ResumeStepResult['status']>>,
): DebugSessionResumeExecutionAdapter['executeStep'] {
  return async (step) => ({
    id: step.id,
    status: outcomes[step.id] ?? 'conformant',
    detail: `${step.id} ${outcomes[step.id] ?? 'conformant'}`,
  });
}

describe('resume execution decisions', () => {
  it('lets planned calls and reads through, patches overrides, holds the rest', () => {
    const allowedCalls = new Set(['GET /account']);
    expect(decideResumeCall('GET /account', { allowedCalls })).toBe('live');
    expect(decideResumeCall('POST /checkout', { allowedCalls })).toBe('held');
    expect(
      decideResumeCall('POST /checkout', {
        allowedCalls,
        override: { call: 'POST /checkout', response: { ok: false } },
      }),
    ).toBe('live+patch');
    expect(
      decideResumeCall('GET /unknown', { allowedCalls, readOnly: true }),
    ).toBe('live');
  });

  it('refuses an undeclared call at once when nobody can answer', () => {
    expect(
      decideResumeCall('POST /checkout', {
        allowedCalls: new Set(),
        unattended: true,
      }),
    ).toBe('blocked');
  });

  it('maps each step status to its effect on the class', () => {
    const classOf = (status: ResumeStepResult['status']) =>
      classifyResumeFidelity([{ id: 'step', status }]);
    expect(classOf('conformant')).toBe('real');
    expect(classOf('drifted')).toBe('real');
    expect(classOf('skipped')).toBe('real');
    expect(classOf('overridden')).toBe('assisted');
    expect(classOf('recorded')).toBe('partially-simulated');
    expect(classOf('blocked')).toBe('refused');
    expect(
      classifyResumeFidelity(
        [{ id: 'step', status: 'conformant' }],
        [{ call: 'POST /save', response: {} }],
      ),
    ).toBe('assisted');
  });

  it('lists tolerated drifts and skipped steps as warnings', () => {
    const report = createResumeFidelityReport([
      { id: 'outcome:save', status: 'drifted', detail: '403 attendu, 200 obtenu' },
      { id: 'rearm-task:0', status: 'skipped', detail: 'Tâche perdue' },
      { id: 'refetch:me', status: 'conformant' },
    ]);
    expect(report.classification).toBe('real');
    expect(report.warnings).toEqual([
      'outcome:save · 403 attendu, 200 obtenu',
      'rearm-task:0 · Tâche perdue',
    ]);
  });
});

describe('executeDebugSessionResumePlan', () => {
  it('does not invoke any step when read-only preflight fails', async () => {
    const executeStep = vi.fn();
    const report = await executeDebugSessionResumePlan(plan(), {
      preflight: async () => ({
        status: 'failed',
        missing: [{ kind: 'product', name: 'croissant' }],
      }),
      executeStep,
    });

    expect(executeStep).not.toHaveBeenCalled();
    expect(report.classification).toBe('refused');
    expect(report.blocked[0]).toContain('croissant');
  });

  it('blocks only the dependants of a failed step', async () => {
    const executeStep = vi.fn(results({ 'acquire:session': 'blocked' }));
    const report = await executeDebugSessionResumePlan(
      plan([
        { id: 'acquire:session', kind: 'acquire', resource: 'session', blocking: true },
        {
          id: 'refetch:me',
          kind: 'refetch',
          resource: 'session',
          blocking: true,
          dependsOn: ['acquire:session'],
        },
        { id: 'restore:cart', kind: 'restore', resource: 'cart', blocking: true },
      ]),
      { preflight: passed, executeStep },
    );

    expect(executeStep.mock.calls.map(([step]) => step.id)).toEqual([
      'acquire:session',
      'restore:cart',
    ]);
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        id: 'refetch:me',
        status: 'blocked',
        detail: expect.stringContaining('Non tentée'),
      }),
    );
    expect(report.steps).toContainEqual(
      expect.objectContaining({ id: 'restore:cart', status: 'conformant' }),
    );
    expect(report.classification).toBe('refused');
  });

  it('skips a failed non-blocking step without lowering the class', async () => {
    const report = await executeDebugSessionResumePlan(
      plan([
        { id: 'rearm-task:0', kind: 'rearm-task', blocking: false },
        { id: 'restore:cart', kind: 'restore', blocking: true },
      ]),
      { preflight: passed, executeStep: results({ 'rearm-task:0': 'blocked' }) },
    );

    expect(report.steps[0]).toMatchObject({ status: 'skipped' });
    expect(report.classification).toBe('real');
    expect(report.warnings).toHaveLength(1);
  });

  it('retries a technical failure twice, after 250 ms then 1 s', async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const report = await executeDebugSessionResumePlan(
      plan([{ id: 'refetch:me', kind: 'refetch', blocking: true }]),
      {
        preflight: passed,
        sleep,
        executeStep: async (step) => {
          attempts += 1;
          if (attempts < 3) throw new ResumeTechnicalError('HTTP 503');
          return { id: step.id, status: 'conformant' };
        },
      },
    );

    expect(attempts).toBe(3);
    expect(sleep.mock.calls).toEqual([[250], [1_000]]);
    expect(report.classification).toBe('real');
  });

  it('does not retry a refusal from the server', async () => {
    let attempts = 0;
    const report = await executeDebugSessionResumePlan(
      plan([{ id: 'acquire:session', kind: 'acquire', blocking: true }]),
      {
        preflight: passed,
        sleep: async () => undefined,
        executeStep: async () => {
          attempts += 1;
          throw new Error('HTTP 401');
        },
      },
    );

    expect(attempts).toBe(1);
    expect(report.classification).toBe('refused');
  });

  it('releases successful acquisitions in reverse order when anything is blocked', async () => {
    const released: string[] = [];
    const cleanup = vi.fn();
    const report = await executeDebugSessionResumePlan(
      plan([
        { id: 'acquire:session', kind: 'acquire', resource: 'session', blocking: true },
        { id: 'acquire:cart', kind: 'acquire', resource: 'cart', blocking: true },
        { id: 'refetch:product', kind: 'refetch', resource: 'catalog', blocking: true },
      ]),
      {
        preflight: passed,
        executeStep: results({ 'refetch:product': 'blocked' }),
        releaseStep: (step) => {
          released.push(step.id);
        },
        cleanup,
      },
    );

    expect(report.classification).toBe('refused');
    expect(released).toEqual(['acquire:cart', 'acquire:session']);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps the acquisitions when the resume succeeds', async () => {
    const releaseStep = vi.fn();
    await executeDebugSessionResumePlan(plan(), {
      preflight: passed,
      executeStep: results({}),
      releaseStep,
    });
    expect(releaseStep).not.toHaveBeenCalled();
  });

  it('does not classify a nonblocking preparation warning as execution drift', async () => {
    const report = await executeDebugSessionResumePlan(
      {
        ...plan([]),
        problems: [
          {
            code: 'source-hashes-unavailable',
            message: 'Code provenance is incomplete.',
            blocking: false,
          },
        ],
      },
      { preflight: passed, executeStep: results({}) },
    );

    expect(report.classification).toBe('real');
    expect(report.steps).toEqual([]);
  });
});
