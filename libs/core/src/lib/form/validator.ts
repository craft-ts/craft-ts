import { computed, Signal } from '@angular/core';
import {
  email,
  emailError,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  required,
  validate,
  type PathKind,
  type SchemaPath,
  SchemaPathRules,
  type ValidationError,
} from '@angular/forms/signals';
import {
  CraftExceptionResult,
  CRAFT_EXCEPTION_SYMBOL,
} from '../craft-exception';
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

const SYNC_VALIDATOR_TYPE = 'sync' as const;
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
