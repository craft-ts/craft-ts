import {
  computed,
  effect,
  ResourceStatus,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import {
  AnyCraftException,
  CraftExceptionResult,
  CRAFT_EXCEPTION_SYMBOL,
  ExcludeByCode,
  ExtractCodeFromCraftResultUnion,
  InsertMetaInCraftExceptionIfExists,
} from '../craft-exception';
import { ResourceByIdLikeQueryRef, ResourceLikeQueryRef } from '../query';
import { ResourceExceptionConstraints } from '../query.core';

export const FORM_VALIDATOR_SYMBOL = Symbol('FORM_VALIDATOR_SYMBOL');
export const VALIDATOR_OUTPUT_SYMBOL = Symbol('VALIDATOR_OUTPUT_SYMBOL');

export type FormValidator<TValue, Identifier = unknown> = {
  readonly [FORM_VALIDATOR_SYMBOL]: true;
  readonly value: TValue;
} & ([unknown] extends [Identifier]
  ? {
      readonly identifier?: undefined;
    }
  : {
      readonly identifier: Identifier;
    });

export type ValidatorType = 'sync' | 'async';

export type ValidatorUtilBrand<
  Name,
  Type extends ValidatorType = ValidatorType,
  Meta extends object = {},
> = {
  __brand: Name;
  type: Type;
} & Meta;

export type ValidatorSuccess<
  Name extends string,
  Type extends ValidatorType = 'sync',
  Meta extends object = {},
> = {
  valid: true;
} & ValidatorUtilBrand<Name, Type, Meta>;

type ValidatorExceptionOutput<
  Name extends string,
  Exceptions,
  Type extends ValidatorType,
  Meta extends object,
> = Exceptions extends undefined
  ? never
  : Exceptions & ValidatorUtilBrand<Name, Type, Meta>;

type DirectValidatorExecutionOutput<
  Name extends string,
  Exceptions,
  Type extends ValidatorType,
  Meta extends object,
> = undefined | ValidatorExceptionOutput<Name, Exceptions, Type, Meta>;

type ValidatorExecution<
  Name extends string,
  Exceptions,
  Type extends ValidatorType,
  Meta extends object = {},
> = () => Type extends 'async'
  ? Promise<DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>>
  : DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>;

type ValidatorRuntimeKind = 'output' | 'deferred';

type ValidatorRuntime<
  Name extends string = string,
  Type extends ValidatorType = ValidatorType,
  Kind extends ValidatorRuntimeKind = ValidatorRuntimeKind,
> = {
  readonly name: Name;
  readonly type: Type;
  readonly kind: Kind;
};

type ValidatorRuntimeCarrier<
  Name extends string = string,
  Type extends ValidatorType = ValidatorType,
  Kind extends ValidatorRuntimeKind = ValidatorRuntimeKind,
> = {
  readonly [VALIDATOR_OUTPUT_SYMBOL]: ValidatorRuntime<Name, Type, Kind>;
};

export type ValidatorOutput<
  TValue,
  Name extends string,
  Exceptions,
  Type extends ValidatorType = 'sync',
  Identifier = unknown,
  Meta extends object = {},
> = ((
  model?: ValidatorModel<TValue>,
  identifier?: Identifier,
) => Type extends 'async'
  ? Promise<DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>>
  : DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>) &
  ValidatorRuntimeCarrier<Name, Type, 'output'>;

export type ValidatorModel<TValue> = () => {
  value: () => TValue;
};

type ValidatorOption<TValue> = TValue | (() => TValue);

type ValidatorConfigWithOptionalModel<TValue> = {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
};

type ValueWithLengthOrSize =
  | {
      length: number;
    }
  | {
      size: number;
    };

type ValidatorException<
  Code extends string,
  Payload = undefined,
> = CraftExceptionResult<
  {
    code: Code;
  },
  Payload
>;

export type CRequiredException = ValidatorException<'required'>;
export type CEmailException = ValidatorException<'email'>;
export type CMinException = ValidatorException<'min', number>;
export type CMaxException = ValidatorException<'max', number>;
export type CMinLengthException = ValidatorException<'minLength', number>;
export type CMaxLengthException = ValidatorException<'maxLength', number>;
type CPatternException = ValidatorException<'pattern', RegExp>;

type CRequiredConfig<TValue> = ValidatorConfigWithOptionalModel<TValue>;
type CEmailConfig<TValue extends string | null | undefined> =
  ValidatorConfigWithOptionalModel<TValue>;
type CMinConfig<TValue extends number | string | null | undefined> =
  ValidatorConfigWithOptionalModel<TValue> &
    (
      | {
          min: ValidatorOption<number | undefined>;
          minValue?: never;
        }
      | {
          min?: never;
          minValue: ValidatorOption<number | undefined>;
        }
    );
type CMaxConfig<TValue extends number | string | null | undefined> =
  ValidatorConfigWithOptionalModel<TValue> &
    (
      | {
          max: ValidatorOption<number | undefined>;
          maxValue?: never;
        }
      | {
          max?: never;
          maxValue: ValidatorOption<number | undefined>;
        }
    );
type CMinLengthConfig<TValue extends ValueWithLengthOrSize> =
  ValidatorConfigWithOptionalModel<TValue> & {
    minLength: ValidatorOption<number | undefined>;
  };
type CMaxLengthConfig<TValue extends ValueWithLengthOrSize> =
  ValidatorConfigWithOptionalModel<TValue> & {
    maxLength: ValidatorOption<number | undefined>;
  };
type CPatternConfig<TValue extends string | null | undefined> =
  ValidatorConfigWithOptionalModel<TValue> & {
    pattern: ValidatorOption<RegExp | undefined>;
  };

type ValidatorContext<TValue> = {
  model: ValidatorModel<TValue>;
  value: TValue;
};

type CValidateSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
> = ValidatorConfigWithOptionalModel<TValue> & {
  name: Name;
  type?: 'sync';
  validate: (context: ValidatorContext<TValue>) => Exceptions | undefined;
};

type CValidateAsyncConfig<
  TValue,
  Name extends string,
  Exceptions,
> = ValidatorConfigWithOptionalModel<TValue> & {
  name: Name;
  type: 'async';
  validate: (
    context: ValidatorContext<TValue>,
  ) => Promise<Exceptions | undefined> | Exceptions | undefined;
};

type AsyncValidatorMeta = {
  status: ResourceStatus;
};

type AsyncValidatorRuntime = {
  pending: Signal<boolean>;
  markTriggered: () => void;
  reset: () => void;
};

type AsyncValidatorInvalidState = {
  valid: false;
};

type AsyncValidatorQueryExceptions<
  QueryExceptions extends ResourceExceptionConstraints,
  Identifier extends string | number | unknown,
> = {
  list: (
    | InsertMetaInCraftExceptionIfExists<
        QueryExceptions['params'],
        'params',
        unknown
      >
    | InsertMetaInCraftExceptionIfExists<
        QueryExceptions['loader'],
        'loader',
        Identifier
      >
  )[];
  params?:
    | InsertMetaInCraftExceptionIfExists<
        QueryExceptions['params'],
        'params',
        unknown
      >
    | {};
  loader?:
    | InsertMetaInCraftExceptionIfExists<
        QueryExceptions['loader'],
        'loader',
        Identifier
      >
    | {};
};

type AsyncValidatorQueryTarget<
  Value,
  QueryExceptions extends ResourceExceptionConstraints,
  Identifier extends string | number | unknown,
> = {
  readonly value: Signal<Value | undefined>;
  readonly safeValue: Signal<Value | undefined>;
  readonly status: Signal<ResourceStatus>;
  readonly error: Signal<Error | undefined>;
  readonly isLoading: Signal<boolean>;
  hasValue(): boolean;
  hasException(): boolean;
  exceptions: Signal<
    AsyncValidatorQueryExceptions<QueryExceptions, Identifier>
  >;
};

type AsyncValidatorExceptionUnion<QueryCraftResource> =
  QueryCraftResource extends {
    exceptions: Signal<{ list: (infer ExceptionList)[] }>;
  }
    ? ExceptionList
    : AnyCraftException;

type AsyncValidatorContext<
  TValue,
  QueryValue,
  QueryExceptions extends ResourceExceptionConstraints,
  QueryIdentifier extends string | number | unknown,
  FormIdentifier extends string | number | unknown,
  QueryCraftResource extends AsyncValidatorQueryTarget<
    QueryValue,
    QueryExceptions,
    QueryIdentifier
  > = AsyncValidatorQueryTarget<QueryValue, QueryExceptions, QueryIdentifier>,
  QueryExceptionCodes = ExtractCodeFromCraftResultUnion<
    AsyncValidatorExceptionUnion<QueryCraftResource>
  >,
> = {
  queryCraftResource: QueryCraftResource;
  model: ValidatorModel<TValue>;
  identifier: FormIdentifier;
  status: ResourceStatus;
  exceptions: AsyncValidatorExceptionUnion<QueryCraftResource>;
  omitExceptions: <C extends QueryExceptionCodes>(
    codes: readonly C[],
  ) => ExcludeByCode<AsyncValidatorExceptionUnion<QueryCraftResource>, C>;
};

type IsValidExceptions<T> =
  NonNullable<T> extends AnyCraftException
    ? true
    : [unknown] extends [T]
      ? true
      : false;

type HasReturnValidExceptions<
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> =
  IsValidExceptions<SuccessExceptions> extends true
    ? IsValidExceptions<ErrorExceptions> extends true
      ? IsValidExceptions<ExceptionExceptions> extends true
        ? true
        : {
            success: true;
            error: true;
            exceptions: false;
          }
      : {
          success: true;
          error: false;
          exceptions: IsValidExceptions<ExceptionExceptions>;
        }
    : {
        success: false;
        error: IsValidExceptions<ErrorExceptions>;
        exceptions: IsValidExceptions<ExceptionExceptions>;
      };
type ValidationDetails = {
  success: boolean;
  error: boolean;
  exceptions: boolean;
};

type InvalidExceptionsMessage<T> = T extends true
  ? never
  : T extends ValidationDetails
    ? `Not valid ${
        | (T['success'] extends false ? 'success callback' : never)
        | (T['error'] extends false ? 'error callback' : never)
        | (T['exceptions'] extends false ? 'exceptions callback' : never)}`
    : never;

type CAsyncValidatorConfig<
  TValue,
  QueryValue,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  QueryExceptions extends ResourceExceptionConstraints,
  QueryIdentifier extends string | number | unknown,
  FormIdentifier extends string | number | unknown,
> = {
  when?: ValidatorOption<boolean>;
  success?: (
    context: AsyncValidatorContext<
      TValue,
      QueryValue,
      QueryExceptions,
      QueryIdentifier,
      FormIdentifier
    >,
  ) => SuccessExceptions;
  error?: (
    context: AsyncValidatorContext<
      TValue,
      QueryValue,
      QueryExceptions,
      QueryIdentifier,
      FormIdentifier
    >,
  ) => ErrorExceptions;
  exception?: (
    context: AsyncValidatorContext<
      TValue,
      QueryValue,
      QueryExceptions,
      QueryIdentifier,
      FormIdentifier
    >,
  ) => ExceptionExceptions;
} & (HasReturnValidExceptions<
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions
> extends true
  ? {}
  : {
      typingError: `cAsyncValidator callbacks must only return Craft exceptions or undefined. ${InvalidExceptionsMessage<HasReturnValidExceptions<SuccessExceptions, ErrorExceptions, ExceptionExceptions>>}`;
    });

type ToAsyncValidatorExceptions<
  QueryExceptions extends AnyCraftException | undefined | unknown,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  FormIdentifier extends string | number | unknown,
> = [unknown] extends [ExceptionExceptions]
  ? Exclude<
      QueryExceptions &
        InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'cAsyncValidatorSuccess',
          FormIdentifier
        > &
        InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'cAsyncValidatorError',
          FormIdentifier
        >,
      undefined
    >
  : Exclude<
      | InsertMetaInCraftExceptionIfExists<
          ExceptionExceptions,
          'cAsyncValidatorException',
          FormIdentifier
        >
      | InsertMetaInCraftExceptionIfExists<
          SuccessExceptions,
          'cAsyncValidatorSuccess',
          FormIdentifier
        >
      | InsertMetaInCraftExceptionIfExists<
          ErrorExceptions,
          'cAsyncValidatorError',
          FormIdentifier
        >,
      undefined
    >;

type CAsyncValidatorOutputExceptions<
  QueryExceptions extends AnyCraftException | undefined | unknown,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  FormIdentifier extends string | number | unknown,
> =
  | AsyncValidatorInvalidState
  | ToAsyncValidatorExceptions<
      QueryExceptions,
      SuccessExceptions,
      ErrorExceptions,
      ExceptionExceptions,
      FormIdentifier
    >
  | ToAsyncValidatorExceptions<
      QueryExceptions,
      SuccessExceptions,
      ErrorExceptions,
      ExceptionExceptions,
      FormIdentifier
    >[];

const EMAIL_REGEXP =
  /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const SYNC_VALIDATOR_TYPE = 'sync' as const;
const ASYNC_VALIDATOR_TYPE = 'async' as const;
const IDLE_RESOURCE_STATUS = 'idle' as ResourceStatus;

function hasLength(value: unknown): value is { length: number } {
  if (typeof value === 'string') {
    return true;
  }

  return (
    (Array.isArray(value) || ArrayBuffer.isView(value)) &&
    typeof (value as { length?: unknown }).length === 'number'
  );
}

function isValidatorModel<TValue>(
  value: unknown,
): value is ValidatorModel<TValue> {
  return typeof value === 'function';
}

function isResourceByIdLikeQueryRef<
  Value,
  Params,
  ArgParams,
  SourceParams,
  Insertions,
  Identifier,
  QueryExceptions extends ResourceExceptionConstraints,
>(
  value: unknown,
): value is ResourceByIdLikeQueryRef<
  Value,
  Params,
  true,
  ArgParams,
  SourceParams,
  Insertions,
  Identifier,
  QueryExceptions
> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type?: unknown }).type === 'resourceByGroupLike' &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === 'query' &&
    'select' in value &&
    typeof (value as { select?: unknown }).select === 'function'
  );
}

