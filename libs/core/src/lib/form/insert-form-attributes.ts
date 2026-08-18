import {
  computed,
  inject,
  Injector,
  type Signal,
  untracked,
} from '../host/craft-compat';
import { ɵcreateHostTaggedInjector } from '../craft-service';
import {
  CraftExceptionResult,
  type AnyCraftException,
} from '../craft-exception';
import { executeGeneratorCompatibleFactory } from '../craft-generator-runtime';
import type { MergeObject, Prettify, UnionToTuple } from '../util/util.type';
import { CraftField, CraftValidator } from './craft-field';
import {
  CRAFT_FIELD_EXCEPTION_SOURCE,
  DEFAULT_FIELD_EXCEPTION_VISIBILITY,
  fieldExceptionVisibilityMatches,
  staticFieldPath,
  type CraftFieldExceptionSource,
  type CraftFieldValidatorsCarrier,
  type FieldExceptionCollection,
  type FieldExceptionVisibility,
} from './field-exception';
import type {
  InsertionFormFactoryContext,
  InsertionsFormFactory,
} from './insert-form-internals';
import { VALIDATOR_OUTPUT_SYMBOL, type ValidatorOutput } from './validator';

type FormAttributeInput<T> = Signal<T> | (() => T);

type AnyValidatorOutput = ValidatorOutput<any, string, any, any, any, any>;

export type FormNodeExceptions = {
  list: FieldExceptionCollection['list'];
  byValidator: FieldExceptionCollection['byValidator'];
};

export type InsertFormAttributesConfig<
  _S,
  Validators extends AnyValidatorOutput = never,
> = {
  disable?: FormAttributeInput<boolean>;
  hidden?: FormAttributeInput<boolean>;
  readonly?: FormAttributeInput<boolean>;
  validators?: Validators[];
  /** Controls when `visibleExceptions` and the visible first/last helpers emit. */
  exceptionVisibility?: Exclude<FieldExceptionVisibility, 'visibleExceptions'>;
};

export type InsertFormAttributesContext<
  TValue,
  PreviousInsertionsOutputs = {},
  FormIdentifier extends string | number | unknown = unknown,
> = InsertionFormFactoryContext<
  TValue,
  PreviousInsertionsOutputs,
  FormIdentifier
>;

const EMPTY_EXCEPTIONS: FormNodeExceptions = {
  list: [],
  byValidator: {},
};

function attributeInputToSignal<T>(
  input: FormAttributeInput<T> | undefined,
): Signal<T> | undefined {
  if (input === undefined) return undefined;
  if (typeof input === 'function') {
    return computed(() => (input as () => T)());
  }
  return input;
}

