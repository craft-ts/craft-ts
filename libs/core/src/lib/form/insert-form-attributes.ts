import { computed, type Signal } from '@angular/core';
import {
  type FieldTree,
  disabled,
  hidden,
  readonly,
  type ValidationError,
} from '@angular/forms/signals';
import type {
  InsertionFormFactoryContext,
  InsertionsFormFactory,
} from './insert-form';
import {
  VALIDATOR_OUTPUT_SYMBOL,
  type ValidatorOutput,
  type ValidatorBindingContext,
  type ValidatorModel,
} from './validator';
import type { MergeObject, Prettify, UnionToTuple } from '../util/util.type';
import { CraftExceptionResult } from '../craft-exception';

type FormAttributeInput<T> = Signal<T> | (() => T);

type FormNodeExceptionValue =
  | Record<string, unknown>
  | Record<string, unknown>[];

type AnySignalValidatorOutput = ValidatorOutput<
  any,
  string,
  any,
  any,
  any,
  any,
  any
>;

type SignalValidatorExecutionFactory<TValue, FormIdentifier> = (
  context: ValidatorBindingContext<TValue, FormIdentifier>,
) => Signal<unknown>;

type ValidatorExecutionInput<TValue, FormIdentifier> =
  SignalValidatorExecutionFactory<TValue, FormIdentifier>;

type ValidatorRuntimeDescriptor = {
  name: string;
  type: 'sync' | 'async';
  kind: 'signal';
};

type InternalFieldNode<TValue> = {
  value: Signal<TValue>;
  dirty: Signal<boolean>;
  hidden: Signal<boolean>;
  disabled: Signal<boolean>;
  readonly: Signal<boolean>;
};

type NormalizedValidatorException = {
  name: string;
  value: FormNodeExceptionValue;
  list: Record<string, unknown>[];
};

type NormalizedValidatorResult =
  | {
      status: 'valid';
    }
  | {
      status: 'pending';
    }
  | {
      status: 'invalid';
      exception: NormalizedValidatorException;
    };

type BoundSignalValidatorDescriptor = {
  execute: Signal<unknown>;
  fallbackName: string;
};

export type FormNodeExceptions = {
  list: unknown[];
  byValidator: Record<string, unknown>;
};

export type InsertFormAttributesConfig<
  S,
  Validators extends AnySignalValidatorOutput = never,
> = {
  disable?: FormAttributeInput<boolean>;
  hidden?: FormAttributeInput<boolean>;
  readonly?: FormAttributeInput<boolean>;
  validators?: Validators[];
};

export type InsertFormAttributesContext<
  TValue,
  PreviousInsertionsOutputs = {},
  FormIdentifier extends string | number | unknown = unknown,
> = InsertionFormFactoryContext<
  TValue,
  PreviousInsertionsOutputs,
  FormIdentifier
> & {
  nodeModel: ValidatorModel<TValue>;
};

const EMPTY_EXCEPTIONS: FormNodeExceptions = {
  list: [],
  byValidator: {},
};

