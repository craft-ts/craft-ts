import { computed, effect, Signal, signal, untracked } from '@angular/core';
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
import {
  CraftField,
  CraftFieldError,
  CraftValidator,
  CraftValidatorContext,
  CraftValidatorOutput,
  FieldAttributeMeta,
} from './craft-field';

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

/**
 * A Craft validator factory output.
 *
 * Calling the returned function from inside `CraftField.ɵregisterValidator` (which
 * `insertFormAttributes` does internally) yields a `CraftValidatorResult` that the
 * field aggregates into its `errors()` and native-constraint signals.
 */
export type ValidatorOutput<
  TValue,
  Name extends string,
  Exceptions,
  Type extends ValidatorType = 'sync',
  Identifier = unknown,
  Meta extends object = {},
> = CraftValidator<TValue> &
  ValidatorRuntimeCarrier<Name, Type, 'signal'> & {
    /** @internal phantom marker for type extraction */
    readonly __exceptions?: Exceptions;
    /** @internal phantom marker for type extraction */
    readonly __meta?: Meta;
    /** @internal phantom marker for type extraction */
    readonly __identifier?: Identifier;
  };

type ValidatorOption<TValue> = TValue | (() => TValue);

type ValidatorConfig = {
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

type CValidateBaseConfig<Name extends string> = {
  name: Name;
  type?: 'sync';
};

type CValidateAdvancedSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
> = CValidateBaseConfig<Name> & {
  validate: (
    context: CraftValidatorContext<TValue> & { identifier: Identifier },
  ) => Signal<Exceptions | undefined>;
};

type CValidateSimpleSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
> = CValidateBaseConfig<Name> &
  ValidatorConfig & {
    validWhen: ValidatorOption<boolean>;
    exception: ValidatorOption<Exceptions>;
  };

type CValidateSyncConfig<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
> =
  | CValidateAdvancedSyncConfig<TValue, Name, Exceptions, Identifier>
  | CValidateSimpleSyncConfig<TValue, Name, Exceptions, Identifier>;

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
  TResource = AsyncValidatorResourceTarget<TResourceRef>,
  ResourceExceptions = AsyncValidatorResourceExceptionUnion<TResource>,
  ResourceExceptionCodes = ExtractCodeFromCraftResultUnion<ResourceExceptions>,
> = CraftValidatorContext<TValue> & {
  identifier: Identifier;
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
> = MergeObjects<
  [
    ValidatorConfig & {
      name: Name;
      isValidSuccess?: (
        context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
      ) => boolean;
      exceptionsOnSuccess?: (
        context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
      ) => SuccessExceptions;
      error?: (
        context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
      ) => ErrorExceptions;
      onException?: (
        context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
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

function resolveValidatorOption<TValue>(
  option: ValidatorOption<TValue>,
): TValue {
  if (typeof option === 'function') {
    return (option as () => TValue)();
  }

  return option;
}

function shouldValidate(when?: ValidatorOption<boolean>): boolean {
  return when === undefined ? true : resolveValidatorOption(when);
}

function brandException<
  Name extends string,
  Type extends ValidatorType,
  Code extends string,
  Payload,
>(
  name: Name,
  type: Type,
  code: Code,
  payload: Payload,
): AnyCraftException & ValidatorUtilBrand<Name, Type, {}> {
  return {
    code,
    [CRAFT_EXCEPTION_SYMBOL]: true,
    payload,
    [code]: payload,
    __brand: name,
    type,
  } as AnyCraftException & ValidatorUtilBrand<Name, Type, {}>;
}

function brandRawException<
  Name extends string,
  Type extends ValidatorType,
>(
  name: Name,
  type: Type,
  exception: AnyCraftException | AnyCraftException[],
): CraftFieldError | CraftFieldError[] {
  if (Array.isArray(exception)) {
    return exception.map((e) => ({ ...e, __brand: name, type } as unknown as CraftFieldError));
  }
  return { ...exception, __brand: name, type } as unknown as CraftFieldError;
}

function withRuntime<
  Name extends string,
  Type extends ValidatorType,
  TValidator extends CraftValidator<any>,
>(
  validator: TValidator,
  runtime: ValidatorRuntime<Name, Type, 'signal'>,
): TValidator & ValidatorRuntimeCarrier<Name, Type, 'signal'> {
  return Object.assign(validator, {
    [VALIDATOR_OUTPUT_SYMBOL]: runtime,
  });
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function lengthOf(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object' && 'length' in value && typeof (value as { length: unknown }).length === 'number') {
    return (value as { length: number }).length;
  }
  if (typeof value === 'object' && 'size' in value && typeof (value as { size: unknown }).size === 'number') {
    return (value as { size: number }).size;
  }
  return undefined;
}

function normalizeCraftExceptionOutput(
  value: unknown,
):
  | { raw: AnyCraftException | AnyCraftException[]; list: AnyCraftException[] }
  | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const list = value.filter(isCraftException);
    return list.length === 0 ? undefined : { raw: list, list };
  }
  if (!isCraftException(value)) return undefined;
  return { raw: value, list: [value] };
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
  const list = (value as { exceptions: Signal<{ list?: unknown[] }> }).exceptions()?.list;
  return Array.isArray(list) ? list.filter(isCraftException) : [];
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
  if (identifier === undefined || identifier === null) return undefined;
  return resourceRef.select(
    identifier as Parameters<typeof resourceRef.select>[0],
  ) as AsyncValidatorResourceTarget<TResourceRef> | undefined;
}

// =====================================================================
//  Built-in validators
// =====================================================================

function createRequiredValidator<TValue>({
  when,
}: {
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      return isEmptyValue(value())
        ? (brandException('cRequired', SYNC_VALIDATOR_TYPE, 'required', undefined) as CraftFieldError)
        : undefined;
    }),
    attribute: computed<FieldAttributeMeta | undefined>(() => {
      if (!shouldValidate(when)) return undefined;
      return { kind: 'native-constraint', target: 'required', value: true };
    }),
  });
  return withRuntime(validator, {
    name: 'cRequired',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cRequired', CRequiredException>;
}

const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;

function createEmailValidator<TValue extends string | null | undefined>({
  when,
}: {
  when?: ValidatorOption<boolean>;
}): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const v = value();
      if (v === null || v === undefined || v === '') return undefined;
      if (typeof v !== 'string') return undefined;
      return EMAIL_REGEX.test(v)
        ? undefined
        : (brandException('cEmail', SYNC_VALIDATOR_TYPE, 'email', undefined) as CraftFieldError);
    }),
  });
  return withRuntime(validator, {
    name: 'cEmail',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cEmail', CEmailException>;
}

function createMinValidator<TValue extends number | string | null | undefined>({
  when,
  min: minValue,
}: {
  when?: ValidatorOption<boolean>;
  min: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMin', CMinException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const m = resolveValidatorOption(minValue);
      if (m === undefined) return undefined;
      const n = asNumber(value());
      if (n === undefined) return undefined;
      return n < m
        ? (brandException('cMin', SYNC_VALIDATOR_TYPE, 'min', m) as CraftFieldError)
        : undefined;
    }),
    attribute: computed<FieldAttributeMeta | undefined>(() => {
      const m = resolveValidatorOption(minValue);
      return m !== undefined && shouldValidate(when)
        ? { kind: 'native-constraint', target: 'min', value: m }
        : undefined;
    }),
  });
  return withRuntime(validator, {
    name: 'cMin',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cMin', CMinException>;
}

function createMaxValidator<TValue extends number | string | null | undefined>({
  when,
  max: maxValue,
}: {
  when?: ValidatorOption<boolean>;
  max: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMax', CMaxException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const m = resolveValidatorOption(maxValue);
      if (m === undefined) return undefined;
      const n = asNumber(value());
      if (n === undefined) return undefined;
      return n > m
        ? (brandException('cMax', SYNC_VALIDATOR_TYPE, 'max', m) as CraftFieldError)
        : undefined;
    }),
    attribute: computed<FieldAttributeMeta | undefined>(() => {
      const m = resolveValidatorOption(maxValue);
      return m !== undefined && shouldValidate(when)
        ? { kind: 'native-constraint', target: 'max', value: m }
        : undefined;
    }),
  });
  return withRuntime(validator, {
    name: 'cMax',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cMax', CMaxException>;
}

function createMinLengthValidator<TValue extends ValueWithLengthOrSize>({
  when,
  minLength,
}: {
  when?: ValidatorOption<boolean>;
  minLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMinLength', CMinLengthException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const m = resolveValidatorOption(minLength);
      if (m === undefined) return undefined;
      const len = lengthOf(value());
      if (len === undefined) return undefined;
      if (len === 0) return undefined; // empty values handled by required
      return len < m
        ? (brandException('cMinLength', SYNC_VALIDATOR_TYPE, 'minLength', m) as CraftFieldError)
        : undefined;
    }),
    attribute: computed<FieldAttributeMeta | undefined>(() => {
      const m = resolveValidatorOption(minLength);
      return m !== undefined && shouldValidate(when)
        ? { kind: 'native-constraint', target: 'minLength', value: m }
        : undefined;
    }),
  });
  return withRuntime(validator, {
    name: 'cMinLength',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cMinLength', CMinLengthException>;
}

function createMaxLengthValidator<TValue extends ValueWithLengthOrSize>({
  when,
  maxLength,
}: {
  when?: ValidatorOption<boolean>;
  maxLength: ValidatorOption<number | undefined>;
}): ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const m = resolveValidatorOption(maxLength);
      if (m === undefined) return undefined;
      const len = lengthOf(value());
      if (len === undefined) return undefined;
      return len > m
        ? (brandException('cMaxLength', SYNC_VALIDATOR_TYPE, 'maxLength', m) as CraftFieldError)
        : undefined;
    }),
    attribute: computed<FieldAttributeMeta | undefined>(() => {
      const m = resolveValidatorOption(maxLength);
      return m !== undefined && shouldValidate(when)
        ? { kind: 'native-constraint', target: 'maxLength', value: m }
        : undefined;
    }),
  });
  return withRuntime(validator, {
    name: 'cMaxLength',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException>;
}

function createPatternValidator<TValue extends string | null | undefined>({
  when,
  pattern,
}: {
  when?: ValidatorOption<boolean>;
  pattern: ValidatorOption<RegExp | undefined>;
}): ValidatorOutput<TValue, 'cPattern', CPatternException> {
  const validator: CraftValidator<TValue> = ({ value }) => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(when)) return undefined;
      const p = resolveValidatorOption(pattern);
      if (p === undefined) return undefined;
      const v = value();
      if (v === null || v === undefined || v === '') return undefined;
      if (typeof v !== 'string') return undefined;
      return p.test(v)
        ? undefined
        : (brandException('cPattern', SYNC_VALIDATOR_TYPE, 'pattern', p) as CraftFieldError);
    }),
  });
  return withRuntime(validator, {
    name: 'cPattern',
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, 'cPattern', CPatternException>;
}

function createCustomSyncValidator<
  TValue,
  Name extends string,
  Exceptions,
  Identifier = unknown,
>(
  config: CValidateSyncConfig<TValue, Name, Exceptions, Identifier>,
): ValidatorOutput<TValue, Name, Exceptions, 'sync', Identifier> {
  const { name } = config;

  if ('validate' in config) {
    const fn = config.validate;
    const validator: CraftValidator<TValue> = (context) => {
      const inner = fn({ ...context, identifier: context.identifier as Identifier });
      return {
        result: computed<CraftValidatorOutput>(() => {
          const result = inner();
          if (result === undefined) return undefined;
          const normalized = normalizeCraftExceptionOutput(result);
          if (!normalized) return undefined;
          return brandRawException(name, SYNC_VALIDATOR_TYPE, normalized.raw) as
            | CraftFieldError
            | CraftFieldError[]
            | undefined;
        }),
      };
    };
    return withRuntime(validator, {
      name,
      type: SYNC_VALIDATOR_TYPE,
      kind: 'signal',
    }) as unknown as ValidatorOutput<TValue, Name, Exceptions, 'sync', Identifier>;
  }

  const simpleConfig = config;
  const validator: CraftValidator<TValue> = () => ({
    result: computed<CraftValidatorOutput>(() => {
      if (!shouldValidate(simpleConfig.when)) return undefined;
      if (resolveValidatorOption(simpleConfig.validWhen)) return undefined;
      const exception = resolveValidatorOption(simpleConfig.exception);
      const normalized = normalizeCraftExceptionOutput(exception);
      if (!normalized) return undefined;
      return brandRawException(name, SYNC_VALIDATOR_TYPE, normalized.raw) as
        | CraftFieldError
        | CraftFieldError[]
        | undefined;
    }),
  });
  return withRuntime(validator, {
    name,
    type: SYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<TValue, Name, Exceptions, 'sync', Identifier>;
}

function createCustomAsyncValidator<
  TValue,
  TResourceRef extends AnyAsyncCraftResourceRef,
  Name extends string,
  SuccessExceptions,
  ErrorExceptions,
  ExceptionExceptions,
  Identifier = unknown,
>(
  resourceRef: TResourceRef,
  config: CAsyncValidateConfig<
    TValue,
    Name,
    TResourceRef,
    SuccessExceptions,
    ErrorExceptions,
    ExceptionExceptions,
    Identifier
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
  Identifier
> {
  const { name } = config as { name: Name };
  const cfg = config as unknown as {
    name: Name;
    when?: ValidatorOption<boolean>;
    isValidSuccess?: (
      context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
    ) => boolean;
    exceptionsOnSuccess?: (
      context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
    ) => SuccessExceptions;
    error?: (
      context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
    ) => ErrorExceptions;
    onException?: (
      context: AsyncValidatorContext<TValue, TResourceRef, Identifier>,
    ) => ExceptionExceptions;
  };

  const validator: CraftValidator<TValue> = (context) => {
    const identifier = context.identifier as AsyncValidatorResourceIdentifier<TResourceRef>;
    const resourceTarget = computed(() =>
      resolveAsyncValidatorResourceTarget(resourceRef, identifier),
    );

    const lastTriggered = signal<
      AsyncValidatorRequest<TResourceRef> | undefined
    >(undefined);

    // Trigger the resource when the value changes.
    effect(() => {
      const v = context.value() as AsyncValidatorRequest<TResourceRef>;
      const target = untracked(() => resourceTarget()) as
        | { mutate?: (params: unknown) => void }
        | undefined;
      if (!target) return;
      if (!shouldValidate(cfg.when)) return;
      lastTriggered.set(v);
      if (typeof target.mutate === 'function') {
        target.mutate(v);
      }
    });

    const buildContext = (
      currentResource: AsyncValidatorResourceTarget<TResourceRef>,
    ): AsyncValidatorContext<TValue, TResourceRef, Identifier> => {
      const exceptions = getResourceExceptionList(currentResource);
      return {
        ...context,
        identifier: identifier as Identifier,
        validateAsyncCraftResource: currentResource,
        omitExceptions: ((codes: readonly string[]) =>
          exceptions.filter((e) => !codes.includes(e.code as string))) as AsyncValidatorContext<
          TValue,
          TResourceRef,
          Identifier
        >['omitExceptions'],
      };
    };

    const result = computed<CraftValidatorOutput>(() => {
      const r = resourceTarget() as
        | {
            isLoading: Signal<boolean>;
            status: Signal<string>;
            exceptions?: Signal<{ list: AnyCraftException[] }>;
            hasException?: Signal<boolean>;
          }
        | undefined;
      if (!r) return undefined;
      if (lastTriggered() === undefined) return undefined;
      if (r.isLoading()) return { pending: true };

      const status = r.status();
      const asyncCtx = buildContext(
        r as AsyncValidatorResourceTarget<TResourceRef>,
      );

      if (hasResourceExceptions(r)) {
        const overridden = normalizeCraftExceptionOutput(
          cfg.onException?.(asyncCtx),
        );
        const fallback = normalizeCraftExceptionOutput(
          getResourceExceptionList(r),
        );
        const final = overridden ?? fallback;
        if (!final) return undefined;
        return brandRawException(name, ASYNC_VALIDATOR_TYPE, final.raw) as
          | CraftFieldError
          | CraftFieldError[];
      }

      if (status === 'error') {
        const errorOutput = normalizeCraftExceptionOutput(
          cfg.error?.(asyncCtx),
        );
        return errorOutput
          ? (brandRawException(name, ASYNC_VALIDATOR_TYPE, errorOutput.raw) as
              | CraftFieldError
              | CraftFieldError[])
          : undefined;
      }

      // Resolved
      const isValid = cfg.isValidSuccess?.(asyncCtx) ?? true;
      const onSuccess = normalizeCraftExceptionOutput(
        cfg.exceptionsOnSuccess?.(asyncCtx),
      );
      if (!isValid || onSuccess) {
        if (onSuccess) {
          return brandRawException(name, ASYNC_VALIDATOR_TYPE, onSuccess.raw) as
            | CraftFieldError
            | CraftFieldError[];
        }
        return brandException(
          name,
          ASYNC_VALIDATOR_TYPE,
          'invalid',
          undefined,
        ) as CraftFieldError;
      }
      return undefined;
    });

    return { result };
  };

  return withRuntime(validator, {
    name,
    type: ASYNC_VALIDATOR_TYPE,
    kind: 'signal',
  }) as unknown as ValidatorOutput<
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
    Identifier
  >;
}

// =====================================================================
//  Public API
// =====================================================================

export function cRequired<TValue>(
  config?: CRequiredConfig<TValue>,
): ValidatorOutput<TValue, 'cRequired', CRequiredException> {
  return createRequiredValidator<TValue>(config ?? {});
}

export function cEmail<TValue extends string | null | undefined>(
  config?: CEmailConfig<TValue>,
): ValidatorOutput<TValue, 'cEmail', CEmailException> {
  return createEmailValidator<TValue>(config ?? {});
}

export function cMin<TValue extends number | string | null | undefined>(
  config: CMinConfig<TValue>,
): ValidatorOutput<TValue, 'cMin', CMinException> {
  return createMinValidator<TValue>({
    when: config.when,
    min: 'min' in config && config.min !== undefined ? config.min : (config as { minValue: ValidatorOption<number | undefined> }).minValue,
  });
}

export function cMax<TValue extends number | string | null | undefined>(
  config: CMaxConfig<TValue>,
): ValidatorOutput<TValue, 'cMax', CMaxException> {
  return createMaxValidator<TValue>({
    when: config.when,
    max: 'max' in config && config.max !== undefined ? config.max : (config as { maxValue: ValidatorOption<number | undefined> }).maxValue,
  });
}

export function cMinLength<TValue extends ValueWithLengthOrSize>(
  config: CMinLengthConfig<TValue>,
): ValidatorOutput<TValue, 'cMinLength', CMinLengthException> {
  return createMinLengthValidator<TValue>(config);
}

export function cMaxLength<TValue extends ValueWithLengthOrSize>(
  config: CMaxLengthConfig<TValue>,
): ValidatorOutput<TValue, 'cMaxLength', CMaxLengthException> {
  return createMaxLengthValidator<TValue>(config);
}

export function cPattern<TValue extends string | null | undefined>(
  config: CPatternConfig<TValue>,
): ValidatorOutput<TValue, 'cPattern', CPatternException> {
  return createPatternValidator<TValue>(config);
}

export function cValidate<
  TValue,
  const Name extends string,
  Exceptions,
  Identifier = unknown,
>(
  config: CValidateSyncConfig<TValue, Name, Exceptions, Identifier>,
): ValidatorOutput<TValue, Name, Exceptions, 'sync', Identifier> {
  return createCustomSyncValidator(config);
}

export const cValidator = cValidate;

export function cAsyncValidate<
  TValue,
  TResourceRef extends AnyAsyncCraftResourceRef,
  const Name extends string,
  SuccessExceptions = undefined,
  ErrorExceptions = undefined,
  ExceptionExceptions = unknown,
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
    Identifier
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
  Identifier
> {
  return createCustomAsyncValidator(resourceRef, config);
}

export const cAsyncValidator = cAsyncValidate;

// Re-exports for backward compat
export type { CraftValidator, CraftValidatorContext, FieldAttributeMeta };
