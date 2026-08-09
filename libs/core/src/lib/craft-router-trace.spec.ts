import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
  CRAFT_ROUTER_TRACE,
  executeCraftRouterTrace,
  type CraftRouterTraceContext,
} from './craft-router-trace';

const context: CraftRouterTraceContext = {
  kind: 'routeStage',
  phase: 'run',
  stage: 'guard',
  routePhase: 'enter',
  url: '/demo',
};

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
});
