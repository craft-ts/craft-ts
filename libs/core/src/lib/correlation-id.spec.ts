import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CORRELATION_ID_SERVICE,
  CorrelationId,
  createCorrelationIdService,
  getCurrentStartCorrelationId,
  injectCorrelationIdService,
  setCurrentStartCorrelationId,
  type CorrelationIdYield,
} from './correlation-id';

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
  afterEach(() => {
    setCurrentStartCorrelationId(null);
  });

  it('yields a service request and resolves metadata from the injected service', () => {
    const service = createCorrelationIdService();
    service.generateAndSet('click');
    const injector = Injector.create({
      providers: [{ provide: CORRELATION_ID_SERVICE, useValue: service }],
    });

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
  beforeAll(() => {
    try {
      TestBed.initTestEnvironment(
        BrowserTestingModule,
        platformBrowserTesting(),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes(
          'Cannot set base providers because it has already been called',
        )
      ) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns null by default (no provider registered)', () => {
    TestBed.configureTestingModule({});
    const result = TestBed.runInInjectionContext(() =>
      injectCorrelationIdService(),
    );
    expect(result).toBeNull();
  });

  it('returns the registered service', () => {
    const service = createCorrelationIdService();
    const injector = Injector.create({
      providers: [{ provide: CORRELATION_ID_SERVICE, useValue: service }],
    });
    const result = runInInjectionContext(injector, () =>
      injectCorrelationIdService(),
    );
    expect(result).toBe(service);
  });
});
