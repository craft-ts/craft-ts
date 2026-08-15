// @vitest-environment jsdom
import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
  type EffectCleanupRegisterFn,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('craftEffect', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('should require an injection context', () => {
    class OutsideInjectionContext {
      readonly fx = craftEffect('outside', () => {
        /* noop */
      });
    }

    expect(() => new OutsideInjectionContext()).toThrow();
  });

  it('should run a plain effect function reactively', () => {
    class Component {
      readonly count = signal(0);
      readonly seen: number[] = [];
      readonly fx = craftEffect('observe', () => {
        this.seen.push(this.count());
      });
    }

    const component = TestBed.runInInjectionContext(() => new Component());

    TestBed.tick();
    expect(component.seen).toEqual([0]);

    component.count.set(1);
    TestBed.tick();
    expect(component.seen).toEqual([0, 1]);
  });

  it('tracks Angular and Craft signal dependencies together', () => {
    const angularCount = signal(0);
    const craftCount = craftSignal(0);
    const seen: number[] = [];

    TestBed.runInInjectionContext(() =>
      craftEffect('mixed', () => {
        seen.push(angularCount() + craftCount());
      }),
    );

    TestBed.tick();
    expect(seen).toEqual([0]);
    angularCount.set(1);
    TestBed.tick();
    expect(seen).toEqual([0, 1]);

    craftCount.set(2);
    TestBed.tick();
    expect(seen).toEqual([0, 1, 3]);
  });

  it('retraces conditional Angular dependencies after a Craft-triggered run', () => {
    const useSecond = craftSignal(false);
    const first = signal('first');
    const second = signal('second');
    const seen: string[] = [];

    TestBed.runInInjectionContext(() =>
      craftEffect('conditional-mixed', () => {
        seen.push(useSecond() ? second() : first());
      }),
    );

    TestBed.tick();
    expect(seen).toEqual(['first']);

    useSecond.set(true);
    TestBed.tick();
    expect(seen).toEqual(['first', 'second']);

    second.set('updated');
    TestBed.tick();

    expect(seen).toEqual(['first', 'second', 'updated']);
  });

  it('uses the injector option as the effect owner', () => {
    const source = craftSignal(0);
    const seen: number[] = [];
    const owner = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector),
    );

    TestBed.runInInjectionContext(() =>
      craftEffect(
        'custom-owner',
        () => {
          seen.push(source());
        },
        { injector: owner },
      ),
    );
    TestBed.tick();
    source.set(1);
    TestBed.tick();
    expect(seen).toEqual([0, 1]);

    owner.destroy();
    source.set(2);

    expect(seen).toEqual([0, 1]);
  });

  it('stops with its owning DestroyRef', () => {
    const source = craftSignal(0);
    const seen: number[] = [];
    const injector = createEnvironmentInjector(
      [],
      TestBed.inject(EnvironmentInjector),
    );

    runInInjectionContext(injector, () =>
      craftEffect('destroyed', () => {
        seen.push(source());
      }),
    );
    TestBed.tick();
    source.set(1);
    TestBed.tick();
    expect(seen).toEqual([0, 1]);

    injector.destroy();
    source.set(2);

    expect(seen).toEqual([0, 1]);
  });

  it('should run a generator factory that resolves DI deps once and returns the effect body', () => {
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

    const component = TestBed.runInInjectionContext(() => new Component());

    TestBed.tick();
    expect(component.seen).toEqual([0]);

    component.count.set(4);
    TestBed.tick();
    expect(component.seen).toEqual([0, 12]);
  });

  it('should invoke cleanup between runs', () => {
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

    const component = TestBed.runInInjectionContext(() => new Component());

    TestBed.tick();
    component.count.set(1);
    TestBed.tick();
    component.count.set(2);
    TestBed.tick();

    expect(component.cleanups).toEqual([0, 1]);
  });

  it('should reject onAppStart inside craftEffect generators', () => {
    class InvalidComponent {
      readonly fx = craftEffect('invalid', function* () {
        yield* onAppStart(() => undefined);
        return () => {
          /* noop */
        };
      });
    }

    expect(() =>
      TestBed.runInInjectionContext(() => new InvalidComponent()),
    ).toThrow(
      'craftEffect(...) does not support onAppStart(...). Use onAppStart(...) only inside craftService({ appStart: true }, ...) generators.',
    );
  });

  it('should emit an active effect report on triggerSnapshot$ with the effect host tag', () => {
    class Component {
      readonly fx = craftEffect('tracker', () => {
        /* noop */
      });
    }

    const reports: ActiveEffectReport[] = [];
    const registry = TestBed.inject(APP_SNAPSHOT_REGISTRY);
    registry.allActiveEffects$.subscribe((r) => reports.push(r));

    TestBed.runInInjectionContext(() => new Component());

    registry.triggerSnapshot$.next();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('effect:tracker');
    expect(reports[0].from[reports[0].from.length - 1]).toBe('effect:tracker');
  });

  it('resolves the snapshot registry from the injector option', () => {
    const registry = new AppSnapshotRegistry();
    const owner = createEnvironmentInjector(
      [{ provide: APP_SNAPSHOT_REGISTRY, useValue: registry }],
      TestBed.inject(EnvironmentInjector),
    );
    const reports: ActiveEffectReport[] = [];
    registry.allActiveEffects$.subscribe((report) => reports.push(report));

    TestBed.runInInjectionContext(() =>
      craftEffect(
        'custom-registry',
        () => {
          /* noop */
        },
        { injector: owner },
      ),
    );
    TestBed.tick();

    registry.triggerSnapshot$.next();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('effect:custom-registry');
    owner.destroy();
  });

  it('should expose craftEffect dependencies through ExtractDeps', () => {
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

  it('tracks dependencies yielded by a primitive trigger', () => {
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

    TestBed.runInInjectionContext(() => new Component());
  });
});
