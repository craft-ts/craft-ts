import {
  inject,
  InjectionToken,
  isDevMode,
  type Provider,
  type Signal,
  signal,
} from '@angular/core';
import { craftException, type AnyCraftException } from './craft-exception';
import type {
  StandardSchemaV1,
  StandardSchemaV1InferInput,
  StandardSchemaV1InferOutput,
  StandardSchemaV1Issue,
} from './standard-schema';

export type CraftSchema = StandardSchemaV1<any, any>;
export type SchemaInput<Schema extends CraftSchema> =
  StandardSchemaV1InferInput<Schema>;
export type SchemaOutput<Schema extends CraftSchema> =
  StandardSchemaV1InferOutput<Schema>;

export type SchemaValidationStage =
  | 'method'
  | 'params'
  | 'loader'
  | 'state'
  | 'form';

export type SchemaValidationOperation =
  | 'initial'
  | 'set'
  | 'update'
  | 'patch'
  | 'insert'
  | 'source'
  | 'method'
  | 'params'
  | 'loader'
  | 'stream'
  | 'validate';

export type SchemaValidationContext = {
  exception: AnyCraftException;
  primitive: 'state' | 'query' | 'mutation' | 'asyncProcess' | 'form';
  name: string;
  stage: SchemaValidationStage;
  operation: SchemaValidationOperation;
  identifier?: string;
};

export type SchemaValidationDecision = {
  action: 'reject' | 'accept';
};

export type SchemaValidationPolicy = (
  context: SchemaValidationContext,
) => SchemaValidationDecision;

export const CRAFT_SCHEMA_VALIDATION_POLICY =
  new InjectionToken<SchemaValidationPolicy>('CRAFT_SCHEMA_VALIDATION_POLICY', {
    providedIn: 'root',
    factory: () => (context) => {
      // Invalid data is useful feedback during development. In production the
      // application can keep running while the policy callback reports it.
      void context;
      return { action: isDevMode() ? 'reject' : 'accept' };
    },
  });

export function provideCraftSchemaValidationPolicy(
  policy: SchemaValidationPolicy,
): Provider {
  return { provide: CRAFT_SCHEMA_VALIDATION_POLICY, useValue: policy };
}

export type SchemaValidationExceptionPayload = {
  issues: readonly StandardSchemaV1Issue[];
  value: unknown;
  primitive: SchemaValidationContext['primitive'];
  name: string;
  stage: SchemaValidationStage;
  operation: SchemaValidationOperation;
  identifier?: string;
};

export type SchemaValidationException = AnyCraftException & {
  code: 'SCHEMA_VALIDATION_ERROR';
  scope: 'parse';
  payload: SchemaValidationExceptionPayload;
};

export type SchemaParseExceptions = {
  method?: SchemaValidationException;
  params?: SchemaValidationException;
  loader?: SchemaValidationException;
  state?: SchemaValidationException;
};

export type SchemaParseResult<Output> =
  | { ok: true; value: Output }
  | { ok: false; exception: SchemaValidationException };

