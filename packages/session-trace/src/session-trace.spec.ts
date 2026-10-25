import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { normalizeSessionTrace, type SessionTrace, type SessionTraceStep } from './normalize.js';
import { compareSessionTraces, renderSessionTraceComparison, sessionTraceFindingAnchors } from './compare.js';
import { parseSessionTraceComparison } from './parse.js';

type Event = Record<string, unknown>;
type Session = { events: Event[] };

// Copies of the pilot's versioned sessions: re-recording the pilot never breaks these tests.
function fixture(id: 'shop.checkout' | 'admin.edit-product' | 'admin.multicontext'): Session {
  return JSON.parse(gunzipSync(readFileSync(new URL(`./__fixtures__/${id}.session.json.gz`, import.meta.url))).toString('utf8')) as Session;
}
const session = (events: Event[]): Session => ({ events });
const keys = (trace: SessionTrace) => trace.steps.map((step) => step.key);
const step = (trace: SessionTrace, key: string): SessionTraceStep => {
  const found = trace.steps.find((item) => item.key === key);
  if (!found) throw new Error(`${key} absent : ${keys(trace).join('\n')}`);
  return found;
};
function edit(source: Session, change: (events: Event[]) => Event[]): Session {
  return { ...source, events: change(structuredClone(source.events)) };
}
const ADD = 'invocation:service:cart / state:cartLines / method:add';
const CONFIRM = 'interaction:EcommerceCheckoutPage:button:confirm-order:click';

