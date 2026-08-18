// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.3), on Effect v4.
//
// Question: when a route-scoped Layer depends on a root Layer, and the user
// navigates in and out twice, how many times is the root service built?
// The decision recorded in the plan (task 2.2) is "a child sees, and does not
// rebuild, what the parent built" — expected root counter = 1, while the
// route-scoped service is legitimately rebuilt per navigation.
//
// v4 gives this natively through MemoMap, which v3 did not have: each injector
// level forks its parent's memo map, so entries the parent already built are
// reused and the level's own entries are fresh. That is a better answer than
// the v3 workaround (feeding the child the parent's built context by hand), and
// it is what task 2.2 should implement.
// ---------------------------------------------------------------------------

import { Context, Effect, Layer, Scope } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCraftInjector,
  type CraftInjector,
  type CraftProvider,
} from './host/craft-injector';

class ConfigTag extends Context.Service<ConfigTag, { readonly url: string }>()(
  'Config',
) {}
class ApiTag extends Context.Service<ApiTag, { readonly fetch: () => string }>()(
  'Api',
) {}

const built = { config: 0, api: 0 };

const configLayer = Layer.sync(ConfigTag)(() => {
  built.config += 1;
  return { url: 'https://example.test' };
});

const apiLayer = Layer.effect(ApiTag)(
  Effect.gen(function* () {
    const config = yield* ConfigTag;
    built.api += 1;
    return { fetch: () => `GET ${config.url}` };
  }),
);

type EffectLevel = {
  readonly context: Context.Context<never>;
  readonly memoMap: Layer.MemoMap;
};

const EFFECT_LEVEL = { debugName: 'CRAFT_EFFECT_LEVEL' } as unknown as object;

function buildLevel(
  layer: Layer.Layer<never, never, never>,
  memoMap: Layer.MemoMap,
): Context.Context<never> {
  return Effect.runSync(
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      return yield* Layer.buildWithMemoMap(layer, memoMap, scope);
    }),
  );
}

/**
 * The wave-2 semantics under test: a level forks its parent's memo map and is
 * handed the parent's built context, so it builds only what it adds.
 */
function provideLayer(layer: Layer.Layer<never, never, never>): CraftProvider {
  return {
    token: EFFECT_LEVEL,
    useFactory: (injector: CraftInjector): EffectLevel => {
      const parent = injector.ɵparent?.get(
        EFFECT_LEVEL as never,
        null,
      ) as EffectLevel | null;

      const memoMap = parent
        ? Layer.forkMemoMapUnsafe(parent.memoMap)
        : Layer.makeMemoMapUnsafe();

      const composed = parent
        ? (Layer.provide(
            layer,
            Layer.succeedContext(parent.context),
          ) as unknown as Layer.Layer<never, never, never>)
        : layer;

      const own = buildLevel(composed, memoMap);
      const context = parent ? Context.merge(parent.context, own) : own;
      return { context, memoMap };
    },
  };
}

describe('wave-0 prototype: nested Effect runtime inheritance (v4)', () => {
  beforeEach(() => {
    built.config = 0;
    built.api = 0;
  });

  it('builds the root layer once across two navigations', () => {
    const root = createCraftInjector([
      provideLayer(configLayer as unknown as Layer.Layer<never, never, never>),
    ]);

    // Force the root level to exist, as an app bootstrap would.
    root.get(EFFECT_LEVEL as never);
    expect(built.config).toBe(1);

    for (const _navigation of [1, 2]) {
      const routeInjector = root.createChild([
        provideLayer(apiLayer as unknown as Layer.Layer<never, never, never>),
      ]);
      const level = routeInjector.get(EFFECT_LEVEL as never) as EffectLevel;

      // The child sees both its own service and the parent's.
      expect(
        Context.get(level.context as Context.Context<ApiTag>, ApiTag).fetch(),
      ).toBe('GET https://example.test');
      expect(
        Context.get(level.context as Context.Context<ConfigTag>, ConfigTag).url,
      ).toBe('https://example.test');

      routeInjector.destroy();
    }

    // THE ASSERTION THIS TASK EXISTS FOR.
    expect(built.config).toBe(1);
    // The route-scoped service IS rebuilt per navigation, which is correct:
    // it is owned by the route, not by the root.
    expect(built.api).toBe(2);

    root.destroy();
  });

  it('rebuilds the root service when each level gets a fresh memo map', () => {
    // The negative control: forget to fork the parent's memo map — build each
    // level with a brand new one — and the root service is silently
    // reconstructed on every navigation.
    const full = Layer.provide(apiLayer, configLayer) as unknown as Layer.Layer<
      never,
      never,
      never
    >;

    for (const _navigation of [1, 2]) {
      buildLevel(full, Layer.makeMemoMapUnsafe());
    }

    expect(built.config).toBe(2);
  });
});
