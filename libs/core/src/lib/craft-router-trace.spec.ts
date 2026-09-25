// @vitest-environment jsdom
import { createCraftInjector } from './host/craft-injector';
import {
  APP_INITIALIZER,
  createEnvironmentInjector,
  Injector,
  runInInjectionContext,
  type EnvironmentInjector,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, describe, expect, it } from 'vitest';
import { CraftRouter, provideCraftRouter } from './craft-router';
import { ɵinjectCraftRouterRuntime, provideCraftRouterRuntimeValue } from './craft-router-tokens';
import {
  executeCraftRouterTrace,
  provideCraftRouterTrace,
  type CraftRouterTraceContext,
} from './craft-router-trace';
import { craftUse } from './craft-use';

const context: CraftRouterTraceContext = {
  kind: 'routeStage',
  phase: 'run',
  stage: 'guard',
  routePhase: 'enter',
  url: '/demo',
};

function runAppInitializers(injector: EnvironmentInjector): void {
  const initializers = injector.get(APP_INITIALIZER, []);
  for (const initializer of initializers) {
    runInInjectionContext(injector, initializer);
  }
}

describe('craft router trace', () => {
  it('composes router trace wrappers in registration order', () => {
    const calls: string[] = [];

    const injector = createEnvironmentInjector([
        provideCraftRouterTrace((_trace: CraftRouterTraceContext, next: () => unknown) => {
            calls.push('outer:start');
            const result = next();
            calls.push('outer:end');
            return result;
          }),
        provideCraftRouterTrace((_trace: CraftRouterTraceContext, next: () => unknown) => {
            calls.push('inner:start');
            const result = next();
            calls.push('inner:end');
            return result;
          }),
      ], createCraftInjector([]));

    const result = executeCraftRouterTrace(injector, context, () => 'rendered');

    expect(result).toBe('rendered');
    expect(calls).toEqual([
      'outer:start',
      'inner:start',
      'inner:end',
      'outer:end',
    ]);
  });

  it('boots standalone and traces Craft navigation events', async () => {
    const traces: CraftRouterTraceContext[] = [];
    const injector = createEnvironmentInjector(
      [
        provideCraftRouter([]),
        provideCraftRouterTrace((traceContext, next) => {
          traces.push(traceContext);
          return next();
        }),
      ],
      createCraftInjector([]),
    );

    expect(() => runAppInitializers(injector)).not.toThrow();

    const router = runInInjectionContext(injector, () => craftUse(CraftRouter()));
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
      createCraftInjector([]),
    );

    expect(() => runAppInitializers(injector)).not.toThrow();
  });
});