describe('normalizeSessionTrace', () => {
  it('reads the checkout journey end to end', () => {
    const trace = normalizeSessionTrace(fixture('shop.checkout'));
    const journey = keys(trace).filter((key) => /^(server-fn|route:|interaction|invocation:service:cart)/.test(key));
    expect(journey).toEqual([
      'server-fn:ecommerce.catalog',
      'interaction:EcommerceCataloguePage:button:add-product:click',
      ADD,
      'route:/panier', 'route:/panier:end', 'server-fn:ecommerce.catalog',
      'route:/paiement', 'route:/paiement:end', 'server-fn:ecommerce.catalog',
      CONFIRM,
      'server-fn:ecommerce.checkout',
      'invocation:service:cart / state:cartLines / method:clear',
    ]);
    expect(keys(trace).some((key) => key.startsWith('checkpoint:service:cart / '))).toBe(true);
    expect(keys(trace)).not.toContain('http:GET:/');
    expect(keys(trace).some((key) => key.includes('hover'))).toBe(false);
    expect(keys(trace).some((key) => /#\d/.test(key))).toBe(false);
    expect(step(trace, 'server-fn:ecommerce.checkout')).toMatchObject({ detail: { status: 200, outcome: 'ok', bodyKeys: ['createdAt', 'id', 'lines', 'total'] } });
    expect(step(trace, 'server-fn:ecommerce.catalog').durationMs).toBeGreaterThan(0);
  });

  it('counts the event kinds it does not turn into steps', () => {
    expect(normalizeSessionTrace(fixture('shop.checkout')).ignored).toEqual({ 'component-lifecycle': 7, hover: 13, participant: 1, performance: 1, storage: 3 });
  });

  it('reports a failed craft call on its own step', () => {
    const failed = edit(fixture('shop.checkout'), (events) => events.map((event) =>
      event['operationId'] === 'craft-call-5' && event['phase'] === 'succeeded' ? { ...event, phase: 'failed', response: { name: 'CartFullError' } } : event));
    expect(step(normalizeSessionTrace(failed), ADD).detail).toEqual({ outcome: 'failed', exception: 'CartFullError' });
  });

  it('reports a 500 on the last server function under its id', () => {
    const broken = edit(fixture('shop.checkout'), (events) => events.map((event) =>
      event['operationId'] === 'fetch-4' && event['phase'] === 'succeeded' ? { ...event, response: { ...(event['response'] as Event), status: 500, body: '"{\\"error\\":\\"boom\\"}"' } } : event));
    expect(step(normalizeSessionTrace(broken), 'server-fn:ecommerce.checkout').detail).toEqual({ status: 500, outcome: 'error', bodyKeys: ['error'] });
  });

  it('marks an operation without an end as pending', () => {
    const trace = normalizeSessionTrace(session([
      { id: 'a', kind: 'http', phase: 'started', operationId: 'fetch-1', sequence: 1, payload: { method: 'GET', url: 'http://localhost/api/cart?b=1' } },
    ]));
    expect(trace.steps).toEqual([expect.objectContaining({ key: 'http:GET:/api/cart', detail: { status: null, outcome: 'pending', bodyKeys: [] } })]);
    expect(trace.steps[0]!.durationMs).toBeUndefined();
  });

  it('adds a checkpoint only when a primitive value changes', () => {
    const primitive = (sequence: number, value: unknown): Event => ({ id: `p${sequence}`, kind: 'primitive', phase: 'emitted', sequence, state: { 'service:cart#3 / state:lines#4': value } });
    const trace = normalizeSessionTrace(session([primitive(1, []), primitive(2, []), primitive(3, [{ id: 'a' }]), primitive(4, [{ id: 'a' }])]));
    expect(keys(trace)).toEqual(['checkpoint:service:cart / state:lines', 'checkpoint:service:cart / state:lines']);
  });

  it('masks volatile values in checkpoint fingerprints', () => {
    const order = (id: string, createdAt: string) => normalizeSessionTrace(session([{ kind: 'primitive', sequence: 1, state: { 'query:order': { id, createdAt, total: 5, status: 'paid' } } }]));
    expect(order('order-1792859252638-x9id9', '2026-10-24T16:27:32.638Z').hash).toBe(order('order-1792859300000-k2p4q', '2026-10-25T08:00:00.000Z').hash);
    expect(normalizeSessionTrace(session([{ kind: 'primitive', sequence: 1, state: { 'query:order': { total: 6 } } }])).hash)
      .not.toBe(normalizeSessionTrace(session([{ kind: 'primitive', sequence: 1, state: { 'query:order': { total: 5 } } }])).hash);
  });

  it('inserts markers recorded outside the page by time', () => {
    const source = fixture('shop.checkout');
    const activation = source.events.find((event) => event['kind'] === 'route-activation')!;
    const trace = normalizeSessionTrace(source, { markers: [{ label: 'ouvrir la boutique', at: Number(activation['timestamp']) - 1 }, { label: 'confirmer la commande', at: 0 }] });
    expect(keys(trace).indexOf('marker:ouvrir la boutique')).toBe(keys(trace).indexOf('route-activation:catalogue') - 1);
    // The page already emitted this label: it is not inserted twice.
    expect(keys(trace).filter((key) => key === 'marker:confirmer la commande')).toHaveLength(1);
  });

  it('reads server function paths from the options', () => {
    const request = session([{ kind: 'http', phase: 'started', operationId: 'f', sequence: 1, payload: { method: 'POST', url: '/rpc', body: '{"id":"cart.add"}' } }]);
    expect(keys(normalizeSessionTrace(request))).toEqual(['http:POST:/rpc']);
    expect(keys(normalizeSessionTrace(request, { serverFunctionPaths: ['/rpc'] }))).toEqual(['server-fn:cart.add']);
  });

  it('numbers participants by first appearance', () => {
    const trace = normalizeSessionTrace(fixture('admin.multicontext'));
    expect(new Set(trace.steps.map((item) => item.participant))).toEqual(new Set(['p1', 'p2']));
  });

  it('gives the same digest to two normalizations of a session', () => {
    expect(normalizeSessionTrace(fixture('admin.edit-product')).hash).toBe(normalizeSessionTrace(fixture('admin.edit-product')).hash);
    expect(normalizeSessionTrace(session([])).hash).toBe('4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
  });
});

/** A minimal trace: one step per key, `elapsedMs` 100 ms apart unless given. */
function trace(steps: ReadonlyArray<string | Partial<SessionTraceStep> & { key: string }>): SessionTrace {
  return {
    format: 'craft-session-trace', schemaVersion: 2, ignored: {}, hash: '',
    steps: steps.map((item, index) => {
      const value = typeof item === 'string' ? { key: item } : item;
      return { kind: 'http', detail: {}, elapsedMs: index * 100, participant: 'p1', eventId: `e${index}`, ...value };
    }),
  };
}

describe('compareSessionTraces', () => {
  const green = normalizeSessionTrace(fixture('shop.checkout'));

  it.each([
    ['a failed craft call', (events: Event[]) => events.map((event) => event['operationId'] === 'craft-call-5' && event['phase'] === 'succeeded' ? { ...event, phase: 'failed', response: { name: 'Error' } } : event), { kind: 'changed-invariant', key: ADD, fields: ['outcome', 'exception'] }],
    ['a 500 on the order', (events: Event[]) => events.map((event) => event['operationId'] === 'fetch-4' && event['phase'] === 'succeeded' ? { ...event, response: { status: 500, body: '"{}"' } } : event), { kind: 'changed-invariant', key: 'server-fn:ecommerce.checkout', fields: ['status', 'outcome', 'bodyKeys'] }],
    ['a missing click', (events: Event[]) => {
      const click = events.find((event) => event['name'] === 'EcommerceCheckoutPage:button:confirm-order:click')!;
      return events.filter((event) => Number(event['sequence']) < Number(click['sequence']));
    }, { kind: 'missing-invariant', key: CONFIRM }],
    ['a doubled request', (events: Event[]) => {
      const copies = events.filter((event) => event['operationId'] === 'fetch-1').map((event) => ({ ...event, id: `${String(event['id'])}-copy`, operationId: 'fetch-1-copy', sequence: Number(event['sequence']) + 0.5 }));
      return [...events, ...copies];
    }, { kind: 'extra-occurrence', key: 'server-fn:ecommerce.catalog' }],
  ] as const)('puts the first divergence of %s on the right step', (_name, change, expected) => {
    const result = compareSessionTraces(normalizeSessionTrace(edit(fixture('shop.checkout'), change)), [green]);
    const first = result.firstDivergence;
    expect(first?.kind).toBe(expected.kind);
    const firstKey = first && ('expected' in first ? first.expected.key : 'observed' in first ? first.observed.key : first.step.key);
    expect(firstKey).toBe(expected.key);
    if (first?.kind === 'changed-invariant' && 'fields' in expected) expect(first.fields).toEqual(expected.fields);
    if (first?.kind === 'extra-occurrence') expect(first).toMatchObject({ expectedCount: 3, observedCount: 4, severity: 'error' });
  });

  it('finds nothing between a green run and itself', () => {
    expect(compareSessionTraces(green, [green])).toMatchObject({ findings: [], noise: [] });
  });

  it('does not make later steps slow after a slow first step', () => {
    const baseline = trace([{ key: 'a', elapsedMs: 0, durationMs: 100 }, { key: 'b', kind: 'interaction', elapsedMs: 200 }, { key: 'c', kind: 'interaction', elapsedMs: 300 }]);
    const observed = trace([{ key: 'a', elapsedMs: 0, durationMs: 2_000 }, { key: 'b', kind: 'interaction', elapsedMs: 2_100 }, { key: 'c', kind: 'interaction', elapsedMs: 2_200 }]);
    const timings = compareSessionTraces(observed, [baseline]).findings.filter((finding) => finding.kind === 'timing');
    expect(timings).toEqual([expect.objectContaining({ measure: 'duration', observedMs: 2_000, step: expect.objectContaining({ key: 'a' }) }), expect.objectContaining({ measure: 'gap', step: expect.objectContaining({ key: 'b' }) })]);
  });

  it('does not compare a field that varies among green runs', () => {
    const run = (status: number, bodyKeys: string[]) => trace([{ key: 'server-fn:cart', detail: { status, bodyKeys } }]);
    const result = compareSessionTraces(run(201, ['x']), [run(200, ['id']), run(201, ['id']), run(200, ['id'])]);
    expect(result.findings).toEqual([expect.objectContaining({ kind: 'changed-invariant', fields: ['bodyKeys'] })]);
  });

  it('treats a step missing from one green run as noise', () => {
    const result = compareSessionTraces(trace(['a', 'c']), [trace(['a', 'b', 'c']), trace(['a', 'b', 'c']), trace(['a', 'c'])]);
    expect(result.findings).toEqual([]);
    expect(result.noise).toEqual([{ key: 'b', kind: 'http', occurrences: 1 }]);
  });

  it('never reports a marker as a finding', () => {
    const result = compareSessionTraces(trace(['a', { key: 'marker:payer', kind: 'marker' }, 'b']), [trace([{ key: 'marker:ouvrir', kind: 'marker' }, 'a', 'b'])]);
    expect(result.findings).toEqual([]);
  });

  it('lists findings in the order of the observed run', () => {
    const result = compareSessionTraces(trace(['new-1', 'a', 'c', 'new-2', 'd']), [trace(['a', 'b', 'c', 'd', 'e'])]);
    expect(result.findings.map((finding) => finding.kind === 'missing-invariant' ? `-${finding.expected.key}` : finding.kind === 'new-step' ? `+${finding.observed.key}` : finding.kind))
      .toEqual(['+new-1', '-b', '+new-2', '-e']);
    expect(result.firstDivergence).toMatchObject({ kind: 'missing-invariant', expected: { key: 'b' }, afterStep: { key: 'a' } });
  });

  it('anchors each finding on both runs', () => {
    const result = compareSessionTraces(trace(['a', 'surprise', 'c']), [trace(['a', 'b', 'c'])]);
    const [missing, added] = result.findings;
    expect(sessionTraceFindingAnchors(missing!)).toMatchObject({ baseline: { key: 'b' }, observed: { key: 'a' } });
    expect(sessionTraceFindingAnchors(added!)).toMatchObject({ baseline: { key: 'a' }, observed: { key: 'surprise' } });
  });

  it('reads back a comparison from JSON and refuses a malformed one', () => {
    const result = compareSessionTraces(trace(['a', 'x', 'x', 'c', { key: 'slow', durationMs: 5_000 }]), [trace(['a', 'b', 'x', { key: 'slow', durationMs: 100 }])]);
    expect(result.findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['missing-invariant', 'extra-occurrence', 'new-step', 'timing']));
    expect(parseSessionTraceComparison(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(parseSessionTraceComparison({ ...result, findings: [{ kind: 'missing-invariant' }] })).toBeUndefined();
  });

  it('compares traces of 5,000 steps in under a second', () => {
    const steps = Array.from({ length: 5_000 }, (_, index) => `step-${index % 400}`);
    const observed = [...steps.slice(0, 2_500), 'surprise', ...steps.slice(2_501)];
    const started = performance.now();
    const result = compareSessionTraces(trace(observed), [trace(steps), trace(steps), trace(steps)]);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(result.firstDivergence).toMatchObject({ kind: 'missing-invariant' });
  });

  it('renders the report with every finding grouped by kind', () => {
    const baseline = trace([{ key: 'server-fn:catalog', detail: { status: 200 } }, { key: 'interaction:add' }, { key: 'server-fn:checkout', detail: { status: 200, outcome: 'ok' } }]);
    const observed = trace([{ key: 'server-fn:catalog', detail: { status: 200 } }, { key: 'server-fn:catalog', detail: { status: 200 } }, { key: 'server-fn:checkout', detail: { status: 500, outcome: 'error' } }, { key: 'exception:boom', kind: 'exception' }]);
    expect(renderSessionTraceComparison(compareSessionTraces(observed, [baseline]), { testId: 'shop.checkout', project: 'chromium', dashboardUrl: 'http://localhost:4212/#/compare?test=shop.checkout' })).toMatchInlineSnapshot(`
      "# Session comparée à 1 run vert (shop.checkout · chromium)

      > Une seule référence : les variations normales ne sont pas connues.

      ## Première divergence

      **Absent du run** : interaction:add (attendu après server-fn:catalog)

      ## Trouvailles (4)

      ### Absent du run (1)

      - interaction:add (attendu après server-fn:catalog)

      ### Valeur différente (1)

      - server-fn:checkout · status : 200 → 500, outcome : "ok" → "error"

      ### Nouveau (1)

      - exception:boom

      ### En trop (1)

      - server-fn:catalog · 2 fois au lieu de 1

      Bruit : 0 pas absents d'au moins une référence, non comparés.

      [Ouvrir la comparaison dans le dashboard](http://localhost:4212/#/compare?test=shop.checkout)
      "
    `);
  });
});
