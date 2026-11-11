import { Injector } from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provideCorrelationIdTracking } from './correlation-id-plugin';
import {
  CorrelationId,
  ɵcorrelationIdForDomEvent,
  getCurrentStartCorrelationId,
  injectCorrelationIdService,
} from './correlation-id';
import { craftService } from './craft-service';
import { craftUse } from './craft-use';
import { state } from './state';
import { VirtualCraftTemporalRuntime } from './temporal-runtime';
import { craftWatch } from './host/craft-signal';
import { ɵinjectCraftDomEventHooks } from './dom-event-hook';
import { FN_WRAPPER, provideFnWrapper, type FnWrapper } from './fn-wrapper';

describe('provideCorrelationIdTracking', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  it('provides a non-null CORRELATION_ID_SERVICE', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    expect(service).not.toBeNull();
    expect(typeof service?.generateAndSet).toBe('function');
  });

  it('registers a FN_WRAPPER that captures the start correlation id', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const wrappers = CraftTestBed.runInInjectionContext(
      () => CraftTestBed.inject(FN_WRAPPER) as readonly FnWrapper[],
    );
    expect(wrappers.length).toBe(1);
  });

  it('registers correlation tracking as a Craft DOM event hook', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const hooks = CraftTestBed.runInInjectionContext(() =>
      ɵinjectCraftDomEventHooks(),
    );
    expect(hooks).toHaveLength(1);
  });

  it('uses one fresh correlation id for each native DOM event', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    const first = new Event('click');
    const second = new Event('click');

    const firstId = ɵcorrelationIdForDomEvent(first, service, 'button:click');
    expect(ɵcorrelationIdForDomEvent(first, service, 'button:click')).toBe(
      firstId,
    );
    const secondId = ɵcorrelationIdForDomEvent(second, service, 'button:click');

    expect(firstId).toMatch(/^button:click:/);
    expect(secondId).toMatch(/^button:click:/);
    expect(secondId).not.toBe(firstId);
    expect(service?.lastCorrelationId()).toBe(secondId);
  });

  it('FN_WRAPPER drives the wrapped generator through to completion', async () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = CraftTestBed.runInInjectionContext(
      () => CraftTestBed.inject(FN_WRAPPER) as readonly FnWrapper[],
    );
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    service?.generateAndSet('click');

    function* inner(): Generator<unknown, string, unknown> {
      return 'inner-result';
    }

    const iterator = wrapper(inner as never, undefined, []);
    let current = iterator.next();
    // Drain any service yield requests the wrapper itself issues.
    while (!current.done) {
      current = iterator.next(service ?? null);
    }
    expect(current.value).toBe('inner-result');
  });

  it('gives the start id back while the wrapped generator is suspended', () => {
    // A cart sync suspended on its request kept the click as the start id of
    // everything that ran meanwhile: each tick of a countdown was recorded as
    // that click's, until the request came back.
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = CraftTestBed.runInInjectionContext(
      () => CraftTestBed.inject(FN_WRAPPER) as readonly FnWrapper[],
    );
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    const click = service?.generateAndSet('click');
    const seen: Array<string | null> = [];
    const pending = { awaiting: 'the server' };

    function* inner(): Generator<unknown, string, unknown> {
      seen.push(getCurrentStartCorrelationId());
      const answer = yield pending;
      seen.push(getCurrentStartCorrelationId());
      return `done with ${String(answer)}`;
    }

    const iterator = wrapper(inner as never, undefined, []);
    let current = iterator.next();
    while (!current.done && current.value !== pending) current = iterator.next(service ?? null);
    expect(current.value).toBe(pending);
    // Suspended: whatever runs now is not the click's.
    expect(getCurrentStartCorrelationId()).toBeNull();
    service?.generateAndSet('enter');

    current = iterator.next('the answer');
    expect(current).toEqual({ done: true, value: 'done with the answer' });
    expect(seen).toEqual([click, click]);
    expect(getCurrentStartCorrelationId()).toBeNull();
  });

  it('gives the start id back when the wrapped generator throws or is closed', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = CraftTestBed.runInInjectionContext(
      () => CraftTestBed.inject(FN_WRAPPER) as readonly FnWrapper[],
    );
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    service?.generateAndSet('click');
    const pending = {};
    const cleanup: Array<string | null> = [];

    function* inner(): Generator<unknown, string, unknown> {
      try {
        yield pending;
        return 'unreached';
      } finally {
        cleanup.push(getCurrentStartCorrelationId());
      }
    }
    const start = (): Generator<unknown, unknown, unknown> => {
      const iterator = wrapper(inner as never, undefined, []);
      let current = iterator.next();
      while (!current.done && current.value !== pending) current = iterator.next(service ?? null);
      return iterator;
    };

    const failing = start();
    expect(() => failing.throw(new Error('request failed'))).toThrow('request failed');
    expect(getCurrentStartCorrelationId()).toBeNull();

    const closed = start();
    expect(closed.return('closed')).toEqual({ done: true, value: 'closed' });
    expect(getCurrentStartCorrelationId()).toBeNull();
    expect(cleanup).toEqual([service?.lastCorrelationId(), service?.lastCorrelationId()]);
  });

  // This wrapper runs inside EVERY craft factory execution, template bindings
  // included. A tracked read of `lastCorrelationId` here subscribes every
  // binding in the application to it — and the DOM event hook writes it on
  // every interaction, so one click re-runs every binding on the page
  // regardless of its real dependencies. Measured on the 256-cell /pixel-art
  // demo before the fix: one click re-ran 262 style bindings and cost 227 ms;
  // after, it re-runs 1 and costs 4 ms.
  it('does not subscribe its caller to the correlation id signal', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = CraftTestBed.runInInjectionContext(
      () => CraftTestBed.inject(FN_WRAPPER) as readonly FnWrapper[],
    );
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );

    function* inner(): Generator<unknown, string, unknown> {
      return 'inner-result';
    }

    let runs = 0;
    const watch = craftWatch(() => {
      runs += 1;
      const iterator = wrapper(inner as never, undefined, []);
      let current = iterator.next();
      while (!current.done) {
        current = iterator.next(service ?? null);
      }
    });

    expect(runs).toBe(1);
    service?.generateAndSet('click');
    expect(runs).toBe(1);

    watch.destroy();
  });

  it('reading CorrelationId() metadata does not subscribe the reader', () => {
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const injector = CraftTestBed.runInInjectionContext(() =>
      CraftTestBed.inject(Injector),
    );
    const service = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );

    let runs = 0;
    const watch = craftWatch(() => {
      runs += 1;
      const iterator = CorrelationId();
      const request = iterator.next().value as unknown as {
        resolve: (injector: Injector) => unknown;
      };
      request.resolve(injector);
    });

    expect(runs).toBe(1);
    service?.generateAndSet('click');
    expect(runs).toBe(1);

    watch.destroy();
  });
});

