// @vitest-environment jsdom
import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  runInInjectionContext as runInAngularInjectionContext,
  signal,
  type EffectCleanupRegisterFn,
} from '@angular/core';
import { describe, expect, it } from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { craftEffect } from './craft-effect';
import {
  craftService,
  onAppStart,
  type GetServiceDependencies,
} from './craft-service';
import { query } from './query';
import {
  APP_SNAPSHOT_REGISTRY,
  AppSnapshotRegistry,
  type ActiveEffectReport,
} from './take-app-snapshot';
import { craftSignal } from './host/craft-signal';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from './setup-craft-service-test';

let lastInjector: ReturnType<typeof setupCraftServiceTest>['injector'];
const runInInjectionContext = <T>(fn: () => T): T => lastInjector.run(fn);
const flushHost = () => flushCraftTest(lastInjector);

function hostEnvironmentInjector(): EnvironmentInjector {
  return lastInjector.run(() => inject(EnvironmentInjector));
}

describe('craftEffect', () => {
  beforeEach(() => {
    lastInjector = setupCraftServiceTest().injector;
  });


  it('should require an injection context', async () => {
    class OutsideInjectionContext {
      readonly fx = craftEffect('outside', () => {
        /* noop */
      });
    }

    expect(() => new OutsideInjectionContext()).toThrow();
  });

  it('should run a plain effect function reactively', async () => {
    class Component {
      readonly count = signal(0);
      readonly seen: number[] = [];
      readonly fx = craftEffect('observe', () => {
        this.seen.push(this.count());
      });
    }

    const component = runInInjectionContext(() => new Component());

    flushHost();
    expect(component.seen).toEqual([0]);

    component.count.set(1);
    flushHost();
    expect(component.seen).toEqual([0, 1]);
  });

  it('tracks Angular and Craft signal dependencies together', async () => {
    const angularCount = signal(0);
    const craftCount = craftSignal(0);
    const seen: number[] = [];

    runInInjectionContext(() =>
      craftEffect('mixed', () => {
        seen.push(angularCount() + craftCount());
      }),
    );

    flushHost();
    expect(seen).toEqual([0]);
    angularCount.set(1);
    flushHost();
    expect(seen).toEqual([0, 1]);

    craftCount.set(2);
    flushHost();
    expect(seen).toEqual([0, 1, 3]);
  });

  it('retraces conditional Angular dependencies after a Craft-triggered run', async () => {
    const useSecond = craftSignal(false);
    const first = signal('first');
    const second = signal('second');
    const seen: string[] = [];

    runInInjectionContext(() =>
      craftEffect('conditional-mixed', () => {
        seen.push(useSecond() ? second() : first());
      }),
    );

    flushHost();
    expect(seen).toEqual(['first']);

    useSecond.set(true);
    flushHost();
    expect(seen).toEqual(['first', 'second']);

    second.set('updated');
    flushHost();

    expect(seen).toEqual(['first', 'second', 'updated']);
  });

  it('uses the injector option as the effect owner', async () => {
    const source = craftSignal(0);
    const seen: number[] = [];
    const owner = createEnvironmentInjector([], hostEnvironmentInjector());

    runInInjectionContext(() =>
      craftEffect(
        'custom-owner',
        () => {
          seen.push(source());
        },
        { injector: owner },
      ),
    );
    flushHost();
    source.set(1);
    flushHost();
    expect(seen).toEqual([0, 1]);

    owner.destroy();
    source.set(2);

    expect(seen).toEqual([0, 1]);
  });

  it('stops with its owning DestroyRef', async () => {
    const source = craftSignal(0);
    const seen: number[] = [];
    const injector = createEnvironmentInjector([], hostEnvironmentInjector());

    runInAngularInjectionContext(injector, () =>
      craftEffect('destroyed', () => {
        seen.push(source());
      }),
    );
    flushHost();
    source.set(1);
    flushHost();
    expect(seen).toEqual([0, 1]);

    injector.destroy();
    source.set(2);

    expect(seen).toEqual([0, 1]);
  });

  it('should run a generator factory that resolves DI deps once and returns the effect body', async () => {
    const { EffectMultiplier } = craftService(
      { name: 'EffectMultiplier', scope: 'function' },
      () => ({ factor: 3 }),
    );

    class Component {
      readonly count = signal(0);
      readonly seen: number[] = [];

      // The host form binds `this` inside the generator (and the effect body
      // it returns) to the component instance.
      readonly fx = craftEffect('compute', this, function* () {
        const m = yield* EffectMultiplier();
        return () => {
          this.seen.push(this.count() * m.factor);
        };
      });
    }

    const component = runInInjectionContext(() => new Component());

    flushHost();
    expect(component.seen).toEqual([0]);

    component.count.set(4);
    flushHost();
    expect(component.seen).toEqual([0, 12]);
  });

  it('should invoke cleanup between runs', async () => {
    class Component {
      readonly count = signal(0);
      readonly cleanups: number[] = [];
      readonly fx = craftEffect(
        'cleanup',
        (onCleanup: EffectCleanupRegisterFn) => {
          const current = this.count();
          onCleanup(() => this.cleanups.push(current));
        },
      );
    }

    const component = runInInjectionContext(() => new Component());

    flushHost();
    component.count.set(1);
    flushHost();
    component.count.set(2);
    flushHost();

    expect(component.cleanups).toEqual([0, 1]);
  });

  it('should reject onAppStart inside craftEffect generators', async () => {
    class InvalidComponent {
      readonly fx = craftEffect('invalid', function* () {
        yield* onAppStart(() => undefined);
        return () => {
          /* noop */
        };
      });
    }

    expect(() =>
      runInInjectionContext(() => new InvalidComponent()),
    ).toThrow(
      'craftEffect(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('should emit an active effect report on triggerSnapshot$ with the effect host tag', async () => {
    class Component {
      readonly fx = craftEffect('tracker', () => {
        /* noop */
      });
    }

    const reports: ActiveEffectReport[] = [];
    const { injector } = setupCraftServiceTest();
    lastInjector = injector;
    const registry = injector.run(() => inject(APP_SNAPSHOT_REGISTRY));
    registry.allActiveEffects$.subscribe((r) => reports.push(r));

    injector.run(() => new Component());

    registry.triggerSnapshot$.next();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('effect:tracker');
    expect(reports[0].from[reports[0].from.length - 1]).toBe('effect:tracker');
  });

  it('resolves the snapshot registry from the injector option', async () => {
    const registry = new AppSnapshotRegistry();
    const owner = createEnvironmentInjector(
      [{ provide: APP_SNAPSHOT_REGISTRY, useValue: registry }],
      hostEnvironmentInjector(),
    );
    const reports: ActiveEffectReport[] = [];
    registry.allActiveEffects$.subscribe((report) => reports.push(report));

    runInInjectionContext(() =>
      craftEffect(
        'custom-registry',
        () => {
          /* noop */
        },
        { injector: owner },
      ),
    );
    flushHost();

    registry.triggerSnapshot$.next();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('effect:custom-registry');
    owner.destroy();
  });

  it('should expose craftEffect dependencies through ExtractDeps', async () => {
    const { EffectMultiplierDeps } = craftService(
      { name: 'EffectMultiplierDeps', scope: 'function' },
      () => ({ factor: 5 }),
    );

    class Component {
      readonly count = signal(0);
      readonly fx = craftEffect('with-deps', this, function* () {
        const m = yield* EffectMultiplierDeps();
        return () => {
          void (this.count() * m.factor);
        };
      });
    }

    type ExpectedDeps = {
      EffectMultiplierDeps: GetServiceDependencies<typeof EffectMultiplierDeps>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['fx']>, ExpectedDeps>>;
  });

  it('tracks dependencies yielded by a primitive trigger', async () => {
    const { TriggerDependency } = craftService(
      { name: 'TriggerDependency', scope: 'function' },
      () => ({ value: 'tracked' }),
    );

    class Component {
      readonly fx = craftEffect('primitive-trigger', function* () {
        const search = yield* query('search', {
          method: function* (term: string) {
            yield* TriggerDependency();
            return term;
          },
          loader: () => Promise.resolve([]),
        });

        yield* search.call('craft');
        return () => undefined;
      });
    }

    type ExpectedDeps = {
      TriggerDependency: GetServiceDependencies<typeof TriggerDependency>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['fx']>, ExpectedDeps>>;

    runInInjectionContext(() => new Component());
  });
});