function getValidatorBrand(validator: unknown): string | undefined {
  if (typeof validator !== 'function') return undefined;
  const runtime = (
    validator as { [VALIDATOR_OUTPUT_SYMBOL]?: { name?: string } }
  )[VALIDATOR_OUTPUT_SYMBOL];
  return runtime?.name;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ExtractValidatorMetadata<Validator> =
  Validator extends ValidatorOutput<
    infer _TValue,
    infer _Name,
    infer Exceptions,
    infer _Type,
    infer _Identifier,
    infer _Meta
  >
    ? Exceptions
    : never;

type ExceptionsByValidatorFromTuple<
  ExceptionsTuple extends unknown[],
  Acc = {},
> = ExceptionsTuple extends [infer Head, ...infer Tail]
  ? ExceptionsByValidatorFromTuple<
      Tail,
      Head extends CraftExceptionResult<infer M, infer _P>
        ? MergeObject<
            Acc,
            {
              [Key in M['_tag']]: Head;
            }
          >
        : Head
    >
  : Prettify<Acc>;

type ExceptionsList<Exception> = UnionToTuple<
  ExtractValidatorMetadata<NonNullable<Exception>>
>;

type ExceptionsByValidator<Validators> = ExceptionsByValidatorFromTuple<
  UnionToTuple<ExtractValidatorMetadata<NonNullable<Validators>>>
>;

type ExceptionUnion<Validators> = ExtractValidatorMetadata<
  NonNullable<Validators>
>;

type FormAttributesOutputs<Validators> =
  CraftFieldValidatorsCarrier<Validators> & {
    exceptions: Signal<{
      list: ExceptionsList<Validators>;
      byValidator: ExceptionsByValidator<NonNullable<Validators>>;
    }>;
    /**
     * Exceptions that should be visible to the user. By default, all exceptions are
     * hidden until the field is touched or the form has been attempted to be submitted at least once.
     */
    visibleExceptions: Signal<{
      list: ExceptionsList<Validators>;
      byValidator: ExceptionsByValidator<NonNullable<Validators>>;
    }>;
    hasExceptions: Signal<boolean>;
    /**
     * The first failing validator's exception, scanning the `validators` array
     * left-to-right. Useful in templates to display a single error without a `@for` loop.
     * Returns `undefined` when the field is valid.
     */
    firstLeftFailedValidation: Signal<ExceptionUnion<Validators> | undefined>;
    /**
     * The last failing validator's exception, scanning the `validators` array
     * right-to-left. Useful when the rightmost validator is the most specific.
     * Returns `undefined` when the field is valid.
     */
    lastRightFailedValidation: Signal<ExceptionUnion<Validators> | undefined>;
    /**
     * Same as `firstLeftFailedValidation` but only emits once the field is touched
     * or the form has been submitted at least once.
     */
    visibleFirstLeftFailedValidation: Signal<
      ExceptionUnion<Validators> | undefined
    >;
    /**
     * Same as `lastRightFailedValidation` but only emits once the field is touched
     * or the form has been submitted at least once.
     */
    visibleLastRightFailedValidation: Signal<
      ExceptionUnion<Validators> | undefined
    >;
  };

function applyFormAttributes<
  StateType,
  Validators extends AnyValidatorOutput,
  FormIdentifier extends string | number | unknown,
  PreviousInsertionsOutputs,
>(
  context: InsertFormAttributesContext<
    StateType,
    PreviousInsertionsOutputs,
    FormIdentifier
  >,
  config: InsertFormAttributesConfig<StateType, Validators>,
): FormAttributesOutputs<Validators> {
  const field = context.field as unknown as CraftField<StateType>;

  // Register hidden / disabled / readonly state bindings on the field.
  const hiddenSignal = attributeInputToSignal(config.hidden);
  if (hiddenSignal) field.ɵregisterStateBinding('hidden', hiddenSignal);
  const disabledSignal = attributeInputToSignal(config.disable);
  if (disabledSignal) field.ɵregisterStateBinding('disabled', disabledSignal);
  const readonlySignal = attributeInputToSignal(config.readonly);
  if (readonlySignal) field.ɵregisterStateBinding('readonly', readonlySignal);

  // Register validators on the field. Each validator's brand is used to group exceptions.
  const validatorBrands: string[] = [];
  for (const validatorInput of config.validators ?? []) {
    const brand = getValidatorBrand(validatorInput);
    if (brand) validatorBrands.push(brand);

    const fieldInjector = inject(Injector);
    const validatorInjector = ɵcreateHostTaggedInjector(
      fieldInjector,
      `validator:${brand ?? 'unknown'}`,
    );
    const finalValidator = (...args: unknown[]) =>
      executeGeneratorCompatibleFactory({
        factory: validatorInput as (...args: unknown[]) => unknown,
        thisArg: undefined,
        getInjector: () => validatorInjector,
        args,
        invalidYieldErrorMessage:
          'Form validators can only yield craftService dependencies.',
        multipleAppStartErrorMessage:
          'Form validators do not support onAppStart.',
        onAppStartNotSupportedErrorMessage:
          'Form validators do not support onAppStart.',
      });

    field.ɵregisterValidator(
      finalValidator as unknown as CraftValidator<StateType>,
      context.formIdentifier,
    );
  }

  const shouldSkip = computed(
    () => field.hidden() || field.disabled() || field.readonly(),
  );

  const exceptions = computed<FormNodeExceptions>(() => {
    if (shouldSkip()) return EMPTY_EXCEPTIONS;
    const list: AnyCraftException[] = [];
    const byValidator: Record<string, AnyCraftException> = {};
    for (const error of field.errors()) {
      if (!validatorBrands.length || matchesBrand(error, validatorBrands)) {
        list.push(error);
        const brand = (error as { __brand?: string }).__brand;
        if (typeof brand === 'string') {
          byValidator[brand] = error;
        }
      }
    }
    return { list, byValidator };
  });

  const visibleExceptions = computed<FormNodeExceptions>(() => {
    const visible = fieldExceptionVisibilityMatches(
      config.exceptionVisibility ?? DEFAULT_FIELD_EXCEPTION_VISIBILITY,
      {
        field: field as CraftField<unknown>,
        hasAttemptedSubmit: context.hasAttemptedSubmit,
      },
    );
    if (!visible) {
      return EMPTY_EXCEPTIONS;
    }
    return exceptions();
  });

  const firstLeftFailedValidation = computed<unknown>(() => {
    const byBrand = exceptions().byValidator;
    for (const brand of validatorBrands) {
      const error = byBrand[brand];
      if (error !== undefined) return error;
    }
    return undefined;
  });

  const lastRightFailedValidation = computed<unknown>(() => {
    const byBrand = exceptions().byValidator;
    for (let i = validatorBrands.length - 1; i >= 0; i--) {
      const error = byBrand[validatorBrands[i]];
      if (error !== undefined) return error;
    }
    return undefined;
  });

  const visibleFirstLeftFailedValidation = computed<unknown>(() => {
    const visible = visibleExceptions();
    for (const brand of validatorBrands) {
      const error = visible.byValidator[brand];
      if (error !== undefined) return error;
    }
    return undefined;
  });

  const visibleLastRightFailedValidation = computed<unknown>(() => {
    const visible = visibleExceptions();
    for (let i = validatorBrands.length - 1; i >= 0; i--) {
      const error = visible.byValidator[validatorBrands[i]];
      if (error !== undefined) return error;
    }
    return undefined;
  });

  const source: CraftFieldExceptionSource = {
    field: field as CraftField<unknown>,
    path: staticFieldPath(field.ɵpath),
    runtimePath: field.ɵpath,
    validatorNames: validatorBrands,
    exceptions: exceptions as CraftFieldExceptionSource['exceptions'],
    visibleExceptions:
      visibleExceptions as CraftFieldExceptionSource['visibleExceptions'],
    firstLeftFailedValidation:
      firstLeftFailedValidation as CraftFieldExceptionSource['firstLeftFailedValidation'],
    visibleFirstLeftFailedValidation:
      visibleFirstLeftFailedValidation as CraftFieldExceptionSource['visibleFirstLeftFailedValidation'],
    hasAttemptedSubmit: context.hasAttemptedSubmit,
  };
  Object.defineProperty(context.field, CRAFT_FIELD_EXCEPTION_SOURCE, {
    value: source,
    configurable: true,
    enumerable: false,
  });

  return {
    exceptions,
    visibleExceptions,
    hasExceptions: computed(() => exceptions().list.length > 0),
    firstLeftFailedValidation,
    lastRightFailedValidation,
    visibleFirstLeftFailedValidation,
    visibleLastRightFailedValidation,
  } as unknown as FormAttributesOutputs<Validators>;
}

export function insertFormAttributes<
  StateType,
  Validators extends AnyValidatorOutput = never,
  FormIdentifier extends string | number | unknown = unknown,
  PreviousInsertionsOutputs = {},
>(
  _factory: (
    context: InsertFormAttributesContext<
      StateType,
      PreviousInsertionsOutputs,
      FormIdentifier
    >,
  ) => InsertFormAttributesConfig<StateType, Validators>,
): InsertionsFormFactory<
  StateType,
  FormIdentifier,
  FormAttributesOutputs<Validators>,
  PreviousInsertionsOutputs
> {
  return (context) => applyFormAttributes(context, _factory(context));
}

export function formAttributes<
  StateType,
  Validators extends AnyValidatorOutput = never,
  FormIdentifier extends string | number | unknown = unknown,
  PreviousInsertionsOutputs = {},
>(
  context: InsertFormAttributesContext<
    StateType,
    PreviousInsertionsOutputs,
    FormIdentifier
  >,
  config: InsertFormAttributesConfig<StateType, Validators>,
): FormAttributesOutputs<Validators> {
  return applyFormAttributes(context, config);
}

function matchesBrand(error: unknown, brands: ReadonlyArray<string>): boolean {
  if (!isObjectRecord(error)) return false;
  const brand = error['__brand'];
  if (typeof brand !== 'string') return false;
  return brands.includes(brand);
}

// Re-export untracked for backward compat (unused by current consumers)
export { untracked };
