import { computed, type ResourceRef, Signal } from '@angular/core';
import {
  email,
  emailError,
  max,
  maxLength,
  min,
  minLength,
  type PathKind,
  pattern,
  required,
  type SchemaPath,
  SchemaPathRules,
  validate,
  validateAsync,
  type ValidationError,
} from '@angular/forms/signals';
import {
  AnyCraftException,
  CRAFT_EXCEPTION_SYMBOL,
  CraftExceptionResult,
  ExcludeByCode,
  ExtractCodeFromCraftResultUnion,
  isCraftException,
} from '../craft-exception';
import {
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from '../mutation';
import { ResourceByIdLikeQueryRef, ResourceLikeQueryRef } from '../query';
import { ResourceExceptionConstraints } from '../query.core';
import { MergeObjects } from '../util/util.type';
export const VALIDATOR_OUTPUT_SYMBOL = Symbol('VALIDATOR_OUTPUT_SYMBOL');

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

export type ValidatorPending<
  Name extends string,
  Type extends ValidatorType = 'async',
  Meta extends object = {},
> = {
  valid: false;
} & ValidatorUtilBrand<Name, Type, Meta>;

type ValidatorExceptionOutput<
  Name extends string,
  Exceptions,
  Type extends ValidatorType,
  Meta extends object,
> =
  Exclude<Exceptions, undefined> extends never
    ? never
    :
        | (Exclude<Exceptions, undefined> &
            ValidatorUtilBrand<Name, Type, Meta>)
        | ((
            | Exclude<Exceptions, undefined>[]
            | readonly Exclude<Exceptions, undefined>[]
          ) &
            ValidatorUtilBrand<Name, Type, Meta>);

type DirectValidatorExecutionOutput<
  Name extends string,
  Exceptions,
  Type extends ValidatorType,
  Meta extends object,
> =
  | undefined
  | ValidatorSuccess<Name, Type, Meta>
  | ValidatorPending<Name, Type, Meta>
  | ValidatorExceptionOutput<Name, Exceptions, Type, Meta>;

type ValidatorRuntimeKind = 'signal';

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
  TPathKind extends PathKind = PathKind.Root,
> = ((
  context: ValidatorBindingContext<TValue, Identifier, TPathKind>,
) => Signal<DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>>) &
  ValidatorRuntimeCarrier<Name, Type, 'signal'>;

export type ValidatorModel<TValue> = () => {
  value: () => TValue;
};

type ValidatorOption<TValue> = TValue | (() => TValue);

type ValidatorConfig = {
  when?: ValidatorOption<boolean>;
};

export type ValidatorBindingContext<
  TValue,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> = {
  schemaPath: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>;
  errors: Signal<ValidationError.WithFieldTree[]>;
} & ([unknown] extends [Identifier]
  ? {
      identifier?: undefined;
    }
  : {
      identifier: Identifier;
    });

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

type CRequiredConfig<TValue> = ValidatorConfig;
type CEmailConfig<TValue extends string | null | undefined> = ValidatorConfig;
type CMinConfig<TValue extends number | string | null | undefined> =
  ValidatorConfig &
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
  ValidatorConfig &
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
  ValidatorConfig & {
    minLength: ValidatorOption<number | undefined>;
  };
type CMaxLengthConfig<TValue extends ValueWithLengthOrSize> =
  ValidatorConfig & {
    maxLength: ValidatorOption<number | undefined>;
  };
type CPatternConfig<TValue extends string | null | undefined> =
  ValidatorConfig & {
    pattern: ValidatorOption<RegExp | undefined>;
  };

type CValidateBaseConfig<
  TValue,
  Name extends string,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> = {
  name: Name;
  type?: 'sync';
};

type CValidateAdvancedSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> = CValidateBaseConfig<TValue, Name, Identifier, TPathKind> & {
  validate: (
    context: ValidatorBindingContext<TValue, Identifier, TPathKind>,
  ) => Signal<Exceptions | undefined>;
};

type CValidateSimpleSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> = CValidateBaseConfig<TValue, Name, Identifier, TPathKind> &
  ValidatorConfig & {
    validWhen: ValidatorOption<boolean>;
    exception: ValidatorOption<Exceptions>;
  };

type CValidateSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> =
  | CValidateAdvancedSyncConfig<TValue, Name, Exceptions, Identifier, TPathKind>
  | CValidateSimpleSyncConfig<TValue, Name, Exceptions, Identifier, TPathKind>;

type AnyAsyncCraftResourceRef =
  | ResourceLikeQueryRef<any, any, any, any, any, any, any>
  | ResourceByIdLikeQueryRef<any, any, any, any, any, any, any, any>
  | ResourceLikeMutationRef<any, any, any, any, any, any, any>
  | ResourceByIdLikeMutationRef<any, any, any, any, any, any, any, any>;

type AsyncValidatorRequest<TResourceRef extends AnyAsyncCraftResourceRef> =
  TResourceRef extends ResourceLikeQueryRef<
    any,
    infer Params,
    infer IsMethod,
    infer ArgParams,
    any,
    any,
    any
  >
    ? IsMethod extends true
      ? ArgParams
      : Params
    : TResourceRef extends ResourceByIdLikeQueryRef<
          any,
          infer Params,
          infer IsMethod,
          infer ArgParams,
          any,
          any,
          any,
          any
        >
      ? IsMethod extends true
        ? ArgParams
        : Params
      : TResourceRef extends ResourceLikeMutationRef<
            any,
            infer Params,
            infer IsMethod,
            infer ArgParams,
            any,
            any,
            any
          >
        ? IsMethod extends true
          ? ArgParams
          : Params
        : TResourceRef extends ResourceByIdLikeMutationRef<
              any,
              infer Params,
              infer IsMethod,
              infer ArgParams,
              any,
              any,
              any,
              any
            >
          ? IsMethod extends true
            ? ArgParams
            : Params
          : never;

type AsyncValidatorResourceTarget<TResourceRef> = TResourceRef extends {
  select: (...args: any[]) => infer SelectedResource;
}
  ? NonNullable<SelectedResource>
  : TResourceRef;

type AsyncValidatorResourceIdentifier<TResourceRef> =
  TResourceRef extends ResourceByIdLikeQueryRef<
    any,
    any,
    any,
    any,
    any,
    any,
    infer Identifier,
    any
  >
    ? Identifier
    : TResourceRef extends ResourceByIdLikeMutationRef<
          any,
          any,
          any,
          any,
          any,
          any,
          infer Identifier,
          any
        >
      ? Identifier
      : unknown;

type AsyncValidatorResourceExceptionUnion<TResource> = TResource extends {
  exceptions: Signal<{ list: (infer Exception)[] }>;
}
  ? Exception
  : never;

type ExtractValidatorExceptionItems<T> = T extends readonly (infer Item)[]
  ? Item
  : T;

type AsyncValidatorContext<
  TValue,
  TResourceRef extends AnyAsyncCraftResourceRef,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
  TResource = AsyncValidatorResourceTarget<TResourceRef>,
  ResourceExceptions = AsyncValidatorResourceExceptionUnion<TResource>,
  ResourceExceptionCodes = ExtractCodeFromCraftResultUnion<ResourceExceptions>,
> = ValidatorBindingContext<TValue, Identifier, TPathKind> & {
  validateAsyncCraftResource: TResource;
  omitExceptions: <C extends ResourceExceptionCodes>(
    codes: readonly C[],
  ) => ExcludeByCode<ResourceExceptions, C>[];
};

type IsValidAsyncExceptions<T> = [unknown] extends [T]
  ? true
  : NonNullable<T> extends AnyCraftException
    ? true
    : NonNullable<T> extends readonly (infer Item)[]
      ? Item extends AnyCraftException
        ? true
        : false
      : false;

type HasValidAsyncExceptionReturn<
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> =
  IsValidAsyncExceptions<SuccessExceptions> extends true
    ? IsValidAsyncExceptions<ErrorExceptions> extends true
      ? IsValidAsyncExceptions<ExceptionExceptions> extends true
        ? true
        : {
            success: true;
            error: true;
            exceptions: false;
          }
      : {
          success: true;
          error: false;
          exceptions: IsValidAsyncExceptions<ExceptionExceptions>;
        }
    : {
        success: false;
        error: IsValidAsyncExceptions<ErrorExceptions>;
        exceptions: IsValidAsyncExceptions<ExceptionExceptions>;
      };

type ValidationDetails = {
  success: boolean;
  error: boolean;
  exceptions: boolean;
};

type InvalidAsyncExceptionsMessage<T> = T extends true
  ? never
  : T extends ValidationDetails
    ? `Not valid ${
        | (T['success'] extends false ? 'exceptionsOnSuccess callback' : never)
        | (T['error'] extends false ? 'error callback' : never)
        | (T['exceptions'] extends false ? 'onException callback' : never)}`
    : never;

type CAsyncValidateConfig<
  TValue,
  Name extends string,
  TResourceRef extends AnyAsyncCraftResourceRef,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
> = MergeObjects<
  [
    ValidatorConfig & {
      name: Name;
      isValidSuccess?: (
        context: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => boolean;
      exceptionsOnSuccess?: (
        context: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => SuccessExceptions;
      error?: (
        context: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => ErrorExceptions;
      onException?: (
        context: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => ExceptionExceptions;
    },
    HasValidAsyncExceptionReturn<
      SuccessExceptions,
      ErrorExceptions,
      ExceptionExceptions
    > extends true
      ? {}
      : {
          typingError: `cAsyncValidate callbacks must only return Craft exceptions, arrays of Craft exceptions, or undefined. ${InvalidAsyncExceptionsMessage<HasValidAsyncExceptionReturn<SuccessExceptions, ErrorExceptions, ExceptionExceptions>>}`;
        },
  ]
>;

type ToAsyncValidatorExceptions<
  ResourceExceptions,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
> = [unknown] extends [ExceptionExceptions]
  ? Exclude<
      | ResourceExceptions
      | ExtractValidatorExceptionItems<SuccessExceptions>
      | ExtractValidatorExceptionItems<ErrorExceptions>,
      undefined
    >
  : Exclude<
      | ExtractValidatorExceptionItems<SuccessExceptions>
      | ExtractValidatorExceptionItems<ErrorExceptions>
      | ExtractValidatorExceptionItems<ExceptionExceptions>,
      undefined
    >;

const SYNC_VALIDATOR_TYPE = 'sync' as const;
const ASYNC_VALIDATOR_TYPE = 'async' as const;
let customValidatorKindId = 0;

function resolveValidatorOption<TValue>(
  option: ValidatorOption<TValue>,
): TValue {
  if (typeof option === 'function') {
    return (option as () => TValue)();
  }

  return option;
}

function shouldValidate(when?: ValidatorOption<boolean>): boolean {
  return when ? resolveValidatorOption(when) : true;
}

function createValidatorPending<
  const Name extends string,
  const Type extends ValidatorType,
  Meta extends object = {},
>(brand: Name, type: Type, meta?: Meta): ValidatorPending<Name, Type, Meta> {
  return Object.assign(
    {
      valid: false,
    },
    meta ?? {},
    {
      __brand: brand,
      type,
    },
  ) as ValidatorPending<Name, Type, Meta>;
}

type NormalizedCraftExceptionOutput = {
  raw: AnyCraftException | AnyCraftException[];
  list: AnyCraftException[];
};

function normalizeCraftExceptionOutput(
  value: unknown,
): NormalizedCraftExceptionOutput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const list = value.filter(isCraftException);

    return {
      raw: list,
      list,
    };
  }

  if (!isCraftException(value)) {
    return undefined;
  }

  return {
    raw: value,
    list: [value],
  };
}

function hasResourceExceptions(value: unknown): boolean {
  if (
    typeof value === 'object' &&
    value !== null &&
    'hasException' in value &&
    typeof (value as { hasException?: unknown }).hasException === 'function'
  ) {
    return !!(value as { hasException: Signal<boolean> }).hasException();
  }

  return getResourceExceptionList(value).length > 0;
}

function getResourceExceptionList(value: unknown): AnyCraftException[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('exceptions' in value) ||
    typeof (value as { exceptions?: unknown }).exceptions !== 'function'
  ) {
    return [];
  }

  const exceptionList = (
    value as { exceptions: Signal<{ list?: unknown[] }> }
  ).exceptions()?.list;

  return Array.isArray(exceptionList)
    ? exceptionList.filter(isCraftException)
    : [];
}

function isResourceRefWithSelection(
  value: AnyAsyncCraftResourceRef,
): value is
  | ResourceByIdLikeQueryRef<any, any, any, any, any, any, any, any>
  | ResourceByIdLikeMutationRef<any, any, any, any, any, any, any, any> {
  return 'select' in value && typeof value.select === 'function';
}

function resolveAsyncValidatorResourceTarget<
  TResourceRef extends AnyAsyncCraftResourceRef,
>(
  resourceRef: TResourceRef,
  identifier: AsyncValidatorResourceIdentifier<TResourceRef>,
): AsyncValidatorResourceTarget<TResourceRef> | undefined {
  if (!isResourceRefWithSelection(resourceRef)) {
    return resourceRef as AsyncValidatorResourceTarget<TResourceRef>;
  }

  if (identifier === undefined || identifier === null) {
    return undefined;
  }

  return resourceRef.select(
    identifier as Parameters<typeof resourceRef.select>[0],
  ) as AsyncValidatorResourceTarget<TResourceRef> | undefined;
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
  //@ts-expect-error I do not understand the error type 😅
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

function findValidationErrorByKind<Kind extends string>(
  errors: readonly ValidationError.WithFieldTree[],
  kind: Kind,
): (ValidationError.WithFieldTree & { kind: Kind }) | undefined {
  return errors.find(
    (error): error is ValidationError.WithFieldTree & { kind: Kind } =>
      error.kind === kind,
  );
}

function createSignalValidator<
  TValue,
  Name extends string,
  Exceptions,
  Type extends ValidatorType = 'sync',
  Identifier = unknown,
  Meta extends object = {},
  TPathKind extends PathKind = PathKind.Root,
>(
  validator: (
    context: ValidatorBindingContext<TValue, Identifier, TPathKind>,
  ) => Signal<DirectValidatorExecutionOutput<Name, Exceptions, Type, Meta>>,
  runtime: ValidatorRuntime<Name, Type, 'signal'>,
): ValidatorOutput<
  TValue,
  Name,
  Exceptions,
  Type,
  Identifier,
  Meta,
  TPathKind
> {
  return withValidatorRuntime(validator, runtime);
}

function createRequiredValidator<TValue>({
  when,
}: {
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      required(
        schemaPath,
        when ? { when: () => shouldValidate(when) } : undefined,
      );

      return computed(() => {
        return findValidationErrorByKind(errors(), 'required')
          ? createValidatorException(
              'cRequired',
              SYNC_VALIDATOR_TYPE,
              'required',
              undefined,
            )
          : undefined;
      });
    },
    {
      name: 'cRequired',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createEmailValidator<TValue extends string | null | undefined>({
  when,
}: {
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      email(schemaPath as SchemaPath<string, SchemaPathRules.Supported>, {
        error: () =>
          shouldValidate(when) ? emailError() : (undefined as never),
      });

      return computed(() =>
        findValidationErrorByKind(errors(), 'email')
          ? createValidatorException(
              'cEmail',
              SYNC_VALIDATOR_TYPE,
              'email',
              undefined,
            )
          : undefined,
      );
    },
    {
      name: 'cEmail',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createMinValidator<TValue extends number | string | null | undefined>({
  when,
  min: minValue,
}: {
  when?: ValidatorOption<boolean>;
  min: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMin', CMinException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      min(
        schemaPath as SchemaPath<
          number | string | null,
          SchemaPathRules.Supported
        >,
        () =>
          shouldValidate(when) ? resolveValidatorOption(minValue) : undefined,
      );

      return computed(() => {
        const error = findValidationErrorByKind(errors(), 'min');

        return error && 'min' in error
          ? createValidatorException(
              'cMin',
              SYNC_VALIDATOR_TYPE,
              'min',
              error.min as number,
            )
          : undefined;
      });
    },
    {
      name: 'cMin',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createMaxValidator<TValue extends number | string | null | undefined>({
  when,
  max: maxValue,
}: {
  when?: ValidatorOption<boolean>;
  max: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMax', CMaxException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      max(
        schemaPath as SchemaPath<
          number | string | null,
          SchemaPathRules.Supported
        >,
        () =>
          shouldValidate(when) ? resolveValidatorOption(maxValue) : undefined,
      );

      return computed(() => {
        const error = findValidationErrorByKind(errors(), 'max');

        return error && 'max' in error
          ? createValidatorException(
              'cMax',
              SYNC_VALIDATOR_TYPE,
              'max',
              error.max as number,
            )
          : undefined;
      });
    },
    {
      name: 'cMax',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createMinLengthValidator<TValue extends ValueWithLengthOrSize>({
  when,
  minLength: minimumLength,
}: {
  when?: ValidatorOption<boolean>;
  minLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMinLength', CMinLengthException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      minLength(
        schemaPath as SchemaPath<TValue, SchemaPathRules.Supported>,
        () =>
          shouldValidate(when)
            ? resolveValidatorOption(minimumLength)
            : undefined,
      );

      return computed(() => {
        const error = findValidationErrorByKind(errors(), 'minLength');

        return error && 'minLength' in error
          ? createValidatorException(
              'cMinLength',
              SYNC_VALIDATOR_TYPE,
              'minLength',
              error.minLength as number,
            )
          : undefined;
      });
    },
    {
      name: 'cMinLength',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createMaxLengthValidator<TValue extends ValueWithLengthOrSize>({
  when,
  maxLength: maximumLength,
}: {
  when?: ValidatorOption<boolean>;
  maxLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      maxLength(
        schemaPath as SchemaPath<TValue, SchemaPathRules.Supported>,
        () =>
          shouldValidate(when)
            ? resolveValidatorOption(maximumLength)
            : undefined,
      );

      return computed(() => {
        const error = findValidationErrorByKind(errors(), 'maxLength');

        return error && 'maxLength' in error
          ? createValidatorException(
              'cMaxLength',
              SYNC_VALIDATOR_TYPE,
              'maxLength',
              error.maxLength as number,
            )
          : undefined;
      });
    },
    {
      name: 'cMaxLength',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createPatternValidator<TValue extends string | null | undefined>({
  when,
  pattern: validatorPattern,
}: {
  when?: ValidatorOption<boolean>;
  pattern: ValidatorOption<RegExp | undefined>;
}): ValidatorOutput<TValue, 'cPattern', CPatternException> {
  return createSignalValidator(
    ({ schemaPath, errors }) => {
      pattern(
        schemaPath as SchemaPath<string, SchemaPathRules.Supported>,
        () =>
          shouldValidate(when)
            ? resolveValidatorOption(validatorPattern)
            : undefined,
      );

      return computed(() => {
        const error = findValidationErrorByKind(errors(), 'pattern');

        return error && 'pattern' in error
          ? createValidatorException(
              'cPattern',
              SYNC_VALIDATOR_TYPE,
              'pattern',
              error.pattern as RegExp,
            )
          : undefined;
      });
    },
    {
      name: 'cPattern',
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createCustomSyncValidator<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
>(
  config: CValidateSyncConfig<TValue, Name, Exceptions, Identifier, TPathKind>,
): ValidatorOutput<
  TValue,
  Name,
  Exceptions,
  'sync',
  Identifier,
  {},
  TPathKind
> {
  const { name } = config;

  if ('validate' in config) {
    const bindValidator = config.validate;

    return createSignalValidator(
      (context) => {
        const validationResult = bindValidator(context);

        return computed(() => {
          const result = validationResult();

          if (result === undefined) {
            return undefined;
          }

          return withValidatorBrand(name, SYNC_VALIDATOR_TYPE, result);
        });
      },
      {
        name,
        type: SYNC_VALIDATOR_TYPE,
        kind: 'signal',
      },
    );
  }

  const internalErrorKind = `ng-craft.cValidate.${name}.${++customValidatorKindId}`;

  return createSignalValidator(
    ({ schemaPath, errors }) => {
      validate(schemaPath, () =>
        !shouldValidate(config.when) || resolveValidatorOption(config.validWhen)
          ? undefined
          : { kind: internalErrorKind },
      );

      return computed(() => {
        if (!findValidationErrorByKind(errors(), internalErrorKind)) {
          return undefined;
        }

        const exception = resolveValidatorOption(config.exception);
        if (exception === undefined) {
          return undefined;
        }

        return withValidatorBrand(name, SYNC_VALIDATOR_TYPE, exception);
      });
    },
    {
      name,
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

function createCustomAsyncValidator<
  TValue,
  TResourceRef extends AnyAsyncCraftResourceRef,
  Name extends string,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
>(
  resourceRef: TResourceRef,
  config: CAsyncValidateConfig<
    TValue,
    Name,
    TResourceRef,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    Identifier,
    TPathKind
  >,
): ValidatorOutput<
  TValue,
  Name,
  ToAsyncValidatorExceptions<
    AsyncValidatorResourceExceptionUnion<
      AsyncValidatorResourceTarget<TResourceRef>
    >,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions
  >,
  'async',
  Identifier,
  {},
  TPathKind
> {
  const { name } = config;
  const internalErrorKind = `ng-craft.cAsyncValidate.${name}.${++customValidatorKindId}`;

  return createSignalValidator(
    (bindingContext) => {
      const validatorCraftResourceTarget = computed(() =>
        bindingContext.identifier
          ? (
              resourceRef as ResourceByIdLikeMutationRef<
                unknown,
                unknown,
                true,
                unknown,
                unknown,
                unknown,
                unknown,
                ResourceExceptionConstraints
              >
            ).select(bindingContext.identifier)
          : (resourceRef as ResourceLikeMutationRef<
              unknown,
              unknown,
              true,
              unknown,
              unknown,
              unknown,
              ResourceExceptionConstraints
            >),
      );

      const validateAsyncCraftResource = computed(() =>
        resolveAsyncValidatorResourceTarget(
          resourceRef,
          bindingContext.identifier as AsyncValidatorResourceIdentifier<TResourceRef>,
        ),
      );
      let currentRequestSignal:
        | Signal<AsyncValidatorRequest<TResourceRef> | undefined>
        | undefined;

      const createAsyncContext = (
        currentResource: AsyncValidatorResourceTarget<TResourceRef>,
      ) => {
        const resourceExceptions = getResourceExceptionList(
          currentResource,
        ) as AsyncValidatorResourceExceptionUnion<
          AsyncValidatorResourceTarget<TResourceRef>
        >[];

        return {
          ...bindingContext,
          validateAsyncCraftResource: currentResource,
          omitExceptions: (
            codes: readonly ExtractCodeFromCraftResultUnion<
              AsyncValidatorResourceExceptionUnion<
                AsyncValidatorResourceTarget<TResourceRef>
              >
            >[],
          ) =>
            resourceExceptions.filter(
              (exception) => !codes.includes(exception.code as never),
            ) as ExcludeByCode<
              AsyncValidatorResourceExceptionUnion<
                AsyncValidatorResourceTarget<TResourceRef>
              >,
              ExtractCodeFromCraftResultUnion<
                AsyncValidatorResourceExceptionUnion<
                  AsyncValidatorResourceTarget<TResourceRef>
                >
              >
            >[],
        } as AsyncValidatorContext<TValue, TResourceRef, Identifier, TPathKind>;
      };

      const resolveSuccessResult = (
        asyncContext: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => {
        const exceptions = normalizeCraftExceptionOutput(
          config.exceptionsOnSuccess?.(asyncContext),
        );
        const valid = config.isValidSuccess?.(asyncContext) ?? true;

        return {
          exceptions,
          invalid: !valid || !!exceptions?.list.length,
        };
      };

      const resolveExceptionResult = (
        asyncContext: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => {
        const resourceExceptions = normalizeCraftExceptionOutput(
          getResourceExceptionList(asyncContext.validateAsyncCraftResource),
        );
        const override = normalizeCraftExceptionOutput(
          config.onException?.(asyncContext),
        );

        return override ?? resourceExceptions;
      };

      const resolveErrorResult = (
        asyncContext: AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier,
          TPathKind
        >,
      ) => normalizeCraftExceptionOutput(config.error?.(asyncContext));

      validateAsync(bindingContext.schemaPath, {
        params: (fieldContext) => {
          if (!shouldValidate(config.when)) {
            return undefined;
          }

          return (
            //@ts-ignore todo
            config.params?.(fieldContext) ??
            (fieldContext.value() as AsyncValidatorRequest<TResourceRef>)
          );
        },
        factory: validatorCraftResourceTarget as unknown as () => ResourceRef<
          unknown | undefined
        >, // ! validatorCraftResourceTarget is a signal, but as the factory expect a function it may works
        onSuccess: () => {
          const currentResource = validateAsyncCraftResource();

          if (!currentResource) {
            return undefined;
          }

          const asyncContext = createAsyncContext(currentResource);

          if (hasResourceExceptions(currentResource)) {
            return resolveExceptionResult(asyncContext)?.list.length
              ? { kind: internalErrorKind }
              : undefined;
          }

          return resolveSuccessResult(asyncContext).invalid
            ? { kind: internalErrorKind }
            : undefined;
        },
        onError: () => {
          const currentResource = validateAsyncCraftResource();

          if (!currentResource) {
            return undefined;
          }

          return resolveErrorResult(createAsyncContext(currentResource))?.list
            .length
            ? { kind: internalErrorKind }
            : undefined;
        },
      });

      return computed(() => {
        if (currentRequestSignal?.() === undefined) {
          return undefined;
        }

        const currentResource = validateAsyncCraftResource();

        if (!currentResource || currentResource.isLoading()) {
          return createValidatorPending(name, ASYNC_VALIDATOR_TYPE);
        }

        if (
          !findValidationErrorByKind(bindingContext.errors(), internalErrorKind)
        ) {
          return undefined;
        }

        const asyncContext = createAsyncContext(currentResource);

        if (hasResourceExceptions(currentResource)) {
          const exceptionResult = resolveExceptionResult(asyncContext);

          return exceptionResult
            ? withValidatorBrand(
                name,
                ASYNC_VALIDATOR_TYPE,
                exceptionResult.raw as ToAsyncValidatorExceptions<
                  AsyncValidatorResourceExceptionUnion<
                    AsyncValidatorResourceTarget<TResourceRef>
                  >,
                  SuccessExceptions,
                  ErrorExceptions,
                  ExceptionExceptions
                >,
              )
            : undefined;
        }

        if (currentResource.status() === 'error') {
          const errorResult = resolveErrorResult(asyncContext);

          return errorResult
            ? withValidatorBrand(
                name,
                ASYNC_VALIDATOR_TYPE,
                errorResult.raw as ToAsyncValidatorExceptions<
                  AsyncValidatorResourceExceptionUnion<
                    AsyncValidatorResourceTarget<TResourceRef>
                  >,
                  SuccessExceptions,
                  ErrorExceptions,
                  ExceptionExceptions
                >,
              )
            : undefined;
        }

        const successResult = resolveSuccessResult(asyncContext);

        return successResult.exceptions
          ? withValidatorBrand(
              name,
              ASYNC_VALIDATOR_TYPE,
              successResult.exceptions.raw as ToAsyncValidatorExceptions<
                AsyncValidatorResourceExceptionUnion<
                  AsyncValidatorResourceTarget<TResourceRef>
                >,
                SuccessExceptions,
                ErrorExceptions,
                ExceptionExceptions
              >,
            )
          : undefined;
      });
    },
    {
      name,
      type: ASYNC_VALIDATOR_TYPE,
      kind: 'signal',
    },
  );
}

export function cRequired<TValue>(
  config?: CRequiredConfig<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException>;
export function cRequired<TValue>(
  input?: CRequiredConfig<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  return createRequiredValidator(input ?? {});
}

export function cEmail<TValue extends string | null | undefined>(
  config?: CEmailConfig<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException>;
export function cEmail<TValue extends string | null | undefined>(
  input?: CEmailConfig<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  return createEmailValidator(input ?? {});
}

export function cMin<TValue extends number | string | null | undefined>(
  config: CMinConfig<TValue>,
): ValidatorOutput<TValue, 'cMin', CMinException> {
  return createMinValidator({
    when: config.when,
    min: 'min' in config ? config.min : config.minValue,
  });
}

export function cMax<TValue extends number | string | null | undefined>(
  config: CMaxConfig<TValue>,
): ValidatorOutput<TValue, 'cMax', CMaxException> {
  return createMaxValidator({
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

export function cValidate<
  TValue,
  const Name extends string,
  Exceptions,
  Identifier = unknown,
  TPathKind extends PathKind = PathKind.Root,
>(
  config: CValidateSyncConfig<TValue, Name, Exceptions, Identifier, TPathKind>,
): ValidatorOutput<
  TValue,
  Name,
  Exceptions,
  'sync',
  Identifier,
  {},
  TPathKind
> {
  return createCustomSyncValidator(config);
}

export const cValidator = cValidate;

export function cAsyncValidate<
  /**
   * Creates an async validator with resource reference integration.
   *
   * @example
   * ```typescript
   * const validator = cAsyncValidate(userResource, {
   *   validate: (value) => validateUserEmail(value),
   *   onSuccess: (result) => handleSuccess(result),
   *   onError: (error) => handleError(error),
   * });
   * ```
   *
   * @internal
   * @deprecated This API is still under active development and does not works correctly in all cases.
   *
   * @see {@link createCustomAsyncValidator}
   */
  TValue,
  TResourceRef extends AnyAsyncCraftResourceRef,
  const Name extends string,
  SuccessExceptions = undefined,
  ErrorExceptions = undefined,
  ExceptionExceptions = unknown,
  TPathKind extends PathKind = PathKind.Root,
  Identifier = AsyncValidatorResourceIdentifier<TResourceRef>,
>(
  resourceRef: TResourceRef,
  config: CAsyncValidateConfig<
    TValue,
    Name,
    TResourceRef,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    Identifier,
    TPathKind
  >,
): ValidatorOutput<
  TValue,
  Name,
  ToAsyncValidatorExceptions<
    AsyncValidatorResourceExceptionUnion<
      AsyncValidatorResourceTarget<TResourceRef>
    >,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions
  >,
  'async',
  Identifier,
  {},
  TPathKind
> {
  return createCustomAsyncValidator(resourceRef, config);
}

export const cAsyncValidator = cAsyncValidate;