function getLengthOrSize(value: ValueWithLengthOrSize): number {
  if (hasLength(value)) {
    return value.length;
  }

  return value.size;
}

function isEmpty(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isNaN(value);
  }

  return value === '' || value === false || value == null;
}

function resolveValidatorOption<TValue>(
  option: ValidatorOption<TValue>,
): TValue {
  if (typeof option === 'function') {
    return (option as () => TValue)();
  }

  return option;
}

function resolveValidatorModel<TValue>(
  model: ValidatorModel<TValue> | undefined,
  fallbackModel: ValidatorModel<TValue> | undefined,
): ValidatorModel<TValue> {
  const resolvedModel = model ?? fallbackModel;

  if (!resolvedModel) {
    throw new Error('A validator model is required.');
  }

  return resolvedModel;
}

function resolveValidatorIdentifier<Identifier>(
  identifier: Identifier | undefined,
): Identifier {
  if (identifier === undefined) {
    throw new Error('A validator identifier is required.');
  }

  return identifier;
}

function shouldValidate(when?: ValidatorOption<boolean>): boolean {
  return when ? resolveValidatorOption(when) : true;
}

function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function isCraftExceptionLike(value: unknown): value is AnyCraftException {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

function normalizeExceptionList(
  value: unknown,
): AnyCraftException[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter(isCraftExceptionLike);
  }

  if (isCraftExceptionLike(value)) {
    return [value];
  }

  return undefined;
}

