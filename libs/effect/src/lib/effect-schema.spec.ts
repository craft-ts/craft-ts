// Task 4.1 — the Effect Schema interop is carried entirely by Standard Schema
// V1. There is no adapter in this package and there must never be one: this
// spec exists to prove the claim, and to go red if either side drifts.
import {
  craftSignal,
  craftUse,
  flushCraftTest,
  query,
  setupCraftServiceTest,
  state,
  type StandardSchemaV1,
} from '@craft-ts/core';
import { Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

const Trimmed = Schema.String.pipe(Schema.decodeTo(Schema.String));

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
});

describe('Effect Schema through Standard Schema V1', () => {
  it('satisfies the StandardSchemaV1 type CraftTS declares', () => {
    const standard = Schema.toStandardSchemaV1(Person);

    // The real assertion: craft's local copy of the spec and the
    // `@standard-schema/spec` types Effect compiles against still agree. If
    // either drifts, this stops compiling — which is the point.
    expectTypeOf(standard).toMatchTypeOf<StandardSchemaV1>();

    const asCraftSchema: StandardSchemaV1<
      { readonly name: string; readonly age: number },
      { readonly name: string; readonly age: number }
    > = standard;
    expect(asCraftSchema['~standard'].version).toBe(1);
    expect(asCraftSchema['~standard'].vendor).toBe('effect');
  });

  it('validates synchronously, which is what the sync stages require', () => {
    const standard = Schema.toStandardSchemaV1(Person);

    const result = standard['~standard'].validate({ name: 'Ada', age: 36 });

    // `paramsSchema`, `methodSchema` and the `set`/`update`/`patch` writes go
    // through `parseSync`, which THROWS on a Promise. A plain Effect schema
    // stays synchronous, so it is usable at those stages.
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toMatchObject({ value: { name: 'Ada', age: 36 } });
  });

  it('reports issues with a path craft can render', () => {
    const standard = Schema.toStandardSchemaV1(Person);

    const result = standard['~standard'].validate({ name: 'Ada', age: 'old' });
    if (result instanceof Promise) throw new Error('expected sync validation');

    expect(result.issues).toBeDefined();
    expect(result.issues?.[0]?.path).toEqual(['age']);
    expect(typeof result.issues?.[0]?.message).toBe('string');
  });
});

describe('Effect Schema inside a craft primitive', () => {
  it('validates and publishes state values', () => {
    const { injector } = setupCraftServiceTest();

    const value = injector.run(() =>
      craftUse(
        state('person', {
          $self: { name: 'Ada', age: 36 },
          schema: Schema.toStandardSchemaV1(Person),
        }),
      ),
    );

    expect(craftUse(value())).toEqual({ name: 'Ada', age: 36 });
  });

  it('surfaces a rejection as a craft schema exception, not a throw', () => {
    const { injector } = setupCraftServiceTest();
    // Typed as the schema's ENCODED shape: that is what a source feeds in,
    // and it is what makes the schema branch of `state` kick in.
    const source = craftSignal<{ name: string; age: number }>({
      name: 'Ada',
      age: 36,
    });

    const value = injector.run(() =>
      craftUse(
        state('person', {
          $self: source,
          schema: Schema.toStandardSchemaV1(Person),
        }),
      ),
    );

    expect(craftUse(value())).toEqual({ name: 'Ada', age: 36 });
    source.set({ name: 'Ada', age: 'old' as unknown as number });

    // Craft keeps the last valid value and routes the failure to the
    // exception channel — Effect's issues never surface as an exception.
    expect(craftUse(value())).toEqual({ name: 'Ada', age: 36 });
    expect(craftUse(value.exceptions()).parse.state?._tag).toBe(
      'SCHEMA_VALIDATION_ERROR',
    );
  });

  it('validates a loader result through loaderSchema', async () => {
    const { injector } = setupCraftServiceTest();

    const people = injector.run(() =>
      craftUse(
        query('people', {
          loaderSchema: Schema.toStandardSchemaV1(Schema.Array(Person)),
          method: (team: string) => team,
          loader: async () => [{ name: 'Ada', age: 36 }],
        }),
      ),
    );

    people.call('crafters');
    await flushCraftTest(injector);

    expect(craftUse(people.value())).toEqual([{ name: 'Ada', age: 36 }]);
  });

  it('publishes the DECODED value when the schema transforms', () => {
    const { injector } = setupCraftServiceTest();

    // Documented in guide/state/schema-validation.md. `Schema.Date` would
    // reject this string outright; `DateFromString` is the decoding one.
    const createdAt = injector.run(() =>
      craftUse(
        state('createdAt', {
          $self: '2026-08-18T00:00:00.000Z',
          schema: Schema.toStandardSchemaV1(Schema.DateFromString),
        }),
      ),
    );

    const value = craftUse(createdAt());
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  it('uses the schema OUTPUT type, so a decode transformation shows through', () => {
    const { injector } = setupCraftServiceTest();

    const label = injector.run(() =>
      craftUse(
        state('label', {
          $self: ' craft ',
          schema: Schema.toStandardSchemaV1(Trimmed),
        }),
      ),
    );

    expectTypeOf(craftUse(label())).toEqualTypeOf<string>();
  });
});
