import { describe, expect, it } from 'vitest';
import { normalizeSessionTrace } from './debug-session-trace';
import { compareSessionTraces, renderSessionTraceComparison } from './debug-session-trace-compare';

const session = (events: Readonly<Record<string, unknown>>[]) => ({ events });

describe('normalizeSessionTrace', () => {
  it('normalizes route queries and generated numeric path segments', () => {
    const trace = normalizeSessionTrace(session([
      { id: 'a', kind: 'navigation', sequence: 1, timestamp: 1_000, payload: { url: '/orders/12345678?b=1&a=2' } },
    ]));
    expect(trace.steps[0]).toMatchObject({ key: 'route:/orders/:n', detail: { queryKeys: ['a', 'b'] } });
    expect(trace.hash).toHaveLength(64);
  });

  it('uses a portable SHA-256 digest for an empty trace', () => {
    expect(normalizeSessionTrace(session([])).hash).toBe('4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  });
});

describe('compareSessionTraces', () => {
  it('finds changed invariants and reports one-reference limitations', () => {
    const expected = normalizeSessionTrace(session([{ id: 'a', kind: 'http', sequence: 1, timestamp: 0, payload: { method: 'GET', url: '/cart', status: 200 } }]));
    const observed = normalizeSessionTrace(session([{ id: 'b', kind: 'http', sequence: 1, timestamp: 0, payload: { method: 'GET', url: '/cart', status: 500 } }]));
    const result = compareSessionTraces(observed, [expected]);
    expect(result.firstDivergence?.kind).toBe('changed-invariant');
    expect(renderSessionTraceComparison(result, { testId: 'cart', project: 'chromium' })).toContain('Une seule référence');
  });

  it('reports a step that is consistently slower than green references', () => {
    const baseline = normalizeSessionTrace(session([{ id: 'a', kind: 'http', sequence: 1, timestamp: 1_000, globalElapsedMs: 100, payload: { method: 'GET', url: '/cart', status: 200 } }]));
    const observed = normalizeSessionTrace(session([{ id: 'b', kind: 'http', sequence: 1, timestamp: 1_000, globalElapsedMs: 900, payload: { method: 'GET', url: '/cart', status: 200 } }]));
    expect(compareSessionTraces(observed, [baseline]).findings).toContainEqual(expect.objectContaining({ kind: 'timing', observedMs: 900 }));
  });
});
