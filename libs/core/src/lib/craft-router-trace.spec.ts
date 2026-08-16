// @vitest-environment jsdom
import '@angular/compiler';
import {
  APP_INITIALIZER,
  createEnvironmentInjector,
  getPlatform,
  Injector,
  runInInjectionContext,
  type EnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { beforeAll, describe, expect, it } from 'vitest';
import { CRAFT_ROUTER, provideCraftRouter } from './craft-router';
import {
  CRAFT_ROUTER_TRACE,
  executeCraftRouterTrace,
  provideCraftRouterTrace,
  type CraftRouterTraceContext,
} from './craft-router-trace';

const context: CraftRouterTraceContext = {
  kind: 'routeStage',
  phase: 'run',
  stage: 'guard',
  routePhase: 'enter',
  url: '/demo',
};

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

function runAppInitializers(injector: EnvironmentInjector): void {
  const initializers = injector.get(APP_INITIALIZER, []);
  for (const initializer of initializers) {
    runInInjectionContext(injector, initializer);
  }
}

describe('craft router trace', () => {
  it('composes router trace wrappers in registration order', () => {
    const calls: string[] = [];

    const injector = Injector.create({
      providers: [
        {
          provide: CRAFT_ROUTER_TRACE,
          multi: true,
          useValue: (_trace: CraftRouterTraceContext, next: () => unknown) => {
            calls.push('outer:start');
            const result = next();
            calls.push('outer:end');
            return result;
          },
        },
        {
          provide: CRAFT_ROUTER_TRACE,
          multi: true,
          useValue: (_trace: CraftRouterTraceContext, next: () => unknown) => {
            calls.push('inner:start');
            const result = next();
            calls.push('inner:end');
            return result;
          },
        },
      ],
    });

    const result = executeCraftRouterTrace(injector, context, () => 'rendered');

    expect(result).toBe('rendered');
    expect(calls).toEqual([
      'outer:start',
      'inner:start',
      'inner:end',
      'outer:end',
    ]);
  });

  it('boots without Angular Router and traces Craft navigation events', async () => {
    const traces: CraftRouterTraceContext[] = [];
    const injector = createEnvironmentInjector(
      [
        provideCraftRouter([]),
        provideCraftRouterTrace((traceContext, next) => {
          traces.push(traceContext);
          return next();
        }),
      ],
      getPlatform()!.injector as EnvironmentInjector,
    );

    expect(() => injector.get(Router)).toThrowError(
      /No provider found for `Router`/,
    );
    expect(() => runAppInitializers(injector)).not.toThrow();

    const router = injector.get(CRAFT_ROUTER);
    await router.navigateByUrl('/home');

    const events = traces.filter((trace) => trace.kind === 'routerEvent');
    expect(events.map((event) => event.eventName)).toEqual([
      'NavigationStart',
      'NavigationEnd',
    ]);
    expect(events.map((event) => event.url)).toEqual(['/home', '/home']);
  });

  it('does not throw when Craft router is absent', () => {
    const injector = createEnvironmentInjector(
      [provideCraftRouterTrace((_traceContext, next) => next())],
      getPlatform()!.injector as EnvironmentInjector,
    );

    expect(() => runAppInitializers(injector)).not.toThrow();
  });
});
