import { describe, expect, it, vi } from 'vitest';
import {
  classifyResumeFidelity,
  createResumeFidelityReport,
  decideResumeCall,
  executeDebugSessionResumePlan,
} from './debug-session-resume-executor';
import type { DebugSessionResumePlan } from './debug-session-resume-plan';

function plan(blocking = true): DebugSessionResumePlan {
  return {
    format: 'craft-debug-session-resume-plan',
    version: 1,
    targetElapsedMs: 10,
    status: 'ready',
    steps: [
      {
        id: 'acquire:session',
        kind: 'acquire',
        primitive: 'session',
        blocking,
      },
      {
        id: 'restore:cart',
        kind: 'restore',
        primitive: 'cart',
        blocking: true,
      },
    ],
    problems: [],
    expectedCalls: [],
    substitutions: [],
  };
}

describe('resume execution decisions', () => {
  it('allows planned calls, patches explicit overrides, and holds unknown writes', () => {
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
    ).toBe('recorded');
  });

  it('reports the least-real result and refuses blocked steps', () => {
    expect(
      classifyResumeFidelity([{ id: 'login', status: 'conformant' }]),
    ).toBe('real');
    expect(classifyResumeFidelity([{ id: 'login', status: 'recorded' }])).toBe(
      'partially-simulated',
    );
    expect(
      createResumeFidelityReport([
        { id: 'save', status: 'blocked', detail: '403 inattendu' },
      ]).classification,
    ).toBe('refused');
  });

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

  it('runs steps in order and blocks later steps after a required failure', async () => {
    const executeStep = vi.fn(async (step) => ({
      id: step.id,
      status:
        step.id === 'acquire:session'
          ? ('blocked' as const)
          : ('conformant' as const),
      detail: 'Échec de connexion',
    }));
    const cleanup = vi.fn();
    const report = await executeDebugSessionResumePlan(plan(), {
      preflight: async () => ({ status: 'passed', missing: [] }),
      executeStep,
      cleanup,
    });

    expect(executeStep).toHaveBeenCalledTimes(1);
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        id: 'restore:cart',
        status: 'blocked',
        detail: expect.stringContaining('Non tentée'),
      }),
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(report.classification).toBe('refused');
  });

  it('downgrades a lost nonblocking step to assisted fidelity', async () => {
    const report = await executeDebugSessionResumePlan(plan(false), {
      preflight: async () => ({ status: 'passed', missing: [] }),
      executeStep: async (step) => ({
        id: step.id,
        status: step.id === 'acquire:session' ? 'blocked' : 'conformant',
        detail: 'Tâche perdue',
      }),
    });

    expect(report.steps[0]).toMatchObject({ status: 'tolerated' });
    expect(report.classification).toBe('assisted');
  });

  it('does not classify a nonblocking preparation warning as execution drift', async () => {
    const report = await executeDebugSessionResumePlan(
      {
        ...plan(),
        steps: [],
        problems: [
          {
            code: 'source-hashes-unavailable',
            message: 'Code provenance is incomplete.',
            blocking: false,
          },
        ],
      },
      {
        preflight: async () => ({ status: 'passed', missing: [] }),
        executeStep: async () => ({ id: 'unused', status: 'conformant' }),
      },
    );

    expect(report.classification).toBe('real');
    expect(report.steps).toEqual([]);
  });
});
