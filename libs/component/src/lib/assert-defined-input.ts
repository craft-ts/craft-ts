import {
  CraftGenShortCircuit,
  craftException,
  isCraftGenShortCircuit,
  type CatchTagExhaustiveCodesCheck,
  type CraftExceptionResult,
} from '@craft-ng/core';
import type { CraftInputExceptionsCarrier, Input } from './types';

export const CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE =
  'CraftUndefinedPropertyException' as const;

export type CraftUndefinedPropertyException = CraftExceptionResult<
  { readonly code: typeof CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE },
  { readonly property?: string }
>;

type InputPipeOperator<SourceValue, OutputValue> = (
  source: Input<SourceValue>,
) => Input<OutputValue>;

export type PipeableInput<Value> = Input<Value> & {
  pipe<OutputValue>(
    operator: InputPipeOperator<Value, OutputValue>,
  ): PipeableInput<OutputValue>;
};

type AssertDefinedInputHandler = (
  exception: CraftUndefinedPropertyException,
) => unknown;

type AssertDefinedInputHandlers = Record<
  typeof CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE,
  AssertDefinedInputHandler
>;

type HandlerOutput<Handlers extends AssertDefinedInputHandlers> = ReturnType<
  Handlers[typeof CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE]
>;

export function craftUndefinedPropertyException(
  property?: string,
): CraftUndefinedPropertyException {
  const payload: { readonly property?: string } =
    property === undefined ? {} : { property };

  return craftException(
    { code: CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE },
    payload,
  );
}

export type AssertDefinedInput<Value> = Input<Exclude<Value, undefined>> &
  CraftInputExceptionsCarrier<typeof CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE> &
  Pick<PipeableInput<Exclude<Value, undefined>>, 'pipe'>;

function pipeableInput<Value>(source: Input<Value>): PipeableInput<Value> {
  const input = source as PipeableInput<Value>;
  if (Object.prototype.hasOwnProperty.call(input, 'pipe')) {
    return input;
  }

  Object.defineProperty(input, 'pipe', {
    value: <OutputValue>(
      operator: InputPipeOperator<Value, OutputValue>,
    ): PipeableInput<OutputValue> => pipeableInput(operator(input)),
    enumerable: false,
  });
  return input;
}

/** Creates an input which narrows away undefined and short-circuits when absent. */
export function assertDefinedInput<Value>(
  source: Input<Value | undefined>,
  options: { readonly property?: string } = {},
): AssertDefinedInput<Value> {
  return pipeableInput(function* () {
    const value = yield* source();
    if (value !== undefined) {
      return value as Exclude<Value, undefined>;
    }

    throw new CraftGenShortCircuit(
      craftUndefinedPropertyException(options.property),
    );
  } as Input<Exclude<Value, undefined>>) as AssertDefinedInput<Value>;
}

export const catchInput = {
  exhaustive<const Handlers extends AssertDefinedInputHandlers>(
    handlers: Handlers &
      CatchTagExhaustiveCodesCheck<
        typeof CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE,
        Handlers
      >,
  ) {
    return <Value>(
      source: Input<Value>,
    ): PipeableInput<
      Exclude<Value, undefined> | HandlerOutput<Handlers>
    > =>
      pipeableInput(function* () {
        try {
          return (yield* source()) as Exclude<Value, undefined>;
        } catch (error) {
          if (!isCraftGenShortCircuit(error)) {
            throw error;
          }

          if (
            error.exception.code !==
            CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE
          ) {
            throw error;
          }

          return handlers[CRAFT_UNDEFINED_PROPERTY_EXCEPTION_CODE](
            error.exception as CraftUndefinedPropertyException,
          ) as Exclude<Value, undefined> | HandlerOutput<Handlers>;
        }
      } as Input<Exclude<Value, undefined> | HandlerOutput<Handlers>>);
  },
};
