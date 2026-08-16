/**
 * Minimal local copy of the Standard Schema V1 types used by Craft.
 *
 * Source: https://github.com/standard-schema/standard-schema/blob/main/packages/spec/src/index.ts
 * The upstream project is distributed under the MIT license.
 *
 * Nested types used to live in `export namespace StandardSchemaV1`; that form
 * is replaced by sibling interfaces so the package stays `erasableSyntaxOnly`.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1Props<Input, Output>;
}

export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly types?: StandardSchemaV1Types<Input, Output>;
  readonly validate: (
    value: unknown,
    options?: StandardSchemaV1Options,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
}

export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

export interface StandardSchemaV1Options {
  readonly libraryOptions?: Record<string, unknown>;
}

export type StandardSchemaV1Result<Output> =
  | StandardSchemaV1SuccessResult<Output>
  | StandardSchemaV1FailureResult;

export interface StandardSchemaV1SuccessResult<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

export interface StandardSchemaV1FailureResult {
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>;
}

export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment>;
}

export interface StandardSchemaV1PathSegment {
  readonly key: PropertyKey;
}

export type StandardSchemaV1InferInput<Schema extends StandardSchemaV1> =
  NonNullable<Schema['~standard']['types']>['input'];

export type StandardSchemaV1InferOutput<Schema extends StandardSchemaV1> =
  NonNullable<Schema['~standard']['types']>['output'];
