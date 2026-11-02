import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BEHAVIOR_COVERAGE_FILE,
  behaviorCoverageWithObservations,
  readBehaviorCoverage,
  type BehaviorCoverageEntry,
  type SessionSteps,
} from './behavior-coverage.js';

const unproven = (id: string, match: BehaviorCoverageEntry['match']): BehaviorCoverageEntry => ({
  id,
  kind: 'method',
  status: 'unproven',
  provenBy: [],
  ...(match ? { match } : {}),
});

const session = (id: string, createdAt: string, steps: SessionSteps['steps']): SessionSteps => ({
  id,
  createdAt,
  steps,
});

describe('behaviour coverage', () => {
  it('shows each unproven behaviour in the latest sessions that ran it', () => {
    const [app] = behaviorCoverageWithObservations(
      [
        {
          app: 'shop',
          behaviors: [
            unproven('method:cart.add', { step: 'invocation', outcome: 'succeeded', target: 'cart.add' }),
            unproven('http-exception:POST /orders#OutOfStock', {
              step: 'invocation',
              outcome: 'failed',
              exception: 'OutOfStock',
            }),
            unproven('route:shop:cart', { step: 'route', path: 'cart' }),
            { ...unproven('method:cart.clear', { step: 'invocation', outcome: 'succeeded', target: 'cart.clear' }), status: 'proven', provenBy: ['cart.spec.ts > clears'] },
          ],
        },
      ],
      [
        session('older', '2026-11-01T10:00:00.000Z', [
          { key: 'invocation:service:cart / method:add', kind: 'invocation', detail: { outcome: 'succeeded', behavior: 'cart.add' }, eventId: 'e1' },
          { key: 'invocation:service:cart / method:clear', kind: 'invocation', detail: { outcome: 'succeeded', behavior: 'cart.clear' }, eventId: 'e2' },
        ]),
        session('newer', '2026-11-02T10:00:00.000Z', [
          { key: 'route-activation:cart', kind: 'route', detail: { outcome: 'activated' }, eventId: 'e7' },
          // A nested primitive is owned by the nearest service before it.
          { key: 'invocation:service:cart / state:lines / method:add', kind: 'invocation', detail: { outcome: 'failed', exception: 'OutOfStock', behavior: 'cart.add' }, eventId: 'e9' },
          { key: 'invocation:service:cart / method:add', kind: 'invocation', detail: { outcome: 'succeeded', behavior: 'cart.add' }, eventId: 'e8' },
        ]),
      ],
    );

    expect(Object.fromEntries(app?.behaviors.map((behavior) => [behavior.id, behavior.observations]) ?? [])).toEqual({
      'method:cart.add': [
        { sessionId: 'newer', createdAt: '2026-11-02T10:00:00.000Z', eventId: 'e8' },
        { sessionId: 'older', createdAt: '2026-11-01T10:00:00.000Z', eventId: 'e1' },
      ],
      'http-exception:POST /orders#OutOfStock': [
        { sessionId: 'newer', createdAt: '2026-11-02T10:00:00.000Z', eventId: 'e9' },
      ],
      'route:shop:cart': [{ sessionId: 'newer', createdAt: '2026-11-02T10:00:00.000Z', eventId: 'e7' }],
      // Proven: nothing to look for.
      'method:cart.clear': [],
    });
  });

  describe('readBehaviorCoverage', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'behavior-coverage-'));
    afterAll(() => rmSync(appDir, { recursive: true, force: true }));

    it('reads what the architecture suite wrote, and nothing else', () => {
      expect(readBehaviorCoverage(appDir)).toBeUndefined();
      mkdirSync(join(appDir, '.craft'));
      writeFileSync(join(appDir, BEHAVIOR_COVERAGE_FILE), JSON.stringify({ version: 2, behaviors: [] }));
      expect(readBehaviorCoverage(appDir)).toBeUndefined();
      writeFileSync(
        join(appDir, BEHAVIOR_COVERAGE_FILE),
        JSON.stringify({ version: 1, app: 'shop', behaviors: [unproven('method:cart.add', undefined)] }),
      );
      expect(readBehaviorCoverage(appDir)).toEqual({ app: 'shop', behaviors: [unproven('method:cart.add', undefined)] });
    });
  });
});
