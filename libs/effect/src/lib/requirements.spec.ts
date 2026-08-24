// Task 2.5, type-level half — `R` is checked AT THE YIELD SITE.
import { Context, Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assertNoRequirements,
  type AssertNoRequirements,
  type MissingRequirements,
} from './requirements';

class ConfigTag extends Context.Service<ConfigTag, { readonly url: string }>()(
  'Config',
) {}

const satisfied: Effect.Effect<string, never, never> = Effect.succeed('ok');
declare const needsConfig: Effect.Effect<string, never, ConfigTag>;

describe('assertNoRequirements', () => {
  it('passes an Effect with no requirements through unchanged', () => {
    expectTypeOf(assertNoRequirements(satisfied)).toEqualTypeOf<
      Effect.Effect<string, never, never>
    >();
  });

  it('rejects an Effect that still carries requirements', () => {
    // Type-only: `needsConfig` is a `declare const` with no runtime value, so
    // this body must never execute. The real assertion is that tsc consumes
    // the directive below, which `tsc -p libs/effect/tsconfig.spec.json`
    // verifies. (Do not start a comment line with the directive's name here —
    // it becomes a second, unused directive.)
    const _typeOnly = () => {
      // @ts-expect-error — ConfigTag is not provided by any level.
      assertNoRequirements(needsConfig);
    };
    expect(typeof _typeOnly).toBe('function');
  });

  it('names the missing services in the projected type', () => {
    expectTypeOf<AssertNoRequirements<typeof needsConfig>>().toEqualTypeOf<
      MissingRequirements<ConfigTag>
    >();
  });

  it('leaves a satisfied Effect alone in the projection too', () => {
    expectTypeOf<AssertNoRequirements<typeof satisfied>>().toEqualTypeOf<
      Effect.Effect<string, never, never>
    >();
  });
});
