import {
  computed,
  effect,
  inject,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import { REQUIRED, type FieldTree } from '@angular/forms/signals';
import type { InsertionsFormFactory } from './insert-form';
import type { ValidatorModel } from './validator';

type FormAttributeInput<T> = Signal<T> | (() => T);

type FormNodeExceptionValue =
  | Record<string, unknown>
  | Record<string, unknown>[];

type ValidatorExecution = (() => unknown) & Function;

type ValidatorExecutionFactory<TValue, FormIdentifier> = ((
  model?: ValidatorModel<TValue>,
  identifier?: FormIdentifier,
) => ValidatorExecution) &
  Function;

type ValidatorExecutionInput<TValue, FormIdentifier> =
  | ValidatorExecution
  | ValidatorExecutionFactory<TValue, FormIdentifier>;

type InternalFieldContext<TValue> = {
  fieldTree: FieldTree<TValue, string | number>;
};

type InternalFieldNodeLogic<TValue> = {
  hidden: {
    push: (logic: (context: InternalFieldContext<TValue>) => boolean) => void;
  };
  disabledReasons: {
    push: (
      logic: (
        context: InternalFieldContext<TValue>,
      ) => { fieldTree: FieldTree<TValue, string | number> } | undefined,
    ) => void;
  };
  readonly: {
    push: (logic: (context: InternalFieldContext<TValue>) => boolean) => void;
  };
  syncErrors: {
    push: (logic: (context: InternalFieldContext<TValue>) => unknown) => void;
  };
  asyncErrors: {
    push: (
      logic: (context: InternalFieldContext<TValue>) => 'pending' | unknown,
    ) => void;
  };
  getMetadata: (key: unknown) => {
    push: (logic: () => unknown) => void;
  };
};

type InternalFieldNode<TValue> = {
  value: Signal<TValue>;
  hidden: Signal<boolean>;
  disabled: Signal<boolean>;
  readonly: Signal<boolean>;
  logicNode: {
    logic: InternalFieldNodeLogic<TValue>;
  };
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

type BoundValidatorDescriptor = {
  execute: ValidatorExecution;
  fallbackName: string;
  kind: 'sync' | 'async';
};

export type FormNodeExceptions = {
  list: unknown[];
  byValidator: Record<string, unknown>;
};

export type InsertFormAttributesConfig<
  TValue,
  FormIdentifier extends string | number | unknown = unknown,
> = {
  disable?: FormAttributeInput<boolean>;
  required?: FormAttributeInput<boolean>;
  hidden?: FormAttributeInput<boolean>;
  readonly?: FormAttributeInput<boolean>;
  validators?: readonly ValidatorExecutionInput<TValue, FormIdentifier>[];
};

export type InsertFormAttributesContext<TValue> = {
  nodeModel: ValidatorModel<TValue>;
};

const EMPTY_EXCEPTIONS: FormNodeExceptions = {
  list: [],
  byValidator: {},
};

function isAsyncFunction(
  value: unknown,
): value is (...args: never[]) => Promise<unknown> {
  return (
    typeof value === 'function' && value.constructor?.name === 'AsyncFunction'
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createReactiveAttributeSignal<T>(
  input: FormAttributeInput<T>,
  injector: Injector,
): Signal<T> {
  const attribute = signal(input());

  effect(
    () => {
      attribute.set(input());
    },
    {
      injector,
    },
  );

  return attribute.asReadonly();
}

function isBoundValidatorExecution<TValue, FormIdentifier>(
  validatorInput: ValidatorExecutionInput<TValue, FormIdentifier>,
): validatorInput is ValidatorExecution {
  return validatorInput.length === 0;
}

function bindValidatorDescriptor<TValue, FormIdentifier>(
  validatorInput: ValidatorExecutionInput<TValue, FormIdentifier>,
  nodeModel: ValidatorModel<TValue>,
  formIdentifier: FormIdentifier,
  index: number,
): BoundValidatorDescriptor | undefined {
  if (typeof validatorInput !== 'function') {
    return undefined;
  }

  const validator = isBoundValidatorExecution(validatorInput)
    ? validatorInput
    : validatorInput(nodeModel, formIdentifier);

  if (typeof validator !== 'function') {
    return undefined;
  }

  return {
    execute: validator,
    fallbackName:
      validator.name ||
      validatorInput.name ||
      `insertFormAttributesValidator${index + 1}`,
    kind: isAsyncFunction(validator) ? 'async' : 'sync',
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
  if (isObjectRecord(result) && 'valid' in result && result.valid === true) {
    return {
      status: 'valid',
    };
  }

  if (isObjectRecord(result) && 'valid' in result && result.valid === false) {
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
    typeof result.__brand === 'string'
      ? result.__brand
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

function attachFieldTreeToException(
  exception: Record<string, unknown>,
  fieldTree: FieldTree<unknown, string | number>,
) {
  if ('fieldTree' in exception) {
    return exception;
  }

  return {
    ...exception,
    fieldTree,
  };
}

function attachFieldTreeToExceptionValue(
  value: FormNodeExceptionValue,
  fieldTree: FieldTree<unknown, string | number>,
) {
  if (Array.isArray(value)) {
    return value.map((exception) =>
      attachFieldTreeToException(exception, fieldTree),
    );
  }

  return attachFieldTreeToException(value, fieldTree);
}

function createAsyncValidatorState(
  descriptor: BoundValidatorDescriptor,
  shouldSkipValidation: Signal<boolean>,
  injector: Injector,
) {
  const pending = signal(false);
  const exception = signal<NormalizedValidatorException | undefined>(undefined);
  let validationRunId = 0;

  effect(
    (onCleanup) => {
      if (shouldSkipValidation()) {
        pending.set(false);
        exception.set(undefined);
        return;
      }

      const currentRunId = ++validationRunId;
      let active = true;

      onCleanup(() => {
        active = false;
      });

      pending.set(true);
      exception.set(undefined);

      Promise.resolve(descriptor.execute()).then(
        (result) => {
          if (!active || currentRunId !== validationRunId) {
            return;
          }

          const normalizedResult = normalizeValidatorResult(
            result,
            descriptor.fallbackName,
          );

          if (normalizedResult.status === 'pending') {
            pending.set(true);
            exception.set(undefined);
            return;
          }

          pending.set(false);
          exception.set(
            normalizedResult.status === 'invalid'
              ? normalizedResult.exception
              : undefined,
          );
        },
        () => {
          if (!active || currentRunId !== validationRunId) {
            return;
          }

          pending.set(false);
          exception.set(undefined);
        },
      );
    },
    {
      injector,
    },
  );

  return {
    pending: pending.asReadonly(),
    exception: exception.asReadonly(),
  };
}

export function insertFormAttributes<
  StateType,
  FormIdentifier extends string | number | unknown = unknown,
  PreviousInsertionsOutputs = {},
>(
  _factory: (
    context: InsertFormAttributesContext<StateType>,
  ) => InsertFormAttributesConfig<StateType, FormIdentifier>,
): InsertionsFormFactory<
  StateType,
  FormIdentifier,
  {
    exceptions: Signal<FormNodeExceptions>;
    hasExceptions: Signal<boolean>;
  },
  PreviousInsertionsOutputs
> {
  return (context) => {
    const injector = inject(Injector);
    const fieldNode = context.form() as InternalFieldNode<StateType>;
    const nodeModel: ValidatorModel<StateType> = () => ({
      value: fieldNode.value,
    });
    const config = _factory({
      nodeModel,
    });

    if (config.disable) {
      const disabled = createReactiveAttributeSignal(config.disable, injector);
      fieldNode.logicNode.logic.disabledReasons.push(({ fieldTree }) => {
        return disabled() ? { fieldTree } : undefined;
      });
    }

    if (config.hidden) {
      const hidden = createReactiveAttributeSignal(config.hidden, injector);
      fieldNode.logicNode.logic.hidden.push(() => hidden());
    }

    if (config.readonly) {
      const readonly = createReactiveAttributeSignal(config.readonly, injector);
      fieldNode.logicNode.logic.readonly.push(() => readonly());
    }

    if (config.required) {
      const required = createReactiveAttributeSignal(config.required, injector);
      fieldNode.logicNode.logic.getMetadata(REQUIRED).push(() => required());
    }

    const shouldSkipValidation = computed(
      () => fieldNode.hidden() || fieldNode.disabled() || fieldNode.readonly(),
    );

    const validatorDescriptors = (config.validators ?? [])
      .map((validatorInput, index) =>
        bindValidatorDescriptor(
          validatorInput,
          nodeModel,
          context.formIdentifier,
          index,
        ),
      )
      .filter(
        (validator): validator is BoundValidatorDescriptor => !!validator,
      );

    const syncValidatorResults = validatorDescriptors
      .filter((validator) => validator.kind === 'sync')
      .map((descriptor) => {
        const result = computed(() => {
          if (shouldSkipValidation()) {
            return {
              status: 'valid',
            } as const satisfies NormalizedValidatorResult;
          }

          return normalizeValidatorResult(
            descriptor.execute(),
            descriptor.fallbackName,
          );
        });

        fieldNode.logicNode.logic.syncErrors.push(({ fieldTree }) => {
          const currentResult = result();
          if (currentResult.status !== 'invalid') {
            return undefined;
          }

          return attachFieldTreeToExceptionValue(
            currentResult.exception.value,
            fieldTree as FieldTree<unknown, string | number>,
          );
        });

        return result;
      });

    const asyncValidatorStates = validatorDescriptors
      .filter((validator) => validator.kind === 'async')
      .map((descriptor) => {
        const runtime = createAsyncValidatorState(
          descriptor,
          shouldSkipValidation,
          injector,
        );

        fieldNode.logicNode.logic.asyncErrors.push(({ fieldTree }) => {
          if (runtime.pending()) {
            return 'pending';
          }

          const currentException = runtime.exception();
          if (!currentException) {
            return undefined;
          }

          return attachFieldTreeToExceptionValue(
            currentException.value,
            fieldTree as FieldTree<unknown, string | number>,
          );
        });

        return runtime;
      });

    const exceptions = computed<FormNodeExceptions>(() => {
      if (shouldSkipValidation()) {
        return EMPTY_EXCEPTIONS;
      }

      const list: unknown[] = [];
      const byValidator: Record<string, unknown> = {};

      for (const result of syncValidatorResults) {
        const currentResult = result();
        if (currentResult.status !== 'invalid') {
          continue;
        }

        list.push(...currentResult.exception.list);
        byValidator[currentResult.exception.name] =
          currentResult.exception.value;
      }

      for (const runtime of asyncValidatorStates) {
        const currentException = runtime.exception();
        if (!currentException) {
          continue;
        }

        list.push(...currentException.list);
        byValidator[currentException.name] = currentException.value;
      }

      return {
        list,
        byValidator,
      };
    });

    return {
      exceptions,
      hasExceptions: computed(() => exceptions().list.length > 0),
    };
  };
}