describe('the flow of a scheduled call, as a recorder reads it', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  it('records the tick of a global countdown first needed by a click as no click', async () => {
    const clock = new VirtualCraftTemporalRuntime();
    const starts: Array<string | null> = [];
    const recorder: FnWrapper = function* (factory, thisArg, args) {
      starts.push(getCurrentStartCorrelationId());
      return yield* factory.apply(thisArg, args);
    };
    const { RecordedCountdown } = craftService({ name: 'RecordedCountdown', providedIn: 'global' }, function* () {
      const now = yield* state('now', 0, ({ set }) => ({ tick: (value: number) => set(value) }));
      const tick = () => {
        now.tick(clock.now());
        clock.schedule(tick, 1_000);
      };
      clock.schedule(tick, 1_000);
    });
    CraftTestBed.configureTestingModule({
      providers: [
        provideCorrelationIdTracking(),
        provideFnWrapper('Warning: dependency injection here is not type-safe and may fail at runtime', recorder),
      ],
    });
    const service = CraftTestBed.runInInjectionContext(() => injectCorrelationIdService());
    service?.generateAndSet('click');
    CraftTestBed.runInInjectionContext(() => craftUse(RecordedCountdown()));
    starts.length = 0;

    await clock.advanceTo(2_000);

    expect(starts.length).toBeGreaterThan(0);
    expect(new Set(starts)).toEqual(new Set([null]));
  });
});
