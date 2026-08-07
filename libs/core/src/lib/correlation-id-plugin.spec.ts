import '@angular/compiler';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { provideCorrelationIdTracking } from './correlation-id-plugin';
import { CORRELATION_ID_SERVICE } from './correlation-id';
import { CRAFT_DOM_EVENT_HOOK } from './dom-event-hook';
import { FN_WRAPPER } from './fn-wrapper';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
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
    const wrappers = TestBed.runInInjectionContext(() => TestBed.inject(FN_WRAPPER));
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
    const [wrapper] = TestBed.runInInjectionContext(() => TestBed.inject(FN_WRAPPER));
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
});
