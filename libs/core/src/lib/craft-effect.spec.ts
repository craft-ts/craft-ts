// @vitest-environment jsdom
import {
  createEnvironmentInjector,
  DestroyRef,
  EnvironmentInjector,
  inject,
  runInInjectionContext as runInHostInjectionContext,
  signal,
  type EffectCleanupRegisterFn,
} from './host/craft-compat';
import { craftUse } from './craft-use';
import { describe, expect, it } from 'vitest';
import { Equal, Expect } from 'test-type';
import type { ExtractDeps } from './branded-component/branded-component';
import { craftEffect, ɵcraftEffectRef } from './craft-effect';
import {
  craftService,
  onAppStart,
  ɵcreateHostTaggedInjector,
  ɵHOST_TAG_LIST,
  ɵprovideHostName,
  type GetServiceDependencies,
} from './craft-service';
import { query } from './query';
import {
  AppSnapshotRegistry,
  type ActiveEffectReport,
} from './take-app-snapshot';
import { craftBatch, craftSignal } from './host/craft-signal';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from './setup-craft-service-test';
import { craftExpose } from './craft-primitive-gen';

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
      readonly fx = craftUse(craftEffect('outside', () => {
        /* noop */
      }));
    }

    expect(() => new OutsideInjectionContext()).toThrow();
  });

  it('should run a plain effect function reactively', async () => {
    class Component {
      readonly count = signal(0);
      readonly seen: number[] = [];
      readonly fx = craftUse(craftEffect('observe', () => {
        this.seen.push(this.count());
      }));
    }

    const component = runInInjectionContext(() => new Component());

    flushHost();
    expect(component.seen).toEqual([0]);

    component.count.set(1);
    flushHost();
    expect(component.seen).toEqual([0, 1]);
  });

  it('tracks multiple Craft signal dependencies together', async () => {
    const otherCount = signal(0);
    const craftCount = craftSignal(0);
    const seen: number[] = [];

    runInInjectionContext(() =>
      craftUse(craftEffect('mixed', () => {
        seen.push(otherCount() + craftCount());
      })),
    );

    flushHost();
    expect(seen).toEqual([0]);
    otherCount.set(1);
    flushHost();
    expect(seen).toEqual([0, 1]);

    craftCount.set(2);
    flushHost();
    expect(seen).toEqual([0, 1, 3]);
  });

  it('retraces conditional Craft dependencies after a Craft-triggered run', async () => {
    const useSecond = craftSignal(false);
    const first = signal('first');
    const second = signal('second');
    const seen: string[] = [];

    runInInjectionContext(() =>
      craftUse(craftEffect('conditional-mixed', () => {
        seen.push(useSecond() ? second() : first());
      })),
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
      craftUse(craftEffect(
        'custom-owner',
        () => {
          seen.push(source());
        },
        { injector: owner },
      )),
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

    runInHostInjectionContext(injector, () =>
      craftUse(craftEffect('destroyed', () => {
        seen.push(source());
      })),
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
      { name: 'EffectMultiplier', providedIn: 'function' },
      function* () {
        yield* craftExpose('factor', 3);
      },
    );

    class Component {
      readonly count = signal(0);
      readonly seen: number[] = [];

      // The host form binds `this` inside the generator (and the effect body
      // it returns) to the component instance.
      readonly fx = craftUse(craftEffect('compute', this, function* () {
        const m = yield* EffectMultiplier();
        return () => {
          this.seen.push(this.count() * m.factor);
        };
      }));
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
      readonly fx = craftUse(craftEffect(
        'cleanup',
        (onCleanup: EffectCleanupRegisterFn) => {
          const current = this.count();
          onCleanup(() => this.cleanups.push(current));
        },
      ));
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
      readonly fx = craftUse(craftEffect('invalid', function* () {
        yield* onAppStart(() => undefined);
        return () => {
          /* noop */
        };
      }));
    }

    expect(() => runInInjectionContext(() => new InvalidComponent())).toThrow(
      'craftEffect(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('reads active effect reports synchronously with the effect host tag', async () => {
    class Component {
      readonly fx = craftUse(craftEffect('tracker', () => {
        /* noop */
      }));
    }

    const { injector } = setupCraftServiceTest();
    lastInjector = injector;
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));

    injector.run(() => new Component());

    const reports: ActiveEffectReport[] = registry.activeEffects();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('effect:tracker');
    expect(reports[0].from[reports[0].from.length - 1]).toBe('effect:tracker');
  });

  it('resolves the snapshot registry from the injector option', async () => {
    const owner = setupCraftServiceTest().injector;
    const registry = owner.run(() => craftUse(AppSnapshotRegistry()));

    runInInjectionContext(() =>
      craftUse(craftEffect(
        'custom-registry',
        () => {
          /* noop */
        },
        { injector: owner },
      )),
    );
    flushHost();

    expect(registry.activeEffects()).toHaveLength(1);
    expect(registry.activeEffects()[0].source).toBe('effect:custom-registry');
    owner.destroy();
    expect(registry.activeEffects()).toEqual([]);
  });

  it('should expose craftEffect dependencies through ExtractDeps', async () => {
    const { EffectMultiplierDeps } = craftService(
      { name: 'EffectMultiplierDeps', providedIn: 'function' },
      function* () {
        yield* craftExpose('factor', 5);
      },
    );

    class Component {
      readonly count = signal(0);
      readonly fx = craftUse(craftEffect('with-deps', this, function* () {
        const m = yield* EffectMultiplierDeps();
        return () => {
          void (this.count() * m.factor);
        };
      }));
    }

    type ExpectedDeps = {
      EffectMultiplierDeps: GetServiceDependencies<typeof EffectMultiplierDeps>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['fx']>, ExpectedDeps>>;
  });

  it('tracks dependencies yielded by a primitive trigger', async () => {
    const { TriggerDependency } = craftService(
      { name: 'TriggerDependency', providedIn: 'function' },
      function* () {
        yield* craftExpose('value', 'tracked');
      },
    );

    class Component {
      readonly fx = craftUse(craftEffect('primitive-trigger', function* () {
        const search = yield* query('search', {
          method: function* (term: string) {
            yield* TriggerDependency();
            return term;
          },
          loader: () => Promise.resolve([]),
        });

        yield* search.call('craft');
        return () => undefined;
      }));
    }

    type ExpectedDeps = {
      TriggerDependency: GetServiceDependencies<typeof TriggerDependency>;
    };
    type _Deps = Expect<Equal<ExtractDeps<Component['fx']>, ExpectedDeps>>;

    runInInjectionContext(() => new Component());
  });
});


