import {
  CraftExceptionResult,
  CRAFT_EXCEPTION_SYMBOL,
} from '../craft-exception';

export type ValidatorUtilBrand<Name> = { __brand: Name };

export type ValidatorSuccess<Name extends string> = {
  valid: true;
} & ValidatorUtilBrand<Name>;

export type ValidatorOutput<Name extends string, Exceptions> =
  | ValidatorSuccess<Name>
  | (Exceptions & ValidatorUtilBrand<Name>);

export type Validator<Name extends string, Exceptions> = () => ValidatorOutput<
  Name,
  Exceptions
>;

export type ValidatorModel<TValue> = () => {
  value: () => TValue;
};

export type DeferredValidator<
  TValue,
  Name extends string,
  Exceptions,
> = (model?: ValidatorModel<TValue>) => Validator<Name, Exceptions>;

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

type ValidatorException<Code extends string, Payload = undefined> =
  CraftExceptionResult<
    {
      code: Code;
    },
    Payload
  >;

type CRequiredException = ValidatorException<'required'>;
type CEmailException = ValidatorException<'email'>;
type CMinException = ValidatorException<'min', number>;
type CMaxException = ValidatorException<'max', number>;
type CMinLengthException = ValidatorException<'minLength', number>;
type CMaxLengthException = ValidatorException<'maxLength', number>;
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

const EMAIL_REGEXP =
  /^(?=.{1,254}$)(?=.{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

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

function shouldValidate(when?: ValidatorOption<boolean>): boolean {
  return when ? resolveValidatorOption(when) : true;
}

function createValidatorSuccess<const Name extends string>(
  brand: Name,
): ValidatorSuccess<Name> {
  return {
    valid: true,
    __brand: brand,
  };
}

function createValidatorException<
  const Name extends string,
  const Code extends string,
  Payload = undefined,
>(
  brand: Name,
  code: Code,
  payload: Payload,
): ValidatorException<Code, Payload> & ValidatorUtilBrand<Name> {
  return {
    code,
    [CRAFT_EXCEPTION_SYMBOL]: true,
    payload,
    [code]: payload,
    __brand: brand,
  } as ValidatorException<Code, Payload> & ValidatorUtilBrand<Name>;
}

function createDeferredValidator<
  TValue,
  Name extends string,
  Exceptions,
  Config extends ValidatorConfigWithOptionalModel<TValue>,
>(
  config: Config,
  createValidator: (
    resolvedConfig: Omit<Config, 'model'> & {
      model: ValidatorModel<TValue>;
    },
  ) => Validator<Name, Exceptions>,
): DeferredValidator<TValue, Name, Exceptions> {
  return (model) =>
    createValidator({
      ...config,
      model: resolveValidatorModel(config.model, model),
    });
}

function createRequiredValidator<TValue>({
  model,
  when,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
}): Validator<'cRequired', CRequiredException> {
  return () => {
    if (shouldValidate(when) && isEmpty(model().value())) {
      return createValidatorException('cRequired', 'required', undefined);
    }

    return createValidatorSuccess('cRequired');
  };
}

function createEmailValidator<TValue extends string | null | undefined>({
  model,
  when,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
}): Validator<'cEmail', CEmailException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cEmail');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cEmail');
    }

    if (!EMAIL_REGEXP.test(value as string)) {
      return createValidatorException('cEmail', 'email', undefined);
    }

    return createValidatorSuccess('cEmail');
  };
}

function createMinValidator<TValue extends number | string | null | undefined>({
  model,
  when,
  min,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  min: ValidatorOption<number | undefined>;
}): Validator<'cMin', CMinException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cMin');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cMin');
    }

    const minValue = resolveValidatorOption(min);

    if (minValue === undefined || Number.isNaN(minValue)) {
      return createValidatorSuccess('cMin');
    }

    const numericValue = !value && value !== 0 ? Number.NaN : Number(value);

    if (numericValue < minValue) {
      return createValidatorException('cMin', 'min', minValue);
    }

    return createValidatorSuccess('cMin');
  };
}

function createMaxValidator<TValue extends number | string | null | undefined>({
  model,
  when,
  max,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  max: ValidatorOption<number | undefined>;
}): Validator<'cMax', CMaxException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cMax');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cMax');
    }

    const maxValue = resolveValidatorOption(max);

    if (maxValue === undefined || Number.isNaN(maxValue)) {
      return createValidatorSuccess('cMax');
    }

    const numericValue = !value && value !== 0 ? Number.NaN : Number(value);

    if (numericValue > maxValue) {
      return createValidatorException('cMax', 'max', maxValue);
    }

    return createValidatorSuccess('cMax');
  };
}

