import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPONENT_MONITORING,
  componentMonitoring,
  provideComponentMonitoring,
} from './component-monitoring';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';

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

describe('componentMonitoring', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('is a no-op by default (no provider registered)', () => {
    TestBed.configureTestingModule({});
    expect(() =>
      TestBed.runInInjectionContext(() => componentMonitoring()),
    ).not.toThrow();
  });

  it('calls a sync monitor factory registered via provideComponentMonitoring', () => {
    let called = false;
    TestBed.configureTestingModule({
      providers: [provideComponentMonitoring(() => {
        called = true;
      })],
    });
    TestBed.runInInjectionContext(() => componentMonitoring());
    expect(called).toBe(true);
  });

  it('drives a generator monitor factory through the craft generator runtime', () => {
    const resolvedValues: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideComponentMonitoring(function* (): Generator<
          unknown,
          void,
          unknown
        > {
          const value = yield {
            [SERVICE_YIELD_REQUEST_MARKER]: true,
            scope: 'function',
            resolve: () => 'monitored',
          };
          resolvedValues.push(value);
        }),
      ],
    });
    TestBed.runInInjectionContext(() => componentMonitoring());
    expect(resolvedValues).toEqual(['monitored']);
  });

  it('throws when called outside an injection context', () => {
    expect(() => componentMonitoring()).toThrow();
  });
});

describe('provideComponentMonitoring', () => {
  it('returns a Provider for the COMPONENT_MONITORING token', () => {
    const fn = () => undefined;
    const provider = provideComponentMonitoring(fn);
    expect(provider).toEqual({ provide: COMPONENT_MONITORING, useValue: fn });
  });
});