it('flushes 5000 independent batched Craft effects without recursively invalidating the bridge', () => {
  const { injector } = setupCraftServiceTest();
  const sources = Array.from({ length: 5000 }, () => craftSignal(0));
  const values = Array.from({ length: 5000 }, () => -1);
  let runs = 0;
  injector.run(() =>
    sources.forEach((source, index) => {
      craftUse(
        craftEffect(`batched-${index}`, () => {
          values[index] = source();
          runs++;
        }),
      );
    }),
  );
  expect(runs).toBe(5000);
  expect(() =>
    craftBatch(() => sources.forEach((source) => source.set(1))),
  ).not.toThrow();
  expect(values.every((value) => value === 1)).toBe(true);
  expect(runs).toBe(10000);
  injector.destroy();
  craftBatch(() => sources.forEach((source) => source.set(2)));
  expect(runs).toBe(10000);
});

it('removes a manually destroyed effect from the active registry before its owner is destroyed', () => {
  const { injector } = setupCraftServiceTest();
  const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
  const ref = injector.run(() =>
    craftUse(
      craftEffect('short-lived', () => undefined, { manualCleanup: true }),
    ),
  );
  expect(registry.activeEffects()).toHaveLength(1);
  ref.destroy();
  expect(registry.activeEffects()).toEqual([]);
  injector.destroy();
});

it('releases its tagged scope and active report even when a run cleanup throws', () => {
  const { injector } = setupCraftServiceTest();
  const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
  const calls: string[] = [];
  const failure = new Error('run cleanup');
  const ref = injector.run(() =>
    craftUse(
      craftEffect(
        'owned-scope',
        function* () {
          inject(DestroyRef).onDestroy(() => calls.push('scope'));
          return (onCleanup) =>
            onCleanup(() => {
              calls.push('run');
              throw failure;
            });
        },
        { manualCleanup: true },
      ),
    ),
  );
  expect(() => ref.destroy()).toThrow(failure);
  expect(calls).toEqual(['run', 'scope']);
  expect(registry.activeEffects()).toEqual([]);
  expect(() => injector.destroy()).not.toThrow();
  expect(calls).toEqual(['run', 'scope']);
});

