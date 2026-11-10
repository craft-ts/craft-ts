import {
  computed,
  Injector,
  runInInjectionContext,
} from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CorrelationId,
  createCorrelationIdService,
  getCurrentStartCorrelationId,
  injectCorrelationIdService,
  provideCorrelationIdService,
  setCurrentStartCorrelationId,
  type CorrelationIdYield,
  ɵcurrentCorrelationId,
} from './correlation-id';
import { VirtualCraftTemporalRuntime } from './temporal-runtime';

describe('createCorrelationIdService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generateAndSet prefixes the id and updates lastCorrelationId', () => {
    const service = createCorrelationIdService();
    const id = service.generateAndSet('click');
    expect(id.startsWith('click:')).toBe(true);
    expect(service.lastCorrelationId()).toBe(id);
  });

  it('reads the current id without making a computation depend on it', () => {
    // A render that tracked it ran again on the next key, before its handler,
    // and wrote the field's old value over the key just typed.
    const service = createCorrelationIdService();
    service.generateAndSet('click');
    let runs = 0;
    const recorded = computed(() => {
      runs += 1;
      return ɵcurrentCorrelationId(service);
    });
    const first = recorded();
    service.generateAndSet('enter');
    expect(recorded()).toBe(first);
    expect(runs).toBe(1);
    expect(ɵcurrentCorrelationId(null)).toBeUndefined();
  });

  it('generates distinct ids on successive calls', () => {
    const service = createCorrelationIdService();
    const first = service.generateAndSet('click');
    const second = service.generateAndSet('enter');
    expect(first).not.toBe(second);
  });

  it('startOperation adds the id to mayCorrelatedIds', () => {
    const service = createCorrelationIdService();
    service.startOperation('op-1');
    expect(service.mayCorrelatedIds()).toEqual(['op-1']);
  });

  it('endOperation removes the id from mayCorrelatedIds after the debounce delay', async () => {
    const service = createCorrelationIdService();
    service.startOperation('op-1');
    service.endOperation('op-1');

    expect(service.mayCorrelatedIds()).toEqual(['op-1']);
    await vi.advanceTimersByTimeAsync(500);
    expect(service.mayCorrelatedIds()).toEqual([]);
  });

  it('a fresh startOperation before the debounce fires cancels the pending removal', async () => {
    const service = createCorrelationIdService();
    service.startOperation('op-1');
    service.endOperation('op-1');

    await vi.advanceTimersByTimeAsync(200);
    service.startOperation('op-1');
    await vi.advanceTimersByTimeAsync(500);

    expect(service.mayCorrelatedIds()).toEqual(['op-1']);
  });

  it('tracks multiple in-flight ids independently', async () => {
    const service = createCorrelationIdService();
    service.startOperation('op-1');
    service.startOperation('op-2');
    service.endOperation('op-1');

    await vi.advanceTimersByTimeAsync(500);
    expect(service.mayCorrelatedIds()).toEqual(['op-2']);
  });

  it('runs a scheduled callback in the flow that scheduled it, not the last click', async () => {
    // A countdown started at load ticks after every click: its writes were
    // recorded as the click's.
    const service = createCorrelationIdService();
    const clock = new VirtualCraftTemporalRuntime();
    const seen: Array<string | undefined> = [];
    const tick = () => {
      seen.push(ɵcurrentCorrelationId(service));
      clock.schedule(tick, 1_000);
    };
    clock.schedule(tick, 1_000);
    const click = service.generateAndSet('click');
    clock.schedule(() => seen.push(ɵcurrentCorrelationId(service)), 1_500);
    const later = service.generateAndSet('enter');

    await clock.advanceTo(2_000);

    expect(seen).toEqual([undefined, click, undefined]);
    expect(service.lastCorrelationId()).toBe(later);
  });
});

describe('setCurrentStartCorrelationId / getCurrentStartCorrelationId', () => {
  afterEach(() => {
    setCurrentStartCorrelationId(null);
  });

  it('stores and retrieves the module-level start correlation id', () => {
    expect(getCurrentStartCorrelationId()).toBeNull();
    setCurrentStartCorrelationId('click:abc');
    expect(getCurrentStartCorrelationId()).toBe('click:abc');
  });

  it('can be reset to null', () => {
    setCurrentStartCorrelationId('click:abc');
    setCurrentStartCorrelationId(null);
    expect(getCurrentStartCorrelationId()).toBeNull();
  });
});

describe('CorrelationId', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  afterEach(() => {
    setCurrentStartCorrelationId(null);
  });

  it('yields a service request and resolves metadata from the injected service', () => {
    const service = createCorrelationIdService();
    service.generateAndSet('click');
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdService(service)],
    });
    const injector = CraftTestBed.inject(Injector);

    setCurrentStartCorrelationId('nav-forward:start');

    const iterator = CorrelationId();
    const first = iterator.next();
    expect(first.done).toBe(false);
    const yielded = first.value as CorrelationIdYield;
    const resolved = yielded.resolve(injector, 'function');
    const second = iterator.next(resolved);

    expect(second).toEqual({
      done: true,
      value: {
        lastCorrelationId: service.lastCorrelationId(),
        mayCorrelatedIds: service.mayCorrelatedIds(),
        startCorrelationId: 'nav-forward:start',
      },
    });
  });

  it('resolves with nulls when no correlation id service is registered', () => {
    const injector = Injector.create({ providers: [] });
    const iterator = CorrelationId();
    const first = iterator.next();
    const yielded = first.value as CorrelationIdYield;
    const resolved = yielded.resolve(injector, 'function');
    expect(resolved.lastCorrelationId).toBeNull();
    expect(resolved.mayCorrelatedIds).toEqual([]);
  });
});

describe('injectCorrelationIdService', () => {
    beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  it('returns null by default (no provider registered)', () => {
    CraftTestBed.configureTestingModule({});
    const result = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    expect(result).toBeNull();
  });

  it('returns the registered service', () => {
    const service = createCorrelationIdService();
    CraftTestBed.configureTestingModule({
      providers: [provideCorrelationIdService(service)],
    });
    const result = CraftTestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    expect(result).toBe(service);
  });
});
