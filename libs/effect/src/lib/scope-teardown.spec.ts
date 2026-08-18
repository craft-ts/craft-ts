// Task 2.6, second half — the explicit leak tests.
//
// A layer that acquires a resource must release it when its injector level is
// destroyed. Before this was wired, every navigation opened an Effect Scope
// that nothing closed, so connections, subscriptions and timers accumulated
// silently. These tests fail if that regresses.
import { createCraftInjector } from '@craft-ts/core';
import { Context, Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideLayer, resolveEffectLevel } from './effect-level';

const log: string[] = [];

class ConnectionTag extends Context.Service<
  ConnectionTag,
  { readonly id: number }
>()('Connection') {}

let nextId = 0;

/** A layer that acquires a resource and registers its release on the scope. */
const connectionLayer = Layer.effect(ConnectionTag)(
  Effect.acquireRelease(
    Effect.sync(() => {
      const id = ++nextId;
      log.push(`acquire:${id}`);
      return { id };
    }),
    (connection) =>
      Effect.sync(() => {
        log.push(`release:${connection.id}`);
      }),
  ),
);

describe('level scope teardown', () => {
  beforeEach(() => {
    log.length = 0;
    nextId = 0;
  });

  it('releases a level resource when its injector is destroyed', () => {
    const injector = createCraftInjector([provideLayer(connectionLayer)]);
    expect(resolveEffectLevel(injector)).not.toBeNull();
    expect(log).toEqual(['acquire:1']);

    injector.destroy();

    expect(log).toEqual(['acquire:1', 'release:1']);
  });

  it('does not leak across repeated navigations', () => {
    const root = createCraftInjector([]);

    for (const _navigation of [1, 2, 3]) {
      const route = root.createChild([provideLayer(connectionLayer)]);
      resolveEffectLevel(route);
      route.destroy();
    }

    expect(log).toEqual([
      'acquire:1',
      'release:1',
      'acquire:2',
      'release:2',
      'acquire:3',
      'release:3',
    ]);
    // Every acquire is matched: nothing accumulated.
    expect(log.filter((entry) => entry.startsWith('acquire')).length).toBe(
      log.filter((entry) => entry.startsWith('release')).length,
    );

    root.destroy();
  });

  it('releases a child level without touching the parent', () => {
    const root = createCraftInjector([provideLayer(connectionLayer)]);
    resolveEffectLevel(root);
    expect(log).toEqual(['acquire:1']);

    const route = root.createChild([]);
    resolveEffectLevel(route);
    route.destroy();

    // The route provided no layer of its own, so nothing of the root's was
    // released with it.
    expect(log).toEqual(['acquire:1']);

    root.destroy();
    expect(log).toEqual(['acquire:1', 'release:1']);
  });

  it('destroys child levels when the root goes, not before', () => {
    const root = createCraftInjector([]);
    const route = root.createChild([provideLayer(connectionLayer)]);
    resolveEffectLevel(route);
    expect(log).toEqual(['acquire:1']);

    root.destroy();

    expect(log).toEqual(['acquire:1', 'release:1']);
  });
});
