import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { behaviorCoverageUnit, defaultCoverageUnitWeight, isFailureCoverageUnit, sessionCoverageUnits } from './coverage-units.js';
import { goldenSessionsShowing, isGoldenSetManifest, selectGoldenSet, type GoldenSetCandidate } from './golden-set.js';
import { normalizeSessionTrace, type SessionTrace, type SessionTraceStep } from './normalize.js';

type Step = Pick<SessionTraceStep, 'key' | 'kind' | 'detail'> & { participant?: string };
const trace = (steps: readonly Step[], hash = JSON.stringify(steps)): SessionTrace => ({
  format: 'craft-session-trace',
  schemaVersion: 2,
  ignored: {},
  hash,
  steps: steps.map((step, index) => ({ elapsedMs: index * 10, eventId: `e${index}`, participant: 'p1', ...step })),
});
const nav = (path: string): Step => ({ key: `route:${path}`, kind: 'route', detail: { outcome: 'succeeded', queryKeys: [] } });
const activation = (path: string, outcome = 'activated', behavior?: string): Step =>
  ({ key: `route-activation:${path}`, kind: 'route', detail: { outcome, ...(behavior ? { behavior } : {}) } });
const call = (address: string, outcome: 'succeeded' | 'failed' = 'succeeded', extra: Record<string, unknown> = {}): Step =>
  ({ key: `invocation:${address}`, kind: 'invocation', detail: { outcome, ...extra } });
const serverFn = (id: string, status = 200): Step =>
  ({ key: `server-fn:${id}`, kind: 'http', detail: { status, outcome: status >= 400 ? 'error' : 'ok', bodyKeys: [] } });
const candidate = (sessionId: string, steps: readonly Step[], extra: Partial<GoldenSetCandidate> = {}): GoldenSetCandidate =>
  ({ sessionId, recordedAt: '2026-11-01T00:00:00.000Z', trace: trace(steps), replayable: true, ...extra });

function fixture(id: 'shop.checkout' | 'admin.edit-product' | 'admin.multicontext') {
  return JSON.parse(gunzipSync(readFileSync(new URL(`./__fixtures__/${id}.session.json.gz`, import.meta.url))).toString('utf8')) as { events: Record<string, unknown>[] };
}