describe('craftEffect tags without a dedicated scope', () => {
  function routedComponentOwner() {
    const { injector: root } = setupCraftServiceTest();
    const routeEnv = createEnvironmentInjector(
      [ɵprovideHostName('route:/items')],
      root,
    );
    // A component node under the route: its tag list comes from the
    // component chain and does not contain the route's tag.
    const owner = routeEnv.createChild([
      { token: ɵHOST_TAG_LIST, useValue: ['App#1', 'Row#2'] },
    ]);
    const registry = owner.run(() => craftUse(AppSnapshotRegistry()));
    const routeTag = routeEnv.get(ɵHOST_TAG_LIST).at(-1)!;
    return { root, owner, registry, routeTag };
  }

  it('reports the same merged tags for a plain body as a tagged scope would', () => {
    const { root, owner, registry, routeTag } = routedComponentOwner();
    owner.run(() => {
      craftUse(craftEffect('plain', () => undefined));
      craftUse(
        craftEffect('factory', function* () {
          return () => undefined;
        }),
      );
    });

    const bySource = new Map(
      registry.activeEffects().map((report) => [report.source, report.from]),
    );
    expect(bySource.get('effect:plain')).toEqual([
      'App#1',
      routeTag,
      'Row#2',
      'effect:plain',
    ]);
    expect(bySource.get('effect:factory')).toEqual([
      'App#1',
      routeTag,
      'Row#2',
      'effect:factory',
    ]);
    expect(bySource.get('effect:plain')).toEqual(
      ɵcreateHostTaggedInjector(owner, 'effect:plain').get(ɵHOST_TAG_LIST),
    );
    root.destroy();
    expect(registry.activeEffects()).toEqual([]);
  });

  it('keeps several reports with the same name, in creation order', () => {
    const { root, owner, registry } = routedComponentOwner();
    owner.run(() => {
      craftUse(craftEffect('twice', () => undefined));
      craftUse(
        craftEffect('twice', (onCleanup: EffectCleanupRegisterFn) =>
          onCleanup(() => undefined),
        ),
      );
    });
    const reports = registry.activeEffects();
    expect(reports.map((report) => report.source)).toEqual([
      'effect:twice',
      'effect:twice',
    ]);
    expect(reports[0].from).toEqual(reports[1].from);
    root.destroy();
  });

  it('runs a plain body in its owner injection context and leaves no scope behind', () => {
    const { injector } = setupCraftServiceTest();
    const ownerDestroyRef = injector.get(DestroyRef);
    let seen: DestroyRef | undefined;
    let hostTags: readonly string[] | undefined;
    const ref = injector.run(() =>
      craftUse(
        craftEffect('in-owner', () => {
          seen ??= inject(DestroyRef);
          hostTags ??= inject(ɵHOST_TAG_LIST);
        }),
      ),
    );
    expect(seen).toBe(ownerDestroyRef);
    expect(hostTags).toEqual(injector.get(ɵHOST_TAG_LIST));
    ref.destroy();
    ref.destroy();
    expect(() => injector.destroy()).not.toThrow();
  });

  it('releases a plain effect report even when a run cleanup throws', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
    const failure = new Error('plain cleanup');
    const ref = injector.run(() =>
      craftUse(
        craftEffect('plain-throws', (onCleanup: EffectCleanupRegisterFn) =>
          onCleanup(() => {
            throw failure;
          }),
        ),
      ),
    );
    expect(registry.activeEffects()).toHaveLength(1);
    expect(() => ref.destroy()).toThrow(failure);
    expect(registry.activeEffects()).toEqual([]);
    expect(() => injector.destroy()).not.toThrow();
  });
});

describe('ɵcraftEffectRef (renderer entry)', () => {
  it('returns the EffectRef directly, with the report and lifecycle of craftEffect', () => {
    const { injector } = setupCraftServiceTest();
    const registry = injector.run(() => craftUse(AppSnapshotRegistry()));
    const source = craftSignal(0);
    const seen: number[] = [];
    const cleanups: number[] = [];
    const ref = injector.run(() =>
      ɵcraftEffectRef(
        'direct',
        (onCleanup) => {
          const value = source();
          seen.push(value);
          onCleanup(() => cleanups.push(value));
        },
        { manualCleanup: true },
      ),
    );
    const viaPublic = injector.run(() =>
      craftUse(craftEffect('direct', () => undefined, { manualCleanup: true })),
    );

    expect(typeof ref.destroy).toBe('function');
    expect(Symbol.iterator in ref).toBe(false);
    const [direct, publicReport] = registry.activeEffects();
    expect(direct).toEqual(publicReport);
    expect(direct.source).toBe('effect:direct');

    source.set(1);
    expect(seen).toEqual([0, 1]);
    expect(cleanups).toEqual([0]);

    ref.destroy();
    ref.destroy();
    expect(cleanups).toEqual([0, 1]);
    source.set(2);
    expect(seen).toEqual([0, 1]);
    expect(registry.activeEffects()).toHaveLength(1);
    viaPublic.destroy();
    expect(registry.activeEffects()).toEqual([]);
  });

  it('requires an injection context like craftEffect', () => {
    expect(() => ɵcraftEffectRef('outside', () => undefined)).toThrow();
  });

  it('is owned by the injector option unless manualCleanup is set', () => {
    const { injector } = setupCraftServiceTest();
    const owner = createEnvironmentInjector([], injector);
    const source = craftSignal(0);
    let runs = 0;
    injector.run(() =>
      ɵcraftEffectRef(
        'owned',
        () => {
          source();
          runs++;
        },
        { injector: owner },
      ),
    );
    source.set(1);
    expect(runs).toBe(2);
    owner.destroy();
    source.set(2);
    expect(runs).toBe(2);
  });
});
