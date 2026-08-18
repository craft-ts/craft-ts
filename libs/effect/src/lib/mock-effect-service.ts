import type { CraftProvider } from '@craft-ts/core';
import { Effect, Layer } from 'effect';
import { provideLayer } from './effect-level';

// ---------------------------------------------------------------------------
// Task 3.2 — mocking an Effect service one member at a time.
//
// The whole-service mock is what a Layer already gives you, and it is a poor
// tool for a test: stubbing fifteen members to exercise one of them buries the
// intent. `mockEffectService` takes a partial shape and fills the rest with
// members that fail loudly if touched — so a test that accidentally depends on
// an unstubbed member says so, instead of silently reading `undefined`.
// ---------------------------------------------------------------------------

/** Thrown when a test touches a member it did not stub. */
export class UnstubbedEffectMember extends Error {
  constructor(service: string, member: string) {
    super(
      `${service}.${member}() was called but not stubbed. Add it to mockEffectService(...).`,
    );
    this.name = 'UnstubbedEffectMember';
  }
}

/**
 * Provides a partially stubbed Effect service.
 *
 * @example
 * const injector = createCraftInjector([
 *   mockEffectService(UserApi, { byId: () => Effect.succeed({ name: 'Ada' }) }),
 * ]);
 */
export function mockEffectService<Self, Shape extends object>(
  tag: Effect.Effect<Shape, never, Self> & { readonly key?: string },
  stubs: Partial<Shape>,
): CraftProvider {
  const serviceName = tag.key ?? 'EffectService';

  const service = new Proxy({} as Shape, {
    get(_target, property) {
      const member = property as keyof Shape & string;
      if (member in stubs && stubs[member] !== undefined) {
        return stubs[member];
      }
      // Return a *callable* so the failure happens at call time with a useful
      // message, rather than as "x is not a function" at the call site.
      return () =>
        Effect.die(new UnstubbedEffectMember(serviceName, String(member)));
    },
    has(_target, property) {
      return property in stubs;
    },
  });

  return provideLayer(
    Layer.succeed(tag as never)(service as never) as unknown as Layer.Layer<
      never,
      never,
      never
    >,
  ) as unknown as CraftProvider;
}