describe('sessionCoverageUnits', () => {
  it('reads a recorded journey as meanings, not values', () => {
    const units = sessionCoverageUnits(normalizeSessionTrace(fixture('shop.checkout')));
    expect(units).toEqual(expect.arrayContaining([
      'interaction:EcommerceCataloguePage:button:add-product:click',
      'invocation:cart.add',
      'route:/panier',
      'route:/paiement',
      'server-fn:ecommerce.catalog:ok',
      'server-fn:ecommerce.checkout:ok',
    ]));
    // Ends of navigation add nothing to their start; no id or number leaks in.
    expect(units.some((unit) => unit.endsWith(':end'))).toBe(false);
    expect(units.some((unit) => /\d{3,}|#/.test(unit))).toBe(false);
    expect([...units].sort()).toEqual(units);
  });

  it('gives the same units to two recordings of the same path with other data', () => {
    const first = trace([nav('/produits/42'), call('cart.add'), nav('/produits/7')]);
    const second = trace([nav('/produits/9'), call('cart.add')]);
    expect(sessionCoverageUnits(first)).toEqual(['invocation:cart.add', 'route:/produits/:id']);
    expect(sessionCoverageUnits(second)).toEqual(sessionCoverageUnits(first));
  });

  it('names failures with their exception and response class', () => {
    expect(sessionCoverageUnits(trace([
      call('service:cart / method:add', 'failed', { exception: 'CartFullError', behavior: 'cart.add' }),
      serverFn('ecommerce.checkout', 503),
      { key: 'http:GET:/api/orders/12', kind: 'http', detail: { status: 404, outcome: 'error' } },
      { key: 'http:POST:/api/ping', kind: 'http', detail: { status: null, outcome: 'pending' } },
      activation('admin/:id', 'failed'),
      { key: 'route:/admin:cancel', kind: 'route', detail: { outcome: 'succeeded' } },
    ]))).toEqual([
      'exception:CartFullError',
      'http:GET:/api/orders/:id:error:4xx',
      'invocation:cart.add:failed',
      'route-activation:admin/:id:failed',
      'route:/admin:cancel',
      'server-fn:ecommerce.checkout:error:5xx',
    ]);
  });

  it('draws journey edges from activations, per participant', () => {
    const units = sessionCoverageUnits(trace([
      activation('catalogue'), { ...activation('panier'), participant: 'p2' }, activation('paiement'), activation('paiement'),
    ]));
    expect(units.filter((unit) => unit.startsWith('flow:'))).toEqual(['flow:catalogue -> paiement']);
  });

  it('falls back on navigations when no activation was recorded', () => {
    expect(sessionCoverageUnits(trace([nav('/'), nav('/panier'), { key: 'route:/panier:end', kind: 'route', detail: {} }])))
      .toEqual(['flow:/ -> /panier', 'route:/', 'route:/panier']);
  });

  it('keeps placeholders the normalizer wrote inside the path', () => {
    expect(sessionCoverageUnits(trace([nav('/orders/:uuid')]))).toEqual(['route:/orders/:id']);
  });

  it('weighs failures above the rest', () => {
    expect(isFailureCoverageUnit('route:/admin:cancel')).toBe(true);
    expect(isFailureCoverageUnit('route-activation:shop:error')).toBe(false);
    expect(defaultCoverageUnitWeight('checkpoint:service:cart')).toBe(1);
    expect(defaultCoverageUnitWeight('http:GET:/x:error:5xx')).toBeGreaterThan(defaultCoverageUnitWeight('http:GET:/x:ok'));
    expect(defaultCoverageUnitWeight('exception:CartFullError')).toBeGreaterThan(defaultCoverageUnitWeight('invocation:cart.add'));
  });

  it('names the unit that shows a behaviour of the catalog', () => {
    expect(behaviorCoverageUnit({ step: 'invocation', outcome: 'succeeded', target: 'cart.add' })).toBe('invocation:cart.add');
    expect(behaviorCoverageUnit({ step: 'invocation', outcome: 'failed', exception: 'CartFullError' })).toBe('exception:CartFullError');
    expect(behaviorCoverageUnit({ step: 'route', path: 'panier', behavior: 'shop:panier' })).toBe('route-activation:shop:panier');
    expect(behaviorCoverageUnit({ step: 'server-fn', id: 'ecommerce.checkout' })).toBe('server-fn:ecommerce.checkout:ok');
  });
});

describe('selectGoldenSet', () => {
  const browse = candidate('browse', [nav('/'), nav('/produits/1')]);
  const buy = candidate('buy', [nav('/'), nav('/produits/1'), call('cart.add'), nav('/panier'), serverFn('checkout')]);
  const full = candidate('full', [nav('/'), call('cart.add', 'failed', { exception: 'CartFullError' })]);
  const admin = candidate('admin', [nav('/admin'), call('product.save')]);

  it('keeps the fewest sessions that show everything', () => {
    const { manifest, rejected, uncovered } = selectGoldenSet([browse, buy, full, admin], { app: 'shop' });
    expect(manifest.sessions.map((entry) => entry.sessionId)).toEqual(['admin', 'buy', 'full']);
    expect(rejected).toEqual([{ sessionId: 'browse', reason: 'redundant' }]);
    expect(uncovered).toEqual([]);
    expect(manifest.sessions.find((entry) => entry.sessionId === 'full')?.uniqueUnits).toEqual(['exception:CartFullError', 'invocation:cart.add:failed']);
    expect(manifest.sessions.find((entry) => entry.sessionId === 'buy')?.uniqueUnits).not.toContain('route:/');
  });

  it('is deterministic whatever the order of the candidates', () => {
    const forward = selectGoldenSet([browse, buy, full, admin], { app: 'shop' });
    const backward = selectGoldenSet([admin, full, buy, browse], { app: 'shop' });
    expect(backward).toEqual(forward);
    expect(isGoldenSetManifest(JSON.parse(JSON.stringify(forward.manifest)))).toBe(true);
  });

  it('keeps one session per trace, the newest', () => {
    const older = candidate('older', [nav('/x')], { recordedAt: '2026-10-01T00:00:00.000Z' });
    const newer = candidate('newer', [nav('/x')], { recordedAt: '2026-11-01T00:00:00.000Z' });
    const { manifest, rejected } = selectGoldenSet([older, newer], { app: 'shop' });
    expect(manifest.sessions.map((entry) => entry.sessionId)).toEqual(['newer']);
    expect(rejected).toEqual([{ sessionId: 'older', reason: 'duplicate', duplicateOf: 'newer' }]);
  });

  it('leaves out a session that does not replay, and marks the unchecked ones', () => {
    const broken = candidate('broken', [nav('/broken')], { replayable: false });
    const unchecked = candidate('unchecked', [nav('/new')], { replayable: undefined });
    const { manifest, rejected } = selectGoldenSet([broken, unchecked], { app: 'shop' });
    expect(rejected).toEqual([{ sessionId: 'broken', reason: 'not-replayable' }]);
    expect(manifest.sessions).toMatchObject([{ sessionId: 'unchecked', status: 'unverified' }]);
  });

  it('stays within the budget, failures first, and says what it left out', () => {
    const { manifest, rejected, uncovered } = selectGoldenSet([browse, full, admin], { app: 'shop', maxSessions: 1 });
    expect(manifest.sessions.map((entry) => entry.sessionId)).toEqual(['full']);
    expect(rejected.filter((item) => item.reason === 'over-budget').map((item) => item.sessionId)).toEqual(['admin', 'browse']);
    expect(uncovered).toEqual(['flow:/ -> /produits/:id', 'invocation:product.save', 'route:/admin', 'route:/produits/:id']);
  });

  it('puts the priority units first', () => {
    const { manifest } = selectGoldenSet([full, admin], { app: 'shop', maxSessions: 1, priorityUnits: ['invocation:product.save'] });
    expect(manifest.sessions.map((entry) => entry.sessionId)).toEqual(['admin']);
  });

  it('ignores the units weighed 0', () => {
    const { manifest } = selectGoldenSet([candidate('state-only', [{ key: 'checkpoint:service:cart', kind: 'checkpoint', detail: {} }])], {
      app: 'shop', weight: (unit) => (unit.startsWith('checkpoint:') ? 0 : 1),
    });
    expect(manifest.sessions).toEqual([]);
  });

  it('always keeps a pinned session', () => {
    const { manifest } = selectGoldenSet([browse, buy], { app: 'shop' });
    expect(manifest.sessions.map((entry) => entry.sessionId)).toEqual(['buy']);
    const pinned = selectGoldenSet([{ ...browse, pinned: true }, buy], { app: 'shop' });
    expect(pinned.manifest.sessions.map((entry) => [entry.sessionId, entry.pinned])).toEqual([['browse', true], ['buy', undefined]]);
  });

  it('prefers the sessions already in the set, so the suite does not churn', () => {
    const a = candidate('a', [nav('/x')], { recordedAt: '2026-10-01T00:00:00.000Z' });
    const b = candidate('b', [nav('/x'), call('noop', 'succeeded')], { recordedAt: '2026-11-01T00:00:00.000Z' });
    const c = candidate('c', [nav('/x'), call('noop', 'succeeded')], { recordedAt: '2026-11-02T00:00:00.000Z' });
    // b and c show the same units with different traces: the newest wins at first…
    const first = selectGoldenSet([b, c], { app: 'shop' });
    expect(first.manifest.sessions.map((entry) => entry.sessionId)).toEqual(['c']);
    // …then stays when an equal one arrives.
    const later = candidate('d', [nav('/x'), call('noop', 'succeeded'), nav('/x')], { recordedAt: '2026-11-03T00:00:00.000Z' });
    expect(selectGoldenSet([a, b, c, later], { app: 'shop', previous: first.manifest }).manifest.sessions.map((entry) => entry.sessionId)).toEqual(['c']);
  });

  it('lists what a stale session was the only one to show, until a new recording shows it', () => {
    const before = selectGoldenSet([buy, full, admin], { app: 'shop' }).manifest;
    const stale = selectGoldenSet([{ ...buy }, { ...full, replayable: false }, admin], { app: 'shop', previous: before }).manifest;
    expect(stale.toRecapture).toEqual(['exception:CartFullError', 'invocation:cart.add:failed']);
    const stillStale = selectGoldenSet([buy, admin], { app: 'shop', previous: stale }).manifest;
    expect(stillStale.toRecapture).toEqual(['exception:CartFullError', 'invocation:cart.add:failed']);
    const recorded = candidate('full-again', [call('cart.add', 'failed', { exception: 'CartFullError' })]);
    expect(selectGoldenSet([buy, admin, recorded], { app: 'shop', previous: stillStale }).manifest.toRecapture).toEqual([]);
  });

  it('chooses among the e2e recordings of the pilot', () => {
    const sessions = (['shop.checkout', 'admin.edit-product', 'admin.multicontext'] as const).map((id) =>
      candidate(id, [], { trace: normalizeSessionTrace(fixture(id)) }));
    const { manifest } = selectGoldenSet(sessions, { app: 'demo-ecommerce' });
    expect(manifest.sessions.length).toBeGreaterThanOrEqual(2);
    for (const entry of manifest.sessions) expect(entry.uniqueUnits.length, entry.sessionId).toBeGreaterThan(0);
  });
});

describe('goldenSessionsShowing', () => {
  it('finds the kept sessions a change touches', () => {
    const { manifest } = selectGoldenSet([
      candidate('buy', [nav('/panier'), call('cart.add')], { recordedAt: '2026-11-01T00:00:00.000Z' }),
      candidate('admin', [nav('/admin'), call('product.save')], { recordedAt: '2026-11-02T00:00:00.000Z' }),
      candidate('both', [nav('/admin'), call('cart.add'), call('cart.clear')], { recordedAt: '2026-11-03T00:00:00.000Z' }),
    ], { app: 'shop' });
    expect(goldenSessionsShowing(manifest, ['invocation:cart.add']).map((entry) => entry.sessionId)).toEqual(['both', 'buy']);
    expect(goldenSessionsShowing(manifest, (unit) => unit.startsWith('route:/admin')).map((entry) => entry.sessionId)).toEqual(['both', 'admin']);
  });
});

describe('isGoldenSetManifest', () => {
  it('refuses another format or a malformed entry', () => {
    expect(isGoldenSetManifest({ format: 'craft-golden-set', schemaVersion: 1, app: 'x', traceSchemaVersion: 2, sessions: [], toRecapture: [] })).toBe(true);
    expect(isGoldenSetManifest({ format: 'craft-golden-set', schemaVersion: 2, app: 'x', traceSchemaVersion: 2, sessions: [], toRecapture: [] })).toBe(false);
    expect(isGoldenSetManifest({ format: 'craft-golden-set', schemaVersion: 1, app: 'x', traceSchemaVersion: 2, sessions: [{ sessionId: 'a' }], toRecapture: [] })).toBe(false);
  });
});