function toValidatorExceptionResult<Exception>(
  exceptions: Exception[],
): Exception | Exception[] | undefined {
  if (exceptions.length === 0) {
    return undefined;
  }

  if (exceptions.length === 1) {
    return exceptions[0];
  }

  return exceptions;
}

function createFormValidatorPayload<TValue, Identifier>(
  value: TValue,
  identifier?: Identifier,
): FormValidator<TValue, Identifier> {
  if (identifier === undefined) {
    return {
      [FORM_VALIDATOR_SYMBOL]: true,
      value,
    } as FormValidator<TValue, Identifier>;
  }

  return {
    [FORM_VALIDATOR_SYMBOL]: true,
    value,
    identifier,
  } as unknown as FormValidator<TValue, Identifier>;
}

function createValidatorSuccess<
  const Name extends string,
  const Type extends ValidatorType,
  Meta extends object = {},
>(brand: Name, type: Type, meta?: Meta): ValidatorSuccess<Name, Type, Meta> {
  return {
    valid: true,
    __brand: brand,
    type,
    ...(meta ?? ({} as Meta)),
  };
}

function withValidatorBrand<
  const Name extends string,
  Exceptions,
  const Type extends ValidatorType,
  Meta extends object = {},
>(
  brand: Name,
  type: Type,
  exception: Exceptions,
  meta?: Meta,
): ValidatorExceptionOutput<Name, Exceptions, Type, Meta> {
  const base =
    Array.isArray(exception) && exception.every((item) => item !== undefined)
      ? [...exception]
      : { ...(exception as object) };

  return Object.assign(base, meta ?? {}, {
    __brand: brand,
    type,
  }) as ValidatorExceptionOutput<Name, Exceptions, Type, Meta>;
}