export function createSchemaValidationException({
  issues,
  value,
  primitive,
  name,
  stage,
  operation,
  identifier,
}: Omit<SchemaValidationExceptionPayload, 'primitive'> & {
  primitive: SchemaValidationContext['primitive'];
}): SchemaValidationException {
  return craftException(
    { code: 'SCHEMA_VALIDATION_ERROR', scope: 'parse' },
    {
      issues,
      value,
      primitive,
      name,
      stage,
      operation,
      ...(identifier === undefined ? {} : { identifier }),
    },
  ) as SchemaValidationException;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function parseSchema<Output>(
  schema: CraftSchema | undefined,
  value: unknown,
  context: Omit<SchemaValidationContext, 'exception'>,
): SchemaParseResult<Output> | Promise<SchemaParseResult<Output>> {
  if (!schema) {
    return { ok: true, value: value as Output };
  }

  const result = schema['~standard'].validate(value);
  if (isPromiseLike(result)) {
    return result.then((resolved) =>
      resolved.issues
        ? {
            ok: false,
            exception: createSchemaValidationException({
              ...context,
              issues: resolved.issues,
              value,
            }),
          }
        : { ok: true, value: resolved.value as Output },
    );
  }

  return result.issues
    ? {
        ok: false,
        exception: createSchemaValidationException({
          ...context,
          issues: result.issues,
          value,
        }),
      }
    : { ok: true, value: result.value as Output };
}

export function useSchemaValidationPolicy(
  injector: { get<T>(token: InjectionToken<T>): T },
  localPolicy?: SchemaValidationPolicy,
): SchemaValidationPolicy {
  return localPolicy ?? injector.get(CRAFT_SCHEMA_VALIDATION_POLICY);
}

export function decideSchemaValidation(
  result: SchemaParseResult<unknown>,
  context: Omit<SchemaValidationContext, 'exception'>,
  policy: SchemaValidationPolicy,
):
  | { accepted: true; value: unknown }
  | { accepted: false; exception: SchemaValidationException } {
  if (result.ok) {
    return { accepted: true, value: result.value };
  }

  const fullContext = { ...context, exception: result.exception };
  const decision = policy(fullContext);
  if (decision.action === 'accept') {
    return { accepted: true, value: contextValue(result.exception) };
  }

  return { accepted: false, exception: result.exception };
}

function contextValue(exception: SchemaValidationException): unknown {
  return exception.payload.value;
}

export function createSchemaExceptionSignal() {
  return signal<AnyCraftException | undefined>(undefined);
}

export type SchemaExceptionSignal = Signal<AnyCraftException | undefined>;

export type SchemaValidationRuntime = ReturnType<
  typeof createSchemaValidationRuntime
>;

export function createSchemaValidationRuntime({
  schema,
  primitive,
  name,
  policy,
  setException,
}: {
  schema?: CraftSchema;
  primitive: SchemaValidationContext['primitive'];
  name: string;
  policy: SchemaValidationPolicy;
  setException: (
    stage: SchemaValidationStage,
    exception: AnyCraftException | undefined,
    identifier?: string,
  ) => void;
}) {
  const parseSync = <Output>(
    value: unknown,
    stage: SchemaValidationStage,
    operation: SchemaValidationOperation,
    identifier?: string,
  ):
    | { accepted: true; value: Output }
    | { accepted: false; exception: AnyCraftException } => {
    const parsed = parseSchema<Output>(schema, value, {
      primitive,
      name,
      stage,
      operation,
      identifier,
    });
    if (parsed instanceof Promise) {
      throw new Error(
        `The ${primitive}:${name} ${stage} schema returned a Promise where a synchronous result is required.`,
      );
    }
    const decision = decideSchemaValidation(
      parsed,
      { primitive, name, stage, operation, identifier },
      policy,
    );
    setException(
      stage,
      decision.accepted ? undefined : decision.exception,
      identifier,
    );
    return decision as
      | { accepted: true; value: Output }
      | { accepted: false; exception: AnyCraftException };
  };

  const parseAsync = async <Output>(
    value: unknown,
    stage: SchemaValidationStage,
    operation: SchemaValidationOperation,
    identifier?: string,
  ): Promise<
    | { accepted: true; value: Output }
    | { accepted: false; exception: AnyCraftException }
  > => {
    const parsed = await parseSchema<Output>(schema, value, {
      primitive,
      name,
      stage,
      operation,
      identifier,
    });
    const decision = decideSchemaValidation(
      parsed,
      { primitive, name, stage, operation, identifier },
      policy,
    );
    setException(
      stage,
      decision.accepted ? undefined : decision.exception,
      identifier,
    );
    return decision as
      | { accepted: true; value: Output }
      | { accepted: false; exception: AnyCraftException };
  };

  return { parseSync, parseAsync };
}
