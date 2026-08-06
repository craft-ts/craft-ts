import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import {
  CRAFT_REGISTRATION_TARGET,
  createRegisterForRegistry,
  REGISTER_FOR_REGISTRY,
  ɵregisterCraftTarget,
  type RegisterForSignal,
} from './craft-register-for-runtime';
import { craftRegisterFor } from './craft-register-for';
import {
  provideServiceYieldWrapper,
  runCraftGenerator,
  SERVICE_YIELD_REQUEST_MARKER,
} from './craft-generator-runtime';
import { provideCraftTargetWrapper } from './craft-target-runtime';

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

  it('runs Craft target wrappers and forwards context overrides', () => {
    const target = (() => undefined) as unknown as {
      readonly [CRAFT_REGISTRATION_TARGET]: {
        readonly kind: 'component';
        readonly name: 'Child';
      };
    };
    Object.defineProperty(target, CRAFT_REGISTRATION_TARGET, {
      value: { kind: 'component', name: 'Child' },
    });

    const seen: string[] = [];
    const injector = Injector.create({
      providers: [
        provideCraftTargetWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (context, next) {
            seen.push(`outer:${context.hostName}`);
            const dependency = yield {
              [SERVICE_YIELD_REQUEST_MARKER]: true,
              name: 'TargetTagService',
              scope: 'function',
              resolve: () => 'tag',
            };
            seen.push(`dependency:${dependency}`);
            const release = yield* next({
              hostName: `tagged:${context.hostName}`,
            });
            return () => {
              release();
              seen.push('released');
            };
          },
        ),
        provideCraftTargetWrapper(
          'Warning: dependency injection here is not type-safe and may fail at runtime',
          function* (context, next) {
            seen.push(`inner:${context.hostName}`);
            return yield* next();
          },
        ),
      ],
    });

    const release = ɵregisterCraftTarget(
      injector,
      target,
      {},
      'component:Child#1',
      false,
    );

    expect(seen).toEqual([
      'outer:component:Child#1',
      'dependency:tag',
      'inner:tagged:component:Child#1',
    ]);

    release();
    expect(seen).toEqual([
      'outer:component:Child#1',
      'dependency:tag',
      'inner:tagged:component:Child#1',
      'released',
    ]);
  });

  it('supports partial exposure through the live group signal', () => {
    const target = (() => undefined) as unknown as {
      readonly [CRAFT_REGISTRATION_TARGET]: {
        readonly kind: 'component';
        readonly name: 'Child';
        readonly instance: unknown;
      };
    };
    Object.defineProperty(target, CRAFT_REGISTRATION_TARGET, {
      value: { kind: 'component', name: 'Child' },
    });

    const { RegisterForChild, provideRegisterForChild } = craftRegisterFor(
      'Child',
      [target],
      ({ Child }) => ({
        total: () => Child()?.length ?? 0,
      }),
    );
    const injector = Injector.create({
      providers: [provideRegisterForChild()],
    });
    const child = {};
    const release = ɵregisterCraftTarget(
      injector,
      target,
      child,
      'component:Child#1',
      false,
    );

    const exposed = runInInjectionContext(
      injector,
      () =>
        runCraftGenerator({
          iterator: (function* () {
            return yield* RegisterForChild(undefined, ({ $self }) => ({
              total: () => $self()?.length ?? 0,
            }));
          })(),
          injector,
          hostScope: 'function',
          invalidYieldErrorMessage: 'invalid',
          multipleAppStartErrorMessage: 'multiple',
        }).value,
    );

    expect(exposed).toEqual({ total: expect.any(Function) });
    expect((exposed as { total: () => number }).total()).toBe(1);

    const direct = runInInjectionContext(
      injector,
      () =>
        runCraftGenerator({
          iterator: (function* () {
            return yield* RegisterForChild();
          })(),
          injector,
          hostScope: 'function',
          invalidYieldErrorMessage: 'invalid',
          multipleAppStartErrorMessage: 'multiple',
        }).value,
    ) as RegisterForSignal<unknown> & { total: () => number };

    expect(direct()).toHaveLength(1);
    expect(direct.total()).toBe(1);

    const derived = runInInjectionContext(
      injector,
      () =>
        runCraftGenerator({
          iterator: (function* () {
            return yield* RegisterForChild.total();
          })(),
          injector,
          hostScope: 'function',
          invalidYieldErrorMessage: 'invalid',
          multipleAppStartErrorMessage: 'multiple',
        }).value,
    );

    expect(derived).toBeInstanceOf(Function);
    expect((derived as () => number)()).toBe(1);

    release();
    expect(direct()).toBeUndefined();
    expect(direct.total()).toBe(0);
  });

  it('keeps multiple named registries independent in one injector', () => {
    const target = (() => undefined) as unknown as {
      readonly [CRAFT_REGISTRATION_TARGET]: {
        readonly kind: 'component';
        readonly name: 'Child';
        readonly instance: unknown;
      };
    };
    Object.defineProperty(target, CRAFT_REGISTRATION_TARGET, {
      value: { kind: 'component', name: 'Child' },
    });

    const first = craftRegisterFor('First', [target]);
    const second = craftRegisterFor('Second', [target]);
    const injector = Injector.create({
      providers: [
        first.provideRegisterForFirst(),
        second.provideRegisterForSecond(),
      ],
    });
    const release = ɵregisterCraftTarget(
      injector,
      target,
      {},
      'component:Child#1',
      false,
    );
    const registries = injector.get(REGISTER_FOR_REGISTRY);
    expect(registries).toHaveLength(2);
    expect(registries[0]!.signalFor('Child')()).toHaveLength(1);
    expect(registries[1]!.signalFor('Child')()).toHaveLength(1);

    release();
    expect(registries[0]!.signalFor('Child')()).toBeUndefined();
    expect(registries[1]!.signalFor('Child')()).toBeUndefined();
  });
});
