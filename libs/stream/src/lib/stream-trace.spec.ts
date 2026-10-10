import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TestBed,
  craftUse,
  injectCorrelationIdService,
  provideCorrelationIdTracking,
  provideCraftProduction,
  provideFnWrapper,
  provideTakeAppSnapshot,
  subject,
  type FnWrapper,
} from '@craft-ts/core';
import {
  createCraftStream,
  fromSubscribable,
  map,
  mergeMap,
  of,
  provideStreamTrace,
  streamSignal,
  subscribe,
  toSubscribable,
  traceStage,
  type StreamTraceContext,
  type StreamTraceEvent,
} from '../index';

type Seen = { event: StreamTraceEvent; context: StreamTraceContext };

function collector() {
  const seen: Seen[] = [];
  return {
    seen,
    provider: provideStreamTrace((event, context) =>
      seen.push({ event, context }),
    ),
    kinds: () => seen.map((entry) => entry.event.kind),
  };
}

describe('provideStreamTrace', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('observes subscribe, each value and completion of a root subscription', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });

    TestBed.runInInjectionContext(() => {
      subscribe(of(1, 2).pipe(map((n) => n * 10)), {}, { name: 'tens' });
    });

    expect(trace.kinds()).toEqual(['subscribe', 'next', 'next', 'complete']);
    expect(trace.seen.map((entry) => entry.context.name)).toEqual([
      'tens',
      'tens',
      'tens',
      'tens',
    ]);
    expect(
      trace.seen.filter((e) => e.event.kind === 'next').map((e) => e.event),
    ).toEqual([
      { kind: 'next', value: 10, index: 0 },
      { kind: 'next', value: 20, index: 1 },
    ]);
    expect(new Set(trace.seen.map((e) => e.context.streamId)).size).toBe(1);
  });

  it('gives each root subscription its own id and does not trace inner streams as roots', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });

    TestBed.runInInjectionContext(() => {
      const source = of(1, 2).pipe(mergeMap((n) => of(n, n)));
      subscribe(source, {});
      subscribe(source, {});
    });

    const ids = new Set(trace.seen.map((e) => e.context.streamId));
    expect(ids.size).toBe(2);
    expect(trace.kinds().filter((kind) => kind === 'subscribe')).toHaveLength(
      2,
    );
  });

  it('reports an unsubscribe that precedes any terminal notification', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });
    const live = subject<number>();

    TestBed.runInInjectionContext(() => {
      const subscription = subscribe(fromSubscribable(live), {});
      live.next(1);
      subscription.unsubscribe();
      subscription.unsubscribe();
    });

    expect(trace.kinds()).toEqual(['subscribe', 'next', 'unsubscribe']);
  });

  it('reports exceptions and defects as distinct events', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });
    const failing = createCraftStream<number>((_context, sink) => {
      sink.next(1);
      sink.error(new Error('defect'));
    });

    TestBed.runInInjectionContext(() => {
      subscribe(failing, { error: () => undefined });
    });

    expect(trace.kinds()).toEqual(['subscribe', 'next', 'error']);
  });

  it('labels a streamSignal root and its own entry point', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });
    const live = subject<string>();

    TestBed.runInInjectionContext(() => {
      craftUse(streamSignal('feed', fromSubscribable(live)));
      live.next('a');
    });

    expect(trace.seen[0].context).toMatchObject({
      name: 'feed',
      root: 'signal',
    });
    expect(trace.kinds()).toEqual(['subscribe', 'next']);
  });

  it('shows the correlation id current when the stream started', () => {
    const trace = collector();
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking(), trace.provider],
    });

    TestBed.runInInjectionContext(() => {
      injectCorrelationIdService()?.generateAndSet('click');
      subscribe(of(1), {});
    });

    expect(trace.seen[0].context.startCorrelationId).toContain('click');
  });

  it('is skipped in production', () => {
    const trace = collector();
    TestBed.configureTestingModule({
      providers: [provideCraftProduction(), trace.provider],
    });

    TestBed.runInInjectionContext(() => {
      subscribe(of(1), {});
    });

    expect(trace.seen).toEqual([]);
  });

  it('ignores an observer that throws', () => {
    const next = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideStreamTrace(() => {
          throw new Error('broken observer');
        }),
      ],
    });

    TestBed.runInInjectionContext(() => {
      subscribe(of(1, 2), { next });
    });

    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('traceStage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  const stages = (seen: Seen[]) =>
    seen
      .filter((entry) => entry.event.kind === 'stage')
      .map((entry) => {
        const event = entry.event as Extract<
          StreamTraceEvent,
          { kind: 'stage' }
        >;
        return `${event.stage}:${event.notification}${
          event.notification === 'next' ? `=${String(event.value)}` : ''
        }`;
      });

  it('reports what passes each marker, in pipeline order', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });

    const values: number[] = [];
    TestBed.runInInjectionContext(() => {
      subscribe(
        of(1, 2).pipe(
          traceStage('source'),
          map((n) => n * 10),
          traceStage('scaled'),
        ),
        { next: (value) => values.push(value) },
      );
    });

    expect(values).toEqual([10, 20]);
    expect(stages(trace.seen)).toEqual([
      'source:next=1',
      'scaled:next=10',
      'source:next=2',
      'scaled:next=20',
      'source:complete',
      'scaled:complete',
    ]);
  });

  it('shows a defect at the stage it went through', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });
    const failing = createCraftStream<number>((_context, sink) => {
      sink.error(new Error('late'));
    });

    TestBed.runInInjectionContext(() => {
      subscribe(failing.pipe(traceStage('after-source')), {
        error: () => undefined,
      });
    });

    expect(stages(trace.seen)).toEqual(['after-source:error']);
  });

  it('is a plain pass-through when nothing traces', () => {
    const values: number[] = [];
    TestBed.runInInjectionContext(() => {
      subscribe(of(1, 2).pipe(traceStage('quiet')), {
        next: (value) => values.push(value),
      });
    });

    expect(values).toEqual([1, 2]);
  });

  it('keeps the stage events of two subscriptions of one shared context apart', () => {
    const trace = collector();
    TestBed.configureTestingModule({ providers: [trace.provider] });

    TestBed.runInInjectionContext(() => {
      const shared = toSubscribable(of(1).pipe(traceStage('s')));
      shared.subscribe({});
      shared.subscribe({});
    });

    const ids = trace.seen
      .filter((entry) => entry.event.kind === 'stage')
      .map((entry) => entry.context.streamId);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('function wrappers on stream handlers', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('runs map and mergeMap handlers through provideFnWrapper', () => {
    const calls: unknown[][] = [];
    const wrapper: FnWrapper = function* (factory, thisArg, args) {
      calls.push(args);
      return yield* factory.apply(thisArg, args);
    };
    TestBed.configureTestingModule({
      providers: [provideFnWrapper('test: not type-safe', wrapper)],
    });

    const values: number[] = [];
    TestBed.runInInjectionContext(() => {
      subscribe(
        of(1, 2).pipe(
          map((n) => n + 1),
          mergeMap((n) => of(n * 10)),
        ),
        { next: (value) => values.push(value) },
      );
    });

    expect(values).toEqual([20, 30]);
    expect(calls).toHaveLength(4);
  });

  it('keeps a synchronous pipeline synchronous when a wrapper is installed', () => {
    TestBed.configureTestingModule({
      providers: [
        provideFnWrapper('test: not type-safe', function* (f, t, a) {
          return yield* f.apply(t, a);
        }),
      ],
    });

    const result = TestBed.runInInjectionContext(() => {
      const out: number[] = [];
      subscribe(of(1, 2, 3).pipe(map((n) => n * 2)), {
        next: (value) => out.push(value),
      });
      return out;
    });

    expect(result).toEqual([2, 4, 6]);
  });

  it('takes ONE app snapshot for a handler that throws, not one per layer', () => {
    const snapshot = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(snapshot)],
    });

    TestBed.runInInjectionContext(() => {
      subscribe(
        of(1).pipe(
          map(() => {
            throw new Error('handler bug');
          }),
        ),
        { error: () => undefined },
      );
    });

    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('takes an app snapshot for a defect raised by a source', () => {
    const snapshot = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTakeAppSnapshot(snapshot)],
    });
    const failing = createCraftStream<number>((_context, sink) => {
      sink.error(new Error('source defect'));
    });

    TestBed.runInInjectionContext(() => {
      subscribe(failing, { error: () => undefined });
    });

    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
