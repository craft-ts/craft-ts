import { describe, expect, it } from 'vitest';
import {
  debugSessionResumeResourcesMap,
  debugSessionResumeResourcesRecord,
  normalizeDebugSessionResumeResource,
} from './debug-session-resume-resources';

describe('debug session resume resource bridge data', () => {
  it('round trips bounded JSON resources through a plain record', () => {
    const source = new Map<string, unknown>([
      ['auth.session', { token: 'secret', user: { role: 'admin' } }],
      ['cart', { id: 'server-cart-1', lines: [] }],
    ]);

    const record = debugSessionResumeResourcesRecord(source);

    expect(debugSessionResumeResourcesMap(record)).toEqual(source);
  });

  it('rejects values that cannot safely cross the live bridge', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(
      normalizeDebugSessionResumeResource({ resource: 'auth', value: cyclic }),
    ).toBeUndefined();
    expect(
      normalizeDebugSessionResumeResource({
        resource: 'auth',
        value: { token: 'x'.repeat(64 * 1024) },
      }),
    ).toBeUndefined();
    expect(
      normalizeDebugSessionResumeResource({
        resource: 'auth',
        value: { token: 'é'.repeat(40 * 1024) },
      }),
    ).toBeUndefined();
    expect(
      normalizeDebugSessionResumeResource({
        resource: 'auth',
        value: () => 'not data',
      }),
    ).toBeUndefined();
  });
});
