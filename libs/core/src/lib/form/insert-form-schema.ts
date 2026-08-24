import { computed, inject, Injector, type Signal } from '../host/craft-compat';
import {
  createSchemaValidationException,
  parseSchema,
  type CraftSchema,
  type SchemaInput,
  type SchemaValidationException,
} from '../schema-validation';
import type { StandardSchemaV1PathSegment } from '../standard-schema';
import { rawReactiveValue } from '../reactive-read';
import { craftLinkedSignal } from '../host/craft-linked-signal';
import type {
  InsertionFormFactoryContext,
  InsertionsFormFactory,
} from './insert-form-internals';
import type {
  CraftFieldSchemaErrorEntry,
  CraftFieldSchemaErrorSource,
} from './craft-field';

export type FormSchemaInsertionOutputs = {
  hasSchema: Signal<true>;
  hasSchemaExceptions: Signal<boolean>;
  schemaExceptions: Signal<ReadonlyArray<SchemaValidationException>>;
};

function normalizeIssuePath(
  path: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined,
): ReadonlyArray<string | number> {
  if (!path) return [];

  const normalized: Array<string | number> = [];
  for (const segment of path) {
    const key =
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? segment.key
        : segment;
    if (typeof key !== 'string' && typeof key !== 'number') return [];
    normalized.push(key);
  }
  return normalized;
}

function createSchemaErrorEntries<Schema extends CraftSchema>(
  schema: Schema,
  value: SchemaInput<Schema>,
  context: InsertionFormFactoryContext<SchemaInput<Schema>, {}, unknown>,
): ReadonlyArray<CraftFieldSchemaErrorEntry> {
  const parsed = parseSchema<unknown>(schema, value, {
    primitive: 'form',
    name: 'form',
    stage: 'form',
    operation: 'validate',
  });

  if (parsed instanceof Promise) {
    throw new Error(
      'Form schemas must be synchronous. Use cAsyncValidate or an async resource for asynchronous validation.',
    );
  }

  if (parsed.ok) return [];

  return parsed.exception.payload.issues.map((issue) => ({
    path: normalizeIssuePath(issue.path),
    error: createSchemaValidationException({
      issues: [issue],
      value,
      primitive: 'form',
      name: 'form',
      stage: 'form',
      operation: 'validate',
      ...(context.formIdentifier === undefined
        ? {}
        : { identifier: String(context.formIdentifier) }),
    }),
  }));
}

export function insertFormSchema<Schema extends CraftSchema>(
  schema: Schema,
): InsertionsFormFactory<
  SchemaInput<Schema>,
  unknown,
  FormSchemaInsertionOutputs,
  {}
> {
  return (
    context: InsertionFormFactoryContext<SchemaInput<Schema>, {}, unknown>,
  ) => {
    const stateValue = craftLinkedSignal({
      source: () => rawReactiveValue(context.state)(),
      computation: (value) => value,
      injector: inject(Injector),
    });
    const errors = computed(() =>
      createSchemaErrorEntries(schema, stateValue(), context),
    ) as CraftFieldSchemaErrorSource;

    context.field.ɵregisterSchemaErrorSource(errors);

    return {
      hasSchema: computed(() => true as const),
      hasSchemaExceptions: computed(() => errors().length > 0),
      schemaExceptions: computed(() =>
        errors().map((entry) => entry.error as SchemaValidationException),
      ),
    };
  };
}