function createMinLengthValidator<TValue extends ValueWithLengthOrSize>({
  model,
  when,
  minLength,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  minLength: ValidatorOption<number | undefined>;
}): Validator<'cMinLength', CMinLengthException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cMinLength');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cMinLength');
    }

    const resolvedMinLength = resolveValidatorOption(minLength);

    if (resolvedMinLength === undefined) {
      return createValidatorSuccess('cMinLength');
    }

    if (getLengthOrSize(value) < resolvedMinLength) {
      return createValidatorException(
        'cMinLength',
        'minLength',
        resolvedMinLength,
      );
    }

    return createValidatorSuccess('cMinLength');
  };
}

function createMaxLengthValidator<TValue extends ValueWithLengthOrSize>({
  model,
  when,
  maxLength,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  maxLength: ValidatorOption<number | undefined>;
}): Validator<'cMaxLength', CMaxLengthException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cMaxLength');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cMaxLength');
    }

    const resolvedMaxLength = resolveValidatorOption(maxLength);

    if (resolvedMaxLength === undefined) {
      return createValidatorSuccess('cMaxLength');
    }

    if (getLengthOrSize(value) > resolvedMaxLength) {
      return createValidatorException(
        'cMaxLength',
        'maxLength',
        resolvedMaxLength,
      );
    }

    return createValidatorSuccess('cMaxLength');
  };
}

function createPatternValidator<TValue extends string | null | undefined>({
  model,
  when,
  pattern,
}: {
  model: ValidatorModel<TValue>;
  when?: ValidatorOption<boolean>;
  pattern: ValidatorOption<RegExp | undefined>;
}): Validator<'cPattern', CPatternException> {
  return () => {
    if (!shouldValidate(when)) {
      return createValidatorSuccess('cPattern');
    }

    const value = model().value();

    if (isEmpty(value)) {
      return createValidatorSuccess('cPattern');
    }

    const resolvedPattern = resolveValidatorOption(pattern);

    if (resolvedPattern === undefined) {
      return createValidatorSuccess('cPattern');
    }

    if (!resolvedPattern.test(value as string)) {
      return createValidatorException(
        'cPattern',
        'pattern',
        resolvedPattern,
      );
    }

    return createValidatorSuccess('cPattern');
  };
}

export function cRequired<TValue>(
  model: ValidatorModel<TValue>,
): Validator<'cRequired', CRequiredException>;
export function cRequired<TValue>(
  config?: CRequiredConfig<TValue>,
): DeferredValidator<TValue, 'cRequired', CRequiredException>;
export function cRequired<TValue>(
  input?: ValidatorModel<TValue> | CRequiredConfig<TValue>,
):
  | Validator<'cRequired', CRequiredException>
  | DeferredValidator<TValue, 'cRequired', CRequiredException> {
  if (isValidatorModel(input)) {
    return createRequiredValidator({
      model: input,
    });
  }

  return createDeferredValidator(input ?? {}, createRequiredValidator);
}

export function cEmail<TValue extends string | null | undefined>(
  model: ValidatorModel<TValue>,
): Validator<'cEmail', CEmailException>;
export function cEmail<TValue extends string | null | undefined>(
  config?: CEmailConfig<TValue>,
): DeferredValidator<TValue, 'cEmail', CEmailException>;
export function cEmail<TValue extends string | null | undefined>(
  input?: ValidatorModel<TValue> | CEmailConfig<TValue>,
):
  | Validator<'cEmail', CEmailException>
  | DeferredValidator<TValue, 'cEmail', CEmailException> {
  if (isValidatorModel(input)) {
    return createEmailValidator({
      model: input,
    });
  }

  return createDeferredValidator(input ?? {}, createEmailValidator);
}

export function cMin<TValue extends number | string | null | undefined>(
  config: CMinConfig<TValue>,
): DeferredValidator<TValue, 'cMin', CMinException> {
  return createDeferredValidator(config, ({ model, when }) =>
    createMinValidator({
      model,
      when,
      min: 'min' in config ? config.min : config.minValue,
    }),
  );
}

export function cMax<TValue extends number | string | null | undefined>(
  config: CMaxConfig<TValue>,
): DeferredValidator<TValue, 'cMax', CMaxException> {
  return createDeferredValidator(config, ({ model, when }) =>
    createMaxValidator({
      model,
      when,
      max: 'max' in config ? config.max : config.maxValue,
    }),
  );
}

export function cMinLength<TValue extends ValueWithLengthOrSize>(
  config: CMinLengthConfig<TValue>,
): DeferredValidator<TValue, 'cMinLength', CMinLengthException> {
  return createDeferredValidator(config, createMinLengthValidator);
}

export function cMaxLength<TValue extends ValueWithLengthOrSize>(
  config: CMaxLengthConfig<TValue>,
): DeferredValidator<TValue, 'cMaxLength', CMaxLengthException> {
  return createDeferredValidator(config, createMaxLengthValidator);
}

export function cPattern<TValue extends string | null | undefined>(
  config: CPatternConfig<TValue>,
): DeferredValidator<TValue, 'cPattern', CPatternException> {
  return createDeferredValidator(config, createPatternValidator);
}
