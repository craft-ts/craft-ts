import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
  CRAFT_REGISTRATION_TARGET,
  createRegisterForRegistry,
} from './craft-register-for-runtime';
import {
  provideServiceYieldWrapper,
  runCraftGenerator,
  SERVICE_YIELD_REQUEST_MARKER,
} from './craft-generator-runtime';

describe('craftRegisterFor runtime', () => {
  it('publishes a group and removes it when its cleanup runs', () => {
    const registry = createRegisterForRegistry(
      [
        {
          key: 'Counter',
          matches: (candidate) =>
            typeof candidate === 'object' &&
            candidate !== null &&
            Reflect.get(candidate, 'kind') === 'service' &&
            Reflect.get(candidate, 'name') === 'Counter',
        },
      ],
      { includeGlobal: true },
    );
    const counter = { increment: () => undefined };

    expect(registry.signalFor('Counter')()).toBeUndefined();
    const cleanup = registry.registerService(
      'Counter',
      counter,
      'service:Counter#1',
      'toProvide',
    );
    expect(registry.signalFor('Counter')()).toEqual([
      { hostName: 'service:Counter#1', ref: counter },
    ]);

    cleanup();
    expect(registry.signalFor('Counter')()).toBeUndefined();
  });

  it('deduplicates repeated resolution of the same reference', () => {
    const registry = createRegisterForRegistry(
      [{ key: 'Counter', matches: () => true }],
      { includeGlobal: true },
    );
    const counter = {};

    registry.registerService('Counter', counter, 'service:Counter#1');
    registry.registerService('Counter', counter, 'service:Counter#1');

    expect(registry.signalFor('Counter')()?.length).toBe(1);
  });

  it('can exclude global services', () => {
    const registry = createRegisterForRegistry(
      [{ key: 'Counter', matches: () => true }],
      { includeGlobal: false },
    );

    registry.registerService('Counter', {}, 'service:Counter#1', 'global');

    expect(registry.signalFor('Counter')()).toBeUndefined();
  });

  it('wraps each service yield with its service metadata', () => {
    const seen: string[] = [];
    const injector = Injector.create({
      providers: [
        provideServiceYieldWrapper(
          'test service yield wrapper',
          function* (context, next) {
            seen.push(`${context.name}:${context.scope}`);
            return yield* next();
          },
        ),
      ],
    });

    function* source(): Generator<unknown, unknown, unknown> {
      return yield {
        [SERVICE_YIELD_REQUEST_MARKER]: true,
        name: 'Counter',
        scope: 'toProvide',
        resolve: () => 'counter',
      };
    }

    expect(
      runCraftGenerator({
        iterator: source(),
        injector,
        hostScope: 'function',
        invalidYieldErrorMessage: 'invalid',
        multipleAppStartErrorMessage: 'multiple',
      }).value,
    ).toBe('counter');
    expect(seen).toEqual(['Counter:toProvide']);
  });

  it('matches Craft targets by object identity', () => {
    const target = () => undefined;
    Object.defineProperty(target, CRAFT_REGISTRATION_TARGET, {
      value: { kind: 'component', name: 'Child' },
    });
    const registry = createRegisterForRegistry(
      [{ key: 'Child', matches: (candidate) => candidate === target }],
      { includeGlobal: true },
    );
    const context = {};

    registry.registerTarget(target, context, 'component:Child#1');
    expect(registry.signalFor('Child')()).toEqual([
      { hostName: 'component:Child#1', ref: context },
    ]);
  });
});
