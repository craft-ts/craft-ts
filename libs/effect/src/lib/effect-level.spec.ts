// Tasks 2.1 and 2.2 — Layer as a craft provider, and the inheritance rule.
import { createCraftInjector } from '@craft-ts/core';
import { Context, Effect, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideLayer, resolveEffectLevel } from './effect-level';

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

describe('provideLayer', () => {
  beforeEach(() => {
    built.config = 0;
    built.api = 0;
  });

  it('provides a Layer to the injector like any other provider', () => {
    const injector = createCraftInjector([provideLayer(configLayer)]);
    const level = resolveEffectLevel(injector);

    expect(level).not.toBeNull();
    expect(
      Context.get(level!.context as Context.Context<ConfigTag>, ConfigTag).url,
    ).toBe('https://example.test');

    injector.destroy();
  });

  it('builds the root layer once across two navigations, rebuilding only the route layer', () => {
    const root = createCraftInjector([provideLayer(configLayer)]);
    expect(resolveEffectLevel(root)).not.toBeNull();
    expect(built.config).toBe(1);

    for (const _navigation of [1, 2]) {
      const route = root.createChild([provideLayer(apiLayer)]);
      const level = resolveEffectLevel(route)!;

      // A child sees its own service AND the parent's.
      expect(
        Context.get(level.context as Context.Context<ApiTag>, ApiTag).fetch(),
      ).toBe('GET https://example.test');
      expect(
        Context.get(level.context as Context.Context<ConfigTag>, ConfigTag).url,
      ).toBe('https://example.test');

      route.destroy();
    }

    // THE DECISION OF TASK 2.2.
    expect(built.config).toBe(1);
    // The route-scoped service is rebuilt per navigation, which is correct:
    // it belongs to the route, not to the root.
    expect(built.api).toBe(2);

    root.destroy();
  });

  it('lets a route with no layer of its own see the root level', () => {
    const root = createCraftInjector([provideLayer(configLayer)]);
    const route = root.createChild([]);

    const level = resolveEffectLevel(route);
    expect(level).not.toBeNull();
    expect(
      Context.get(level!.context as Context.Context<ConfigTag>, ConfigTag).url,
    ).toBe('https://example.test');
    expect(built.config).toBe(1);

    root.destroy();
  });

  it('returns null when nothing up the chain provides a layer', () => {
    const injector = createCraftInjector([]);
    expect(resolveEffectLevel(injector)).toBeNull();
    injector.destroy();
  });

  it('NEGATIVE CONTROL: a fresh memo map per level rebuilds the root service', () => {
    // This is the mistake provideLayer exists to prevent. Building each level
    // with its own memo map — rather than forking the parent's — silently
    // reconstructs everything the parent already built, on every navigation.
    const full = Layer.provide(apiLayer, configLayer) as unknown as Layer.Layer<
      never,
      never,
      never
    >;

    for (const _navigation of [1, 2]) {
      Effect.runSync(
        Effect.scoped(
          Effect.gen(function* () {
            return yield* Layer.build(full);
          }),
        ),
      );
    }

    expect(built.config).toBe(2);
  });
});
