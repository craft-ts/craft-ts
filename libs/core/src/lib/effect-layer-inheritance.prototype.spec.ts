// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.3).
//
// Question: when a route-scoped Layer depends on a root Layer, and the user
// navigates in and out twice, how many times is the root service built?
// The decision recorded in the plan (task 2.2) is "a child sees, and does not
// rebuild, what the parent built" — expected counter = 1.
//
// The mechanism is `Layer.succeedContext(parentContext)`: the child's layer is
// fed the parent's ALREADY-BUILT context instead of the parent's layer. Feeding
// it the layer is what would rebuild, and that is the whole trap.
// ---------------------------------------------------------------------------

import { Context, Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCraftInjector,
  type CraftInjector,
  type CraftProvider,
} from './host/craft-injector';

type Config = { readonly url: string };
type Api = { readonly fetch: () => string };

const ConfigTag = Context.GenericTag<Config>('Config');
const ApiTag = Context.GenericTag<Api>('Api');

const built = { config: 0, api: 0 };

const configLayer = Layer.sync(ConfigTag, () => {
  built.config += 1;
  return { url: 'https://example.test' };
});

const apiLayer = Layer.effect(
  ApiTag,
  Effect.gen(function* () {
    const config = yield* ConfigTag;
    built.api += 1;
    return { fetch: () => `GET ${config.url}` };
  }),
);

// The token under which each injector level stores its built Effect context.
const EFFECT_CONTEXT = {
  debugName: 'CRAFT_EFFECT_CONTEXT',
} as unknown as Context.Context<never>;

function buildContext<A>(
  layer: Layer.Layer<A, never, never>,
): Context.Context<A> {
  return Effect.runSync(Effect.scoped(Layer.build(layer)));
}

/**
 * The wave-2 semantics under test: a level builds only its OWN layer, and is
 * handed the parent's built context rather than the parent's layer.
 */
function provideLayer<A, R>(layer: Layer.Layer<A, never, R>): CraftProvider {
  return {
    token: EFFECT_CONTEXT as unknown as object,
    useFactory: (injector: CraftInjector) => {
      const parentContext =
        (injector.ɵparent?.get(
          EFFECT_CONTEXT as never,
          null,
        ) as Context.Context<never> | null) ?? Context.empty();

      const withParent = Layer.provide(
        layer,
        Layer.succeedContext(parentContext),
      ) as unknown as Layer.Layer<A, never, never>;

      const own = buildContext(withParent);
      return Context.merge(parentContext, own);
    },
  };
}

describe('wave-0 prototype: nested Effect runtime inheritance', () => {
  beforeEach(() => {
    built.config = 0;
    built.api = 0;
  });

  it('builds the root layer once across two navigations', () => {
    const root = createCraftInjector([provideLayer(configLayer)]);

    // Force the root context to exist, as an app bootstrap would.
    root.get(EFFECT_CONTEXT as never);
    expect(built.config).toBe(1);

    for (const _navigation of [1, 2]) {
      const routeInjector = root.createChild([provideLayer(apiLayer)]);
      const context = routeInjector.get(
        EFFECT_CONTEXT as never,
      ) as unknown as Context.Context<Api | Config>;

      // The child can see both its own service and the parent's.
      expect(Context.get(context, ApiTag).fetch()).toBe(
        'GET https://example.test',
      );
      expect(Context.get(context, ConfigTag).url).toBe(
        'https://example.test',
      );

      routeInjector.destroy();
    }

    // THE ASSERTION THIS TASK EXISTS FOR.
    expect(built.config).toBe(1);
    // The route-scoped service is rebuilt per navigation, which is correct:
    // it is owned by the route, not by the root.
    expect(built.api).toBe(2);

    root.destroy();
  });

  it('rebuilds the root service if the child is given the layer instead of the context', () => {
    // The negative control: this is the trap. Composing the child's layer with
    // the parent's LAYER (rather than its built context) silently reconstructs
    // the root service on every navigation.
    built.config = 0;

    for (const _navigation of [1, 2]) {
      const naive = Layer.provide(apiLayer, configLayer);
      buildContext(naive);
    }

    expect(built.config).toBe(2);
  });
});
