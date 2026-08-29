import { Injector } from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provideCorrelationIdTracking } from './correlation-id-plugin';
import { CorrelationId, CORRELATION_ID_SERVICE } from './correlation-id';
import { craftWatch } from './host/craft-signal';
import { CRAFT_DOM_EVENT_HOOK } from './dom-event-hook';
import { FN_WRAPPER } from './fn-wrapper';

describe('provideCorrelationIdTracking', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('provides a non-null CORRELATION_ID_SERVICE', () => {
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const service = TestBed.runInInjectionContext(() =>
      Injector.create({
        providers: [],
        parent: TestBed.inject(Injector),
      }).get(CORRELATION_ID_SERVICE),
    );
    expect(service).not.toBeNull();
    expect(typeof service?.generateAndSet).toBe('function');
  });

  it('registers a FN_WRAPPER that captures the start correlation id', () => {
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const wrappers = TestBed.runInInjectionContext(() =>
      TestBed.inject(FN_WRAPPER),
    );
    expect(wrappers.length).toBe(1);
  });

  it('registers correlation tracking as a Craft DOM event hook', () => {
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const hooks = TestBed.runInInjectionContext(() =>
      TestBed.inject(CRAFT_DOM_EVENT_HOOK),
    );
    expect(hooks).toHaveLength(1);
  });

  it('FN_WRAPPER drives the wrapped generator through to completion', async () => {
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = TestBed.runInInjectionContext(() =>
      TestBed.inject(FN_WRAPPER),
    );
    const service = TestBed.runInInjectionContext(() =>
      TestBed.inject(CORRELATION_ID_SERVICE),
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

  // This wrapper runs inside EVERY craft factory execution, template bindings
  // included. A tracked read of `lastCorrelationId` here subscribes every
  // binding in the application to it — and the DOM event hook writes it on
  // every interaction, so one click re-runs every binding on the page
  // regardless of its real dependencies. Measured on the 256-cell /pixel-art
  // demo before the fix: one click re-ran 262 style bindings and cost 227 ms;
  // after, it re-runs 1 and costs 4 ms.
  it('does not subscribe its caller to the correlation id signal', () => {
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const [wrapper] = TestBed.runInInjectionContext(() =>
      TestBed.inject(FN_WRAPPER),
    );
    const service = TestBed.runInInjectionContext(() =>
      TestBed.inject(CORRELATION_ID_SERVICE),
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
    TestBed.configureTestingModule({
      providers: [provideCorrelationIdTracking()],
    });
    const injector = TestBed.runInInjectionContext(() =>
      TestBed.inject(Injector),
    );
    const service = TestBed.runInInjectionContext(() =>
      TestBed.inject(CORRELATION_ID_SERVICE),
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