function withValidatorRuntime<
  TValidator extends Function,
  const Name extends string,
  const Type extends ValidatorType,
  const Kind extends ValidatorRuntimeKind,
>(
  validator: TValidator,
  runtime: ValidatorRuntime<Name, Type, Kind>,
): TValidator & ValidatorRuntimeCarrier<Name, Type, Kind> {
  return Object.assign(validator, {
    [VALIDATOR_OUTPUT_SYMBOL]: runtime,
  }) as TValidator & ValidatorRuntimeCarrier<Name, Type, Kind>;
}

function createValidatorInvalid<
  const Name extends string,
  const Type extends ValidatorType,
  Meta extends object,
>(
  brand: Name,
  type: Type,
  meta: Meta,
): ValidatorExceptionOutput<Name, AsyncValidatorInvalidState, Type, Meta> {
  return withValidatorBrand(
    brand,
    type,
    {
      valid: false as const,
    },
    meta,
  );
}

function createValidatorException<
  const Name extends string,
  const Code extends string,
  const Type extends ValidatorType,
  Meta extends object = {},
  Payload = undefined,
>(
  brand: Name,
  type: Type,
  code: Code,
  payload: Payload,
  meta?: Meta,
): ValidatorException<Code, Payload> & ValidatorUtilBrand<Name, Type, Meta> {
  return withValidatorBrand(
    brand,
    type,
    {
      code,
      [CRAFT_EXCEPTION_SYMBOL]: true,
      payload,
      [code]: payload,
    } as ValidatorException<Code, Payload>,
    meta,
  );
}

