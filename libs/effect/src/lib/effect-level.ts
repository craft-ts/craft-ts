import {
  ɵInjector as Injector,
  type CraftProvider,
} from '@craft-ts/core';
import { Context, Effect, Exit, Layer, Scope } from 'effect';

// ---------------------------------------------------------------------------
// Tasks 2.1 and 2.2 — `Layer` as a provider of the craft injector, and the
// inheritance rule for nested runtimes.
//
// Each injector level owns an "Effect level": the context its own layers built,
// merged with its parent's, plus a MemoMap FORKED from the parent's.
//
// The fork is the whole decision. Effect memoises layer construction in a
// MemoMap; forking the parent's means a child reuses every entry the parent
// already built and only constructs what it adds. Give a child a fresh MemoMap
// instead — the obvious mistake — and the root services are silently rebuilt on
// every navigation. That is asserted, both ways, in effect-level.spec.ts.
// ---------------------------------------------------------------------------

/** What each injector level stores. */
export type CraftEffectLevel = {
  /** Everything visible at this level: the parent's services plus its own. */
  readonly context: Context.Context<never>;
  /** Forked from the parent's, so parent entries are reused rather than rebuilt. */
  readonly memoMap: Layer.MemoMap;
  /** Closed when the level's injector is destroyed. */
  readonly scope: Scope.Closeable;
};

/**
 * The token under which a level is stored. Resolution walks the injector's
 * parent chain, so a route with no layers of its own transparently sees the
 * root's.
 */
export const CRAFT_EFFECT_LEVEL = {
  debugName: 'CRAFT_EFFECT_LEVEL',
} as unknown as object;

type AnyLayer = Layer.Layer<never, never, never>;

function buildLevel(
  layer: AnyLayer,
  memoMap: Layer.MemoMap,
  scope: Scope.Closeable,
): Context.Context<never> {
  return Effect.runSync(Layer.buildWithMemoMap(layer, memoMap, scope));
}

/**
 * Provides an Effect `Layer` to a craft injector, exactly as `useValue` and
 * `useFactory` provide plain values — task 2.1.
 *
 * @example
 * const root = createCraftInjector([provideLayer(ConfigLayer)]);
 * const route = root.createChild([provideLayer(ApiLayer)]);
 */
export function provideLayer<ROut, RIn>(
  layer: Layer.Layer<ROut, never, RIn>,
): CraftProvider & {
  readonly provide: object;
  readonly deps: readonly [typeof Injector];
} {
  return {
    token: CRAFT_EFFECT_LEVEL,
    // Keep the provider consumable by Angular-style route injectors as well
    // as by Craft's native root injector.
    provide: CRAFT_EFFECT_LEVEL,
    // Angular-style provider normalization passes declared dependencies to
    // `useFactory`; the native Craft injector still passes itself directly.
    deps: [Injector],
    useFactory: (injector: Injector): CraftEffectLevel => {
      const parent = getParentLevel(injector);
      const scope = Effect.runSync(Scope.make());

      const memoMap = parent
        ? Layer.forkMemoMapUnsafe(parent.memoMap)
        : Layer.makeMemoMapUnsafe();

      // Feed the child the parent's ALREADY-BUILT context, not the parent's
      // layer. Passing the layer is what would rebuild it.
      const composed = (
        parent
          ? Layer.provide(layer, Layer.succeedContext(parent.context))
          : layer
      ) as unknown as AnyLayer;

      const own = buildLevel(composed, memoMap, scope);
      const context = parent ? Context.merge(parent.context, own) : own;

      // Task 2.6, second half. Without this, every level opens an Effect Scope
      // that nothing ever closes: a layer holding a connection, a subscription
      // or a timer leaks once per navigation. The injector's own teardown is
      // the right owner — a level lives exactly as long as its injector.
      onInjectorDestroy(injector, () => {
        Effect.runSync(Scope.close(scope, Exit.void));
      });

      return { context, memoMap, scope };
    },
  };
}

type InjectorWithTeardown = Injector & {
  readonly ɵonDestroy?: (callback: () => void) => void;
};

function onInjectorDestroy(injector: Injector, callback: () => void): void {
  const teardown = (injector as InjectorWithTeardown).ɵonDestroy;
  if (typeof teardown === 'function') {
    teardown(callback);
    return;
  }
  // No teardown hook (a bare test double): fail loudly rather than leak
  // silently, since a silent leak is exactly what this code prevents.
  throw new Error(
    'provideLayer() needs an injector with a destroy hook; got one without ɵonDestroy.',
  );
}

function getParentLevel(injector: Injector): CraftEffectLevel | null {
  const parent = (injector as { ɵparent?: Injector | null }).ɵparent;
  if (!parent) return null;
  return (parent.get(CRAFT_EFFECT_LEVEL as never, null) ??
    null) as CraftEffectLevel | null;
}

/**
 * The level in force for `injector`, or `null` when no `provideLayer` appears
 * anywhere up the chain.
 */
export function resolveEffectLevel(
  injector: Injector,
): CraftEffectLevel | null {
  return (injector.get(CRAFT_EFFECT_LEVEL as never, null) ??
    null) as CraftEffectLevel | null;
}