function getHasAttemptedSubmitSignal(
  formRef: FieldTree<unknown, string | number>,
): Signal<boolean> | undefined {
  const hasAttemptedSubmit = (formRef() as unknown as Record<string, unknown>)[
    'hasAttemptedSubmit'
  ];

  return typeof hasAttemptedSubmit === 'function'
    ? (hasAttemptedSubmit as Signal<boolean>)
    : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getValidatorRuntime(
  value: unknown,
): ValidatorRuntimeDescriptor | undefined {
  if (typeof value !== 'function') {
    return undefined;
  }

  const runtime = (
    value as {
      [VALIDATOR_OUTPUT_SYMBOL]?: unknown;
    }
  )[VALIDATOR_OUTPUT_SYMBOL];

  if (
    !isObjectRecord(runtime) ||
    typeof runtime['name'] !== 'string' ||
    (runtime['type'] !== 'sync' && runtime['type'] !== 'async') ||
    runtime['kind'] !== 'signal'
  ) {
    return undefined;
  }

  return runtime as ValidatorRuntimeDescriptor;
}

function bindValidatorDescriptor<TValue, FormIdentifier>(
  validatorInput: ValidatorExecutionInput<TValue, FormIdentifier>,
  schemaPath: unknown,
  errors: Signal<ValidationError.WithFieldTree[]>,
  formIdentifier: FormIdentifier,
  index: number,
): BoundSignalValidatorDescriptor {
  const validatorInputFn = validatorInput as Function;
  const runtime = getValidatorRuntime(validatorInput);

  if (runtime?.kind !== 'signal') {
    throw new Error(
      'insertFormAttributes only supports signal-form validators. Legacy validators are no longer supported.',
    );
  }

  return {
    execute: (
      validatorInput as SignalValidatorExecutionFactory<TValue, FormIdentifier>
    )({
      schemaPath: schemaPath as ValidatorBindingContext<
        TValue,
        FormIdentifier
      >['schemaPath'],
      errors,
      identifier: formIdentifier,
    } as ValidatorBindingContext<TValue, FormIdentifier>),
    fallbackName:
      runtime.name ||
      validatorInputFn.name ||
      `insertFormAttributesValidator${index + 1}`,
  };
}

function normalizeExceptionValue(value: unknown): {
  list: Record<string, unknown>[];
  value: FormNodeExceptionValue;
} | null {
  if (Array.isArray(value)) {
    const list = value.filter(isObjectRecord);
    if (list.length === 0) {
      return null;
    }

    return {
      list,
      value,
    };
  }

  if (!isObjectRecord(value)) {
    return null;
  }

  return {
    list: [value],
    value,
  };
}

function normalizeValidatorResult(
  result: unknown,
  fallbackName: string,
): NormalizedValidatorResult {
  if (isObjectRecord(result) && 'valid' in result && result['valid'] === true) {
    return {
      status: 'valid',
    };
  }

  if (
    isObjectRecord(result) &&
    'valid' in result &&
    result['valid'] === false
  ) {
    return {
      status: 'pending',
    };
  }

  const normalizedException = normalizeExceptionValue(result);
  if (!normalizedException) {
    return {
      status: 'valid',
    };
  }

  const validatorName =
    isObjectRecord(result) &&
    '__brand' in result &&
    typeof result['__brand'] === 'string'
      ? result['__brand']
      : fallbackName;

  return {
    status: 'invalid',
    exception: {
      name: validatorName,
      value: normalizedException.value,
      list: normalizedException.list,
    },
  };
}

type ExtractValidatorMetadata<Validator> =
  Validator extends ValidatorOutput<
    infer TValue,
    infer Name,
    infer Exceptions,
    infer Type,
    infer Identifier,
    infer Meta,
    infer TPathKind
  >
    ? Exceptions
    : never;

type ExceptionsByValidatorFromTuple<
  ExceptionsTuple extends unknown[],
  Acc = {},
> = ExceptionsTuple extends [infer Head, ...infer Tail]
  ? ExceptionsByValidatorFromTuple<
      Tail,
      Head extends CraftExceptionResult<infer M, infer P>
        ? MergeObject<
            Acc,
            {
              [Key in M['code']]: Head;
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

export function insertFormAttributes<
  StateType,
  Validators extends AnySignalValidatorOutput = never,
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
  {
    exceptions: Signal<{
      list: ExceptionsList<Validators>;
      byValidator: ExceptionsByValidator<NonNullable<Validators>>;
    }>;
    /**
     * Exceptions that should be visible to the user. By default, all exceptions are hidden until the field is dirty or the form has been attempted to be submitted at least once.
     */
    visibleExceptions: Signal<{
      list: ExceptionsList<Validators>;
      byValidator: ExceptionsByValidator<NonNullable<Validators>>;
    }>;
    hasExceptions: Signal<boolean>;
  },
  PreviousInsertionsOutputs
> {
  return (context) => {
    const fieldNode = context.form() as unknown as InternalFieldNode<StateType>;
    const schemaPath = context.schemaPath;
    const hasAttemptedSubmit = getHasAttemptedSubmitSignal(context.form);
    const nodeModel: ValidatorModel<StateType> = () => ({
      value: context.validatorModelRef,
    });
    const config = _factory({
      ...context,
      nodeModel,
    });

    if (config.disable) {
      //@ts-expect-error can not identify the type of schemaPath, but it should be compatible with the disabled logic
      disabled(schemaPath, () => config.disable!());
    }

    if (config.hidden) {
      //@ts-expect-error can not identify the type of schemaPath, but it should be compatible with the hidden logic
      hidden(schemaPath, () => config.hidden!());
    }

    if (config.readonly) {
      //@ts-expect-error can not identify the type of schemaPath, but it should be compatible with the readonly logic
      readonly(schemaPath, () => config.readonly!());
    }

    const shouldSkipValidation = computed(
      () => fieldNode.hidden() || fieldNode.disabled() || fieldNode.readonly(),
    );
    const validationErrors = computed(
      () => context.form().errors() ?? [],
    ) as Signal<ValidationError.WithFieldTree[]>;

    const validatorDescriptors = (config.validators ?? []).map(
      (validatorInput, index) =>
        bindValidatorDescriptor(
          validatorInput as ValidatorExecutionInput<StateType, FormIdentifier>,
          schemaPath,
          validationErrors,
          context.formIdentifier,
          index,
        ),
    );

    const signalValidatorResults = validatorDescriptors.map((descriptor) =>
      computed(() => {
        if (shouldSkipValidation()) {
          return {
            status: 'valid',
          } as const satisfies NormalizedValidatorResult;
        }

        return normalizeValidatorResult(
          descriptor.execute(),
          descriptor.fallbackName,
        );
      }),
    );

    const exceptions = computed<FormNodeExceptions>(() => {
      if (shouldSkipValidation()) {
        return EMPTY_EXCEPTIONS;
      }

      const list: unknown[] = [];
      const byValidator: Record<string, unknown> = {};

      for (const result of signalValidatorResults) {
        const currentResult = result();
        if (currentResult.status !== 'invalid') {
          continue;
        }

        list.push(...currentResult.exception.list);
        byValidator[currentResult.exception.name] =
          currentResult.exception.value;
      }

      return {
        list,
        byValidator,
      };
    });

    const visibleExceptions = computed<FormNodeExceptions>(() => {
      if (!fieldNode.dirty() && !(hasAttemptedSubmit?.() ?? false)) {
        return EMPTY_EXCEPTIONS;
      }

      return exceptions();
    });

    return {
      exceptions,
      visibleExceptions,
      hasExceptions: computed(() => exceptions().list.length > 0),
    } as {
      exceptions: Signal<{
        list: ExceptionsList<Validators>;
        byValidator: ExceptionsByValidator<NonNullable<Validators>>;
      }>;
      visibleExceptions: Signal<{
        list: ExceptionsList<Validators>;
        byValidator: ExceptionsByValidator<NonNullable<Validators>>;
      }>;
      hasExceptions: Signal<boolean>;
    };
  };
}