function createRequiredValidator<TValue>({
  model,
  when,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (shouldValidate(when) && isEmpty(resolvedModel().value())) {
        return createValidatorException(
          'cRequired',
          SYNC_VALIDATOR_TYPE,
          'required',
          undefined,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cRequired', CRequiredException>,
    {
      name: 'cRequired',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createEmailValidator<TValue extends string | null | undefined>({
  model,
  when,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      if (!EMAIL_REGEXP.test(value as string)) {
        return createValidatorException(
          'cEmail',
          SYNC_VALIDATOR_TYPE,
          'email',
          undefined,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cEmail', CEmailException>,
    {
      name: 'cEmail',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createMinValidator<TValue extends number | string | null | undefined>({
  model,
  when,
  min,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  min: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMin', CMinException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      const minValue = resolveValidatorOption(min);

      if (minValue === undefined || Number.isNaN(minValue)) {
        return undefined;
      }

      const numericValue = !value && value !== 0 ? Number.NaN : Number(value);

      if (numericValue < minValue) {
        return createValidatorException(
          'cMin',
          SYNC_VALIDATOR_TYPE,
          'min',
          minValue,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cMin', CMinException>,
    {
      name: 'cMin',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createMaxValidator<TValue extends number | string | null | undefined>({
  model,
  when,
  max,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  max: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMax', CMaxException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      const maxValue = resolveValidatorOption(max);

      if (maxValue === undefined || Number.isNaN(maxValue)) {
        return undefined;
      }

      const numericValue = !value && value !== 0 ? Number.NaN : Number(value);

      if (numericValue > maxValue) {
        return createValidatorException(
          'cMax',
          SYNC_VALIDATOR_TYPE,
          'max',
          maxValue,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cMax', CMaxException>,
    {
      name: 'cMax',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createMinLengthValidator<TValue extends ValueWithLengthOrSize>({
  model,
  when,
  minLength,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  minLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMinLength', CMinLengthException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      const resolvedMinLength = resolveValidatorOption(minLength);

      if (resolvedMinLength === undefined) {
        return undefined;
      }

      if (getLengthOrSize(value) < resolvedMinLength) {
        return createValidatorException(
          'cMinLength',
          SYNC_VALIDATOR_TYPE,
          'minLength',
          resolvedMinLength,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cMinLength', CMinLengthException>,
    {
      name: 'cMinLength',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createMaxLengthValidator<TValue extends ValueWithLengthOrSize>({
  model,
  when,
  maxLength,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  maxLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      const resolvedMaxLength = resolveValidatorOption(maxLength);

      if (resolvedMaxLength === undefined) {
        return undefined;
      }

      if (getLengthOrSize(value) > resolvedMaxLength) {
        return createValidatorException(
          'cMaxLength',
          SYNC_VALIDATOR_TYPE,
          'maxLength',
          resolvedMaxLength,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException>,
    {
      name: 'cMaxLength',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createPatternValidator<TValue extends string | null | undefined>({
  model,
  when,
  pattern,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  pattern: ValidatorOption<RegExp | undefined>;
}): ValidatorOutput<TValue, 'cPattern', CPatternException> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const value = resolvedModel().value();

      if (isEmpty(value)) {
        return undefined;
      }

      const resolvedPattern = resolveValidatorOption(pattern);

      if (resolvedPattern === undefined) {
        return undefined;
      }

      if (!resolvedPattern.test(value as string)) {
        return createValidatorException(
          'cPattern',
          SYNC_VALIDATOR_TYPE,
          'pattern',
          resolvedPattern,
        );
      }

      return undefined;
    }) as ValidatorOutput<TValue, 'cPattern', CPatternException>,
    {
      name: 'cPattern',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createCustomSyncValidator<TValue, Name extends string, Exceptions>({
  model,
  when,
  name,
  validate,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  name: Name;
  validate: (context: ValidatorContext<TValue>) => Exceptions | undefined;
}): ValidatorOutput<TValue, Name, Exceptions, 'sync'> {
  return withValidatorRuntime(
    ((runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const validationResult = validate({
        model: resolvedModel,
        value: resolvedModel().value(),
      });

      if (isPromiseLike(validationResult)) {
        throw new Error(
          `Validator "${name}" returned a Promise but is declared as sync.`,
        );
      }

      if (validationResult === undefined) {
        return undefined;
      }

      return withValidatorBrand(name, SYNC_VALIDATOR_TYPE, validationResult);
    }) as ValidatorOutput<TValue, Name, Exceptions, 'sync'>,
    {
      name,
      type: SYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createCustomAsyncValidator<TValue, Name extends string, Exceptions>({
  model,
  when,
  name,
  validate,
}: {
  model?: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  name: Name;
  validate: (
    context: ValidatorContext<TValue>,
  ) => Promise<Exceptions | undefined> | Exceptions | undefined;
}): ValidatorOutput<TValue, Name, Exceptions, 'async'> {
  return withValidatorRuntime(
    (async (runtimeModel?: ValidatorModel<TValue>, _identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(model, runtimeModel);

      if (!shouldValidate(when)) {
        return undefined;
      }

      const validationResult = await validate({
        model: resolvedModel,
        value: resolvedModel().value(),
      });

      if (validationResult === undefined) {
        return undefined;
      }

      return withValidatorBrand(name, ASYNC_VALIDATOR_TYPE, validationResult);
    }) as ValidatorOutput<TValue, Name, Exceptions, 'async'>,
    {
      name,
      type: ASYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}

function createAsyncValidatorQueryTarget<
  Value,
  QueryParams,
  QueryArgParams,
  QuerySourceParams,
  QueryInsertions,
  QueryIdentifier extends string | number,
  QueryExceptions extends ResourceExceptionConstraints,
>(
  queryRef: ResourceByIdLikeQueryRef<
    Value,
    QueryParams,
    true,
    QueryArgParams,
    QuerySourceParams,
    QueryInsertions,
    QueryIdentifier,
    QueryExceptions
  >,
  identifier: QueryIdentifier,
): AsyncValidatorQueryTarget<Value, QueryExceptions, QueryIdentifier> {
  const selectedResource = computed(() => queryRef.select(identifier));

  const exceptions = computed<
    AsyncValidatorQueryExceptions<QueryExceptions, QueryIdentifier>
  >(() => {
    const selected = selectedResource();
    if (selected) {
      return selected.exceptions() as AsyncValidatorQueryExceptions<
        QueryExceptions,
        QueryIdentifier
      >;
    }

    const rootExceptions = (
      queryRef as {
        exceptions: Signal<{
          params?: AnyCraftException | {};
          loader?: Record<string, AnyCraftException>;
        }>;
      }
    ).exceptions();
    const paramsException = isCraftExceptionLike(rootExceptions.params)
      ? rootExceptions.params
      : undefined;
    const loaderException = isCraftExceptionLike(
      rootExceptions.loader?.[String(identifier)],
    )
      ? rootExceptions.loader[String(identifier)]
      : undefined;

    return {
      list: [paramsException, loaderException].filter(Boolean) as (
        | InsertMetaInCraftExceptionIfExists<
            QueryExceptions['params'],
            'params',
            unknown
          >
        | InsertMetaInCraftExceptionIfExists<
            QueryExceptions['loader'],
            'loader',
            QueryIdentifier
          >
      )[],
      params: (paramsException ?? {}) as AsyncValidatorQueryExceptions<
        QueryExceptions,
        QueryIdentifier
      >['params'],
      loader: (loaderException ?? {}) as AsyncValidatorQueryExceptions<
        QueryExceptions,
        QueryIdentifier
      >['loader'],
    };
  });

  const hasException = computed(() => exceptions().list.length > 0);

  return {
    value: computed(() => selectedResource()?.value()),
    safeValue: computed(() => selectedResource()?.safeValue()),
    status: computed(
      () => selectedResource()?.status() ?? IDLE_RESOURCE_STATUS,
    ),
    error: computed(() => selectedResource()?.error()),
    isLoading: computed(() => selectedResource()?.isLoading() ?? false),
    hasValue: () => selectedResource()?.hasValue() ?? false,
    hasException: () => hasException(),
    exceptions,
  };
}

function createAsyncValidatorRuntime<
  QueryValue,
  QueryExceptions extends ResourceExceptionConstraints,
  QueryIdentifier extends string | number | unknown,
>(
  queryCraftResource: AsyncValidatorQueryTarget<
    QueryValue,
    QueryExceptions,
    QueryIdentifier
  >,
): AsyncValidatorRuntime {
  const pending = signal(false);
  const hasStartedCurrentRequest = signal(false);

  effect(() => {
    if (!pending()) {
      return;
    }

    const status = queryCraftResource.status();
    const isLoading =
      status === 'loading' || status === ('reloading' as ResourceStatus);

    if (!hasStartedCurrentRequest()) {
      if (isLoading) {
        hasStartedCurrentRequest.set(true);
        return;
      }

      if (queryCraftResource.hasException()) {
        hasStartedCurrentRequest.set(false);
        pending.set(false);
      }
      return;
    }

    if (!isLoading) {
      hasStartedCurrentRequest.set(false);
      pending.set(false);
    }
  });

  return {
    pending,
    markTriggered: () => {
      hasStartedCurrentRequest.set(false);
      pending.set(true);
    },
    reset: () => {
      hasStartedCurrentRequest.set(false);
      pending.set(false);
    },
  };
}

function triggerAsyncValidatorQuery<
  TValue,
  QueryValue,
  QueryParams,
  QueryArgParams extends FormValidator<TValue, Identifier>,
  QuerySourceParams,
  QueryInsertions,
  Identifier,
  QueryExceptions extends ResourceExceptionConstraints,
>({
  queryRef,
  model,
  when,
  identifier,
  runtime,
}: {
  queryRef:
    | ResourceLikeQueryRef<
        QueryValue,
        QueryParams,
        true,
        QueryArgParams,
        QuerySourceParams,
        QueryInsertions,
        QueryExceptions
      >
    | ResourceByIdLikeQueryRef<
        QueryValue,
        QueryParams,
        true,
        QueryArgParams,
        QuerySourceParams,
        QueryInsertions,
        Identifier,
        QueryExceptions
      >;
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  identifier?: Identifier;
  runtime: AsyncValidatorRuntime;
}) {
  effect(() => {
    if (!shouldValidate(when)) {
      runtime.reset();
      return;
    }

    runtime.markTriggered();

    const payload = createFormValidatorPayload(
      model().value(),
      identifier as Identifier | undefined,
    );

    untracked(() => {
      (queryRef as { call: (payload: QueryArgParams) => unknown }).call(
        payload as QueryArgParams,
      );
    });
  });
}

function createAsyncValidator<
  TValue,
  Name extends string,
  QueryValue,
  QueryExceptions extends ResourceExceptionConstraints,
  QueryIdentifier extends string | number | unknown,
  FormIdentifier extends string | number | unknown,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
>({
  name,
  model,
  when,
  queryCraftResource,
  identifier,
  config,
  runtime,
}: {
  name: Name;
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  queryCraftResource: AsyncValidatorQueryTarget<
    QueryValue,
    QueryExceptions,
    QueryIdentifier
  >;
  identifier: FormIdentifier;
  config?: CAsyncValidatorConfig<
    TValue,
    QueryValue,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    QueryExceptions,
    QueryIdentifier,
    FormIdentifier
  >;
  runtime: AsyncValidatorRuntime;
}): ValidatorExecution<Name, any, 'async', AsyncValidatorMeta> {
  return async () => {
    const queryStatus = queryCraftResource.status();
    const status =
      runtime.pending() &&
      queryStatus !== 'loading' &&
      queryStatus !== ('reloading' as ResourceStatus)
        ? ('loading' as ResourceStatus)
        : queryStatus;

    if (!shouldValidate(when)) {
      return undefined;
    }

    const resourceExceptions = queryCraftResource.exceptions()
      .list as AnyCraftException[];

    const omitExceptions = (codes: string[]) =>
      resourceExceptions.filter(
        (exception) => !codes.includes(exception.code),
      ) as AsyncValidatorExceptionUnion<
        AsyncValidatorQueryTarget<QueryValue, QueryExceptions, QueryIdentifier>
      >;

    const context = {
      queryCraftResource,
      model,
      identifier,
      status,
      exceptions: resourceExceptions as AsyncValidatorExceptionUnion<
        AsyncValidatorQueryTarget<QueryValue, QueryExceptions, QueryIdentifier>
      >,
      omitExceptions,
    } as AsyncValidatorContext<
      TValue,
      QueryValue,
      QueryExceptions,
      QueryIdentifier,
      FormIdentifier
    >;

    let mergedExceptions = resourceExceptions as AnyCraftException[];

    if (
      typeof config?.exception === 'function' &&
      queryCraftResource.hasException()
    ) {
      const nextExceptions = normalizeExceptionList(config.exception(context));
      if (nextExceptions) {
        mergedExceptions = nextExceptions;
      }
    }

    if (status === 'resolved' && typeof config?.success === 'function') {
      const nextExceptions = normalizeExceptionList(
        config.success({
          ...context,
          exceptions: mergedExceptions as AsyncValidatorExceptionUnion<
            AsyncValidatorQueryTarget<
              QueryValue,
              QueryExceptions,
              QueryIdentifier
            >
          >,
        }),
      );

      if (nextExceptions?.length) {
        mergedExceptions = [...mergedExceptions, ...nextExceptions];
      }
    }

    if (status === 'error' && typeof config?.error === 'function') {
      const nextExceptions = normalizeExceptionList(
        config.error({
          ...context,
          exceptions: mergedExceptions as AsyncValidatorExceptionUnion<
            AsyncValidatorQueryTarget<
              QueryValue,
              QueryExceptions,
              QueryIdentifier
            >
          >,
        }),
      );

      if (nextExceptions?.length) {
        mergedExceptions = [...mergedExceptions, ...nextExceptions];
      }
    }

    const exceptionResult = toValidatorExceptionResult(mergedExceptions);

    if (exceptionResult !== undefined) {
      return withValidatorBrand(name, ASYNC_VALIDATOR_TYPE, exceptionResult, {
        status,
      });
    }

    if (status !== 'resolved') {
      return createValidatorInvalid(name, ASYNC_VALIDATOR_TYPE, {
        status,
      });
    }

    return undefined;
  };
}

export function cRequired<TValue>(
  model: ValidatorModel<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException>;
export function cRequired<TValue>(
  config?: CRequiredConfig<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException>;
export function cRequired<TValue>(
  input?: ValidatorModel<TValue> | CRequiredConfig<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  if (isValidatorModel(input)) {
    return createRequiredValidator({
      model: input,
    });
  }

  return createRequiredValidator(input ?? {});
}

export function cEmail<TValue extends string | null | undefined>(
  model: ValidatorModel<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException>;
export function cEmail<TValue extends string | null | undefined>(
  config?: CEmailConfig<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException>;
export function cEmail<TValue extends string | null | undefined>(
  input?: ValidatorModel<TValue> | CEmailConfig<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  if (isValidatorModel(input)) {
    return createEmailValidator({
      model: input,
    });
  }

  return createEmailValidator(input ?? {});
}

export function cMin<TValue extends number | string | null | undefined>(
  config: CMinConfig<TValue>,
): ValidatorOutput<TValue, 'cMin', CMinException> {
  return createMinValidator({
    model: config.model,
    when: config.when,
    min: 'min' in config ? config.min : config.minValue,
  });
}

export function cMax<TValue extends number | string | null | undefined>(
  config: CMaxConfig<TValue>,
): ValidatorOutput<TValue, 'cMax', CMaxException> {
  return createMaxValidator({
    model: config.model,
    when: config.when,
    max: 'max' in config ? config.max : config.maxValue,
  });
}

export function cMinLength<TValue extends ValueWithLengthOrSize>(
  config: CMinLengthConfig<TValue>,
): ValidatorOutput<TValue, 'cMinLength', CMinLengthException> {
  return createMinLengthValidator(config);
}

export function cMaxLength<TValue extends ValueWithLengthOrSize>(
  config: CMaxLengthConfig<TValue>,
): ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException> {
  return createMaxLengthValidator(config);
}

export function cPattern<TValue extends string | null | undefined>(
  config: CPatternConfig<TValue>,
): ValidatorOutput<TValue, 'cPattern', CPatternException> {
  return createPatternValidator(config);
}

export function cValidator<TValue, const Name extends string, Exceptions>(
  config: CValidateSyncConfig<TValue, Name, Exceptions>,
): ValidatorOutput<TValue, Name, Exceptions, 'sync'>;
export function cValidator<TValue, const Name extends string, Exceptions>(
  config: CValidateAsyncConfig<TValue, Name, Exceptions>,
): ValidatorOutput<TValue, Name, Exceptions, 'async'>;
export function cValidator<TValue, const Name extends string, Exceptions>(
  config:
    | CValidateSyncConfig<TValue, Name, Exceptions>
    | CValidateAsyncConfig<TValue, Name, Exceptions>,
): ValidatorOutput<TValue, Name, Exceptions, ValidatorType> {
  if (config.type === ASYNC_VALIDATOR_TYPE) {
    return createCustomAsyncValidator(config);
  }

  return createCustomSyncValidator(config);
}

export function cAsyncValidator<
  TValue,
  const Name extends string,
  QueryValue,
  QueryParams,
  QuerySourceParams,
  QueryInsertions,
  QueryExceptions extends ResourceExceptionConstraints,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
>(
  name: Name,
  queryRef: ResourceLikeQueryRef<
    QueryValue,
    QueryParams,
    true,
    FormValidator<TValue>,
    QuerySourceParams,
    QueryInsertions,
    QueryExceptions
  >,
  config?: CAsyncValidatorConfig<
    TValue,
    QueryValue,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    QueryExceptions,
    unknown,
    unknown
  >,
): ValidatorOutput<
  TValue,
  Name,
  CAsyncValidatorOutputExceptions<
    AsyncValidatorExceptionUnion<
      AsyncValidatorQueryTarget<QueryValue, QueryExceptions, unknown>
    >,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    unknown
  >,
  'async',
  unknown,
  AsyncValidatorMeta
>;
export function cAsyncValidator<
  TValue,
  const Name extends string,
  QueryValue,
  QueryParams,
  QuerySourceParams,
  QueryInsertions,
  Identifier extends string | number,
  QueryExceptions extends ResourceExceptionConstraints,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
>(
  name: Name,
  queryRef: ResourceByIdLikeQueryRef<
    QueryValue,
    QueryParams,
    true,
    FormValidator<TValue, Identifier>,
    QuerySourceParams,
    QueryInsertions,
    Identifier,
    QueryExceptions
  >,
  config?: CAsyncValidatorConfig<
    TValue,
    QueryValue,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    QueryExceptions,
    Identifier,
    Identifier
  >,
): ValidatorOutput<
  TValue,
  Name,
  CAsyncValidatorOutputExceptions<
    AsyncValidatorExceptionUnion<
      AsyncValidatorQueryTarget<QueryValue, QueryExceptions, Identifier>
    >,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    Identifier
  >,
  'async',
  Identifier,
  AsyncValidatorMeta
>;
export function cAsyncValidator(name: string, queryRef: any, config?: any) {
  const validatorByModel = new WeakMap<
    ValidatorModel<unknown>,
    Map<unknown, ValidatorExecution<string, any, 'async', AsyncValidatorMeta>>
  >();
  const defaultIdentifier = Symbol('cAsyncValidator.defaultIdentifier');

  return withValidatorRuntime(
    ((model?: ValidatorModel<unknown>, identifier?: unknown) => {
      const resolvedModel = resolveValidatorModel(undefined, model);
      const cacheIdentifier = isResourceByIdLikeQueryRef(queryRef)
        ? resolveValidatorIdentifier(identifier)
        : defaultIdentifier;
      const validatorsByIdentifier =
        validatorByModel.get(resolvedModel) ?? new Map();

      if (!validatorByModel.has(resolvedModel)) {
        validatorByModel.set(resolvedModel, validatorsByIdentifier);
      }

      let validator = validatorsByIdentifier.get(cacheIdentifier);

      if (!validator) {
        if (isResourceByIdLikeQueryRef(queryRef)) {
          const resolvedIdentifier = cacheIdentifier as string | number;
          const queryCraftResource = createAsyncValidatorQueryTarget(
            queryRef,
            resolvedIdentifier,
          );

          const runtime = createAsyncValidatorRuntime(queryCraftResource);
          triggerAsyncValidatorQuery({
            queryRef,
            model: resolvedModel,
            when: config?.when,
            identifier: resolvedIdentifier,
            runtime,
          });

          validator = createAsyncValidator({
            name,
            model: resolvedModel,
            when: config?.when,
            queryCraftResource,
            identifier: resolvedIdentifier,
            config,
            runtime,
          });
        } else {
          const runtime = createAsyncValidatorRuntime(queryRef);
          triggerAsyncValidatorQuery({
            queryRef,
            model: resolvedModel,
            when: config?.when,
            runtime,
          });

          validator = createAsyncValidator({
            name,
            model: resolvedModel,
            when: config?.when,
            queryCraftResource: queryRef,
            identifier: undefined,
            config,
            runtime,
          });
        }

        validatorsByIdentifier.set(cacheIdentifier, validator);
      }

      return validator();
    }) as ValidatorOutput<
      unknown,
      string,
      any,
      'async',
      unknown,
      AsyncValidatorMeta
    >,
    {
      name,
      type: ASYNC_VALIDATOR_TYPE,
      kind: 'output',
    },
  );
}
