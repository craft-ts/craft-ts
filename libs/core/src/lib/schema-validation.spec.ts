import {
  ApplicationRef,
  computed,
  ResourceStreamItem,
  Signal,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { asyncProcess } from './async-process';
import { craftUse } from './craft-use';
import { mutation } from './mutation';
import { query } from './query';
import { state } from './state';
import { provideCraftSchemaValidationPolicy } from './schema-validation';

type TestSchema<Input, Output> = {
  '~standard': {
    version: 1;
    vendor: 'test';
    types: { input: Input; output: Output };
    validate: (
      value: unknown,
    ) =>
      | { value: Output; issues?: undefined }
      | { issues: readonly { message: string }[] };
  };
};

const schema = <Input, Output>(
  validate: TestSchema<Input, Output>['~standard']['validate'],
) =>
  ({
    '~standard': { version: 1, vendor: 'test', types: undefined, validate },
  }) as unknown as TestSchema<Input, Output>;

describe('Standard Schema validation', () => {
  beforeEach(() => vi.useRealTimers());

  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  it('validates and transforms state values', () => {
    const numberSchema = schema<unknown, number>((value) =>
      typeof value === 'number'
        ? { value: value * 2 }
        : { issues: [{ message: 'number expected' }] },
    );

    const value = TestBed.runInInjectionContext(() =>
      craftUse(
        state('value', {
          $self: 2,
          schema: numberSchema,
        }),
      ),
    );

    expect(value()).toBe(4);
    expect(value.hasSchema()).toBe(true);
    expectTypeOf(value.hasSchema).toEqualTypeOf<Signal<true>>();
  });

  it('specializes hasSchema to false without a schema', () => {
    const value = TestBed.runInInjectionContext(() =>
      craftUse(state('value', 1)),
    );

    expect(
      (value as typeof value & { hasSchema: Signal<false> }).hasSchema(),
    ).toBe(false);
  });

  it('uses the schema output type for state values', () => {
    const labelSchema = schema<number, string>((value) =>
      typeof value === 'number'
        ? { value: `value-${value}` }
        : { issues: [{ message: 'number expected' }] },
    );

    const label = TestBed.runInInjectionContext(() =>
      craftUse(
        state('label', {
          $self: 1,
          schema: labelSchema,
        }),
      ),
    );

    expect(label()).toBe('value-1');
    expectTypeOf(label).toMatchTypeOf<Signal<string>>();
  });

  it('keeps the last valid state and exposes the parse exception', () => {
    const numberSchema = schema<number, number>((value) =>
      typeof value === 'number' && value >= 0
        ? { value }
        : { issues: [{ message: 'positive number expected' }] },
    );

    const value = TestBed.runInInjectionContext(() =>
      craftUse(
        state('value', {
          $self: 1,
          schema: numberSchema,
        }),
      ),
    );

    const writableValue = value as typeof value & {
      set(nextValue: number): void;
    };
    writableValue.set(-1);

    expect(value()).toBe(1);
    expect(value.exceptions().parse.state?.code).toBe(
      'SCHEMA_VALIDATION_ERROR',
    );
  });

  it('validates a query method argument and passes its output to the method', async () => {
    const inputSchema = schema<string, string>((value) =>
      typeof value === 'string'
        ? { value: value.trim() }
        : { issues: [{ message: 'string expected' }] },
    );

    const search = TestBed.runInInjectionContext(() =>
      craftUse(
        query('search', {
          methodSchema: inputSchema,
          method: (input) => ({ term: input }),
          loader: async ({ params }) => [params.term],
        }),
      ),
    );

    search.call('  craft  ');
    await settle();

    expect(search.value()).toEqual(['craft']);
    expect(search.hasSchema()).toBe(true);
    expectTypeOf(search.hasSchema).toEqualTypeOf<Signal<true>>();
    expectTypeOf(search.call).parameter(0).toEqualTypeOf<string>();
  });

  it('validates reactive query params independently', async () => {
    const paramsSchema = schema<{ page: number }, { page: number }>((value) =>
      value && typeof value === 'object' && 'page' in value
        ? { value: { page: Number(value.page) } }
        : { issues: [{ message: 'params expected' }] },
    );

    const products = TestBed.runInInjectionContext(() =>
      craftUse(
        query('products', {
          paramsSchema,
          params: () => ({ page: 2 }),
          loader: async ({ params }) => [params.page],
        }),
      ),
    );

    await settle();

    expect(products.value()).toEqual([2]);
  });

  it('validates loader results and local resource writes independently', async () => {
    const resultSchema = schema<unknown, string[]>((value) =>
      Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? { value }
        : { issues: [{ message: 'string array expected' }] },
    );

    const products = TestBed.runInInjectionContext(() =>
      craftUse(
        query('products', {
          loaderSchema: resultSchema,
          method: (term: string) => term,
          loader: async () => ['server'],
        }),
      ),
    );

    products.call('craft');
    await settle();
    const writableProducts = products as typeof products & {
      set(value: string[]): void;
    };
    writableProducts.set(['local']);
    expect(products.value()).toEqual(['local']);

    writableProducts.set([123] as unknown as string[]);
    expect(products.value()).toEqual(['local']);
    const parseExceptions = products.exceptions as unknown as Signal<{
      parse: { loader?: { payload: { value: unknown } } };
    }>;
    expect(parseExceptions().parse.loader?.payload.value).toEqual([123]);
  });

  it('validates stream values and keeps the stream reactive', async () => {
    const values = signal<ResourceStreamItem<string[]>>({ value: ['first'] });
    const resultSchema = schema<unknown, string[]>((value) =>
      Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? { value }
        : { issues: [{ message: 'string array expected' }] },
    );

    const live = TestBed.runInInjectionContext(() =>
      craftUse(
        query('live', {
          loaderSchema: resultSchema,
          method: (channel: string) => channel,
          stream: async () => values,
        }),
      ),
    );

    live.call('craft');
    await settle();
    expect(live.value()).toEqual(['first']);

    values.set({ value: ['second'] });
    expect(live.value()).toEqual(['second']);
  });

  it('validates resources with identifiers', async () => {
    const resultSchema = schema<unknown, { id: string }>((value) =>
      value && typeof value === 'object' && 'id' in value
        ? { value: { id: String(value.id) } }
        : { issues: [{ message: 'resource expected' }] },
    );

    const users = TestBed.runInInjectionContext(() =>
      craftUse(
        query('users', {
          loaderSchema: resultSchema,
          method: (id: string) => id,
          identifier: (id: string) => id,
          loader: async ({ params }) => ({ id: params }),
        }),
      ),
    );

    users.call('user-1');
    await settle();

    const usersWithSelect = users as typeof users & {
      select(
        id: string,
      ): { value: Signal<{ id: string } | undefined> } | undefined;
    };
    expect(usersWithSelect.select('user-1')?.value()).toEqual({ id: 'user-1' });
  });

  it('validates mutation method arguments', async () => {
    const inputSchema = schema<{ id: string }, { id: string }>((value) =>
      value && typeof value === 'object' && 'id' in value
        ? { value: { id: String(value.id) } }
        : { issues: [{ message: 'input expected' }] },
    );

    const save = TestBed.runInInjectionContext(() =>
      craftUse(
        mutation('save', {
          methodSchema: inputSchema,
          method: (input) => input,
          loader: async ({ params }) => params.id,
        }),
      ),
    );

    save.mutate({ id: 'user-1' });
    await settle();

    expect(save.value()).toBe('user-1');
  });

  it('validates asyncProcess method arguments', async () => {
    const inputSchema = schema<string, string>((value) =>
      typeof value === 'string'
        ? { value: value.trim() }
        : { issues: [{ message: 'string expected' }] },
    );

    const load = TestBed.runInInjectionContext(() =>
      craftUse(
        asyncProcess('load', {
          methodSchema: inputSchema,
          method: (input) => input,
          loader: async ({ params }) => params.toUpperCase(),
        }),
      ),
    );

    load.method(' craft ');
    await settle();

    expect(load.value()).toBe('CRAFT');
    expect(load.hasSchema()).toBe(true);
    expectTypeOf(load.hasSchema).toEqualTypeOf<Signal<true>>();
  });

  it('allows a local policy to accept invalid values', () => {
    const numberSchema = schema<number, number>(() => ({
      issues: [{ message: 'always invalid' }],
    }));
    const value = TestBed.runInInjectionContext(() =>
      craftUse(
        state('value', {
          $self: 1,
          schema: numberSchema,
          schemaValidationPolicy: () => ({ action: 'accept' }),
        }),
      ),
    );

    expect(value()).toBe(1);
  });

  it('uses the injected policy and exposes the full validation context', () => {
    const contexts: Array<{
      primitive: string;
      name: string;
      stage: string;
      operation: string;
    }> = [];
    const numberSchema = schema<number, number>(() => ({
      issues: [{ message: 'always invalid' }],
    }));

    TestBed.configureTestingModule({
      providers: [
        provideCraftSchemaValidationPolicy((context) => {
          contexts.push({
            primitive: context.primitive,
            name: context.name,
            stage: context.stage,
            operation: context.operation,
          });
          return { action: 'reject' };
        }),
      ],
    });

    TestBed.runInInjectionContext(() =>
      craftUse(
        state('value', {
          $self: 1,
          schema: numberSchema,
        }),
      ),
    );

    expect(contexts).toContainEqual({
      primitive: 'state',
      name: 'value',
      stage: 'state',
      operation: 'initial',
    });
  });

  it('keeps derived state reactive under schema validation', () => {
    const source = signal(2);
    const numberSchema = schema<number, number>((value) =>
      typeof value === 'number' && value >= 0
        ? { value }
        : { issues: [{ message: 'non-negative number expected' }] },
    );

    const total = TestBed.runInInjectionContext(() =>
      craftUse(
        state('total', {
          $self: computed(() => source() * 2),
          schema: numberSchema,
        }),
      ),
    );

    expect(total()).toBe(4);
    source.set(3);
    expect(total()).toBe(6);
  });
});
