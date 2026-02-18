import { isSignal, Signal, signal } from '@angular/core';

export const BUSINESS_EXCEPTION_SCOPES = [
  'state',
  'method',
  'derived',
  'reaction',
] as const;

export type BusinessExceptionScope = (typeof BUSINESS_EXCEPTION_SCOPES)[number];

export type BusinessException<
  Scope extends BusinessExceptionScope = BusinessExceptionScope,
  Code extends string = string,
  Payload = unknown,
> = Readonly<{
  scope: Scope;
  code: Code;
  payload: Payload;
}>;

export type StateException<Code extends string = string, Payload = unknown> =
  BusinessException<'state', Code, Payload>;

export type MethodException<Code extends string = string, Payload = unknown> =
  BusinessException<'method', Code, Payload>;

export type DerivedException<Code extends string = string, Payload = unknown> =
  BusinessException<'derived', Code, Payload>;

export type ReactionException<
  Code extends string = string,
  Payload = unknown,
> = BusinessException<'reaction', Code, Payload>;

export type AnyBusinessException = BusinessException<
  BusinessExceptionScope,
  string,
  unknown
>;

export type StripBusinessExceptions<Value> = Exclude<
  Value,
  AnyBusinessException
>;

type ScopePayloadByCode<ExceptionUnion extends AnyBusinessException> = [
  ExceptionUnion,
] extends [never]
  ? {}
  : {
      [Code in ExceptionUnion['code'] & string]: Extract<
        ExceptionUnion,
        { code: Code }
      >['payload'];
    };

export type GroupedBusinessExceptions<
  StateExceptions extends StateException = never,
  MethodExceptions extends MethodException = never,
  DerivedExceptions extends DerivedException = never,
  ReactionExceptions extends ReactionException = never,
> = {
  state: ScopePayloadByCode<StateExceptions>;
  method: ScopePayloadByCode<MethodExceptions>;
  derived: ScopePayloadByCode<DerivedExceptions>;
  reaction: ScopePayloadByCode<ReactionExceptions>;
};

export type AnyGroupedBusinessExceptions = GroupedBusinessExceptions<
  StateException<string, unknown>,
  MethodException<string, unknown>,
  DerivedException<string, unknown>,
  ReactionException<string, unknown>
>;

export const EMPTY_GROUPED_BUSINESS_EXCEPTIONS: AnyGroupedBusinessExceptions = {
  state: {},
  method: {},
  derived: {},
  reaction: {},
};

const scopeSet = new Set<string>(BUSINESS_EXCEPTION_SCOPES);

export function isBusinessException(value: unknown): value is AnyBusinessException {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<AnyBusinessException>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.scope === 'string' &&
    scopeSet.has(candidate.scope)
  );
}

function createException<
  Scope extends BusinessExceptionScope,
  Code extends string,
  Payload = undefined,
>(
  scope: Scope,
  code: Code,
  payload?: Payload,
): BusinessException<Scope, Code, Payload> {
  return {
    scope,
    code,
    payload: payload as Payload,
  };
}

export function stateException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
): StateException<Code, Payload> {
  return createException('state', code, payload);
}

export function methodException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
): MethodException<Code, Payload> {
  return createException('method', code, payload);
}

export function derivedException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
): DerivedException<Code, Payload> {
  return createException('derived', code, payload);
}

export function reactionException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
): ReactionException<Code, Payload> {
  return createException('reaction', code, payload);
}

const EXCEPTION_CARRIER = Symbol('EXCEPTION_CARRIER');
const STATE_EXCEPTION_DEFINITIONS = Symbol('STATE_EXCEPTION_DEFINITIONS');

export type ExceptionDefinitionsToUnion<
  Scope extends BusinessExceptionScope,
  Definitions extends Record<string, unknown>,
> = {
  [Code in keyof Definitions & string]: BusinessException<
    Scope,
    Code,
    Definitions[Code]
  >;
}[keyof Definitions & string];

export type ExceptionCarrier<Exceptions extends AnyBusinessException = never> = {
  readonly [EXCEPTION_CARRIER]?: Exceptions;
};

export type ExtractExceptionCarrier<Value> = Value extends {
  readonly [EXCEPTION_CARRIER]?: infer Exceptions;
}
  ? Extract<Exceptions, AnyBusinessException>
  : never;

export type WithStateExceptions<
  State,
  Definitions extends Record<string, unknown>,
> = State &
  ExceptionCarrier<ExceptionDefinitionsToUnion<'state', Definitions>>;

export function withStateExceptions<
  State,
  Definitions extends Record<string, unknown>,
>(
  state: State,
  definitions: Definitions,
): WithStateExceptions<State, Definitions> {
  if (typeof state === 'object' && state !== null) {
    try {
      const stateRecord = state as Record<PropertyKey, unknown>;
      Object.defineProperty(stateRecord, STATE_EXCEPTION_DEFINITIONS, {
        value: definitions,
        enumerable: false,
        configurable: false,
        writable: false,
      });
    } catch {
      // Ignore immutable objects. The helper still carries the type-level exceptions.
    }
  }
  return state as WithStateExceptions<State, Definitions>;
}

export function getStateExceptionDefinitions(
  state: unknown,
): Record<string, unknown> {
  if (typeof state !== 'object' || state === null) {
    return {};
  }

  const stateRecord = state as Record<PropertyKey, unknown>;
  const definitions = stateRecord[STATE_EXCEPTION_DEFINITIONS];
  if (!definitions || typeof definitions !== 'object') {
    return {};
  }

  return definitions as Record<string, unknown>;
}

export function withMethodExceptions<
  Value,
  Definitions extends Record<string, unknown>,
>(
  value: Value,
  definitions: Definitions,
): Value & ExceptionCarrier<ExceptionDefinitionsToUnion<'method', Definitions>> {
  return value as Value &
    ExceptionCarrier<ExceptionDefinitionsToUnion<'method', Definitions>>;
}

export function withDerivedExceptions<
  Value,
  Definitions extends Record<string, unknown>,
>(
  value: Value,
  definitions: Definitions,
): Value & ExceptionCarrier<ExceptionDefinitionsToUnion<'derived', Definitions>> {
  return value as Value &
    ExceptionCarrier<ExceptionDefinitionsToUnion<'derived', Definitions>>;
}

export function withReactionExceptions<
  Value,
  Definitions extends Record<string, unknown>,
>(
  value: Value,
  definitions: Definitions,
): Value &
  ExceptionCarrier<ExceptionDefinitionsToUnion<'reaction', Definitions>> {
  return value as Value &
    ExceptionCarrier<ExceptionDefinitionsToUnion<'reaction', Definitions>>;
}

type AnySignal = Signal<unknown>;
type AnyFn = (...args: any[]) => unknown;

export type ExtractBusinessExceptionsFromValue<Value> =
  | ExtractExceptionCarrier<Value>
  | Extract<Value, AnyBusinessException>
  | (Value extends { readonly __reactionExceptions__?: infer Exceptions }
      ? Extract<Exceptions, ReactionException>
      : never)
  | (Value extends AnySignal
      ? Value extends Signal<infer SignalValue>
        ? ExtractBusinessExceptionsFromValue<SignalValue>
        : never
      : never)
  | (Value extends AnyFn
      ? ExtractBusinessExceptionsFromValue<Awaited<ReturnType<Value>>>
      : never);

export type ExtractBusinessExceptionsFromObject<ObjectValue> =
  ObjectValue extends object
    ? {
        [K in keyof ObjectValue]: ExtractBusinessExceptionsFromValue<
          ObjectValue[K]
        >;
      }[keyof ObjectValue]
    : never;

export type ExtractStateExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  StateException
>;

export type ExtractMethodExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  MethodException
>;

export type ExtractDerivedExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  DerivedException
>;

export type ExtractReactionExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  ReactionException
>;

function sortRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.keys(record)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      (acc as Record<string, unknown>)[key] = record[key];
      return acc;
    }, {} as T);
}

export function sortGroupedBusinessExceptions<
  GroupedExceptions extends AnyGroupedBusinessExceptions,
>(exceptions: GroupedExceptions): GroupedExceptions {
  return {
    state: sortRecord(exceptions.state),
    method: sortRecord(exceptions.method),
    derived: sortRecord(exceptions.derived),
    reaction: sortRecord(exceptions.reaction),
  } as GroupedExceptions;
}

function toGroupedBusinessExceptions(
  exceptions?: Partial<AnyGroupedBusinessExceptions>,
): AnyGroupedBusinessExceptions {
  return sortGroupedBusinessExceptions({
    state: { ...(exceptions?.state ?? {}) },
    method: { ...(exceptions?.method ?? {}) },
    derived: { ...(exceptions?.derived ?? {}) },
    reaction: { ...(exceptions?.reaction ?? {}) },
  } as AnyGroupedBusinessExceptions);
}

export type BusinessExceptionStore<
  GroupedExceptions extends AnyGroupedBusinessExceptions = AnyGroupedBusinessExceptions,
> = {
  readonly exceptions: Signal<GroupedExceptions>;
  raiseException: <Exception extends AnyBusinessException>(
    exception: Exception,
  ) => Exception;
  setScopeExceptions: (
    scope: BusinessExceptionScope,
    values: Record<string, unknown>,
  ) => void;
  clearException: (scope: BusinessExceptionScope, code: string) => void;
  clearScope: (scope: BusinessExceptionScope) => void;
  clearAll: () => void;
};

export function createBusinessExceptionStore<
  GroupedExceptions extends AnyGroupedBusinessExceptions = AnyGroupedBusinessExceptions,
>(
  initialExceptions?: Partial<AnyGroupedBusinessExceptions>,
): BusinessExceptionStore<GroupedExceptions> {
  const exceptionsSignal = signal<AnyGroupedBusinessExceptions>(
    toGroupedBusinessExceptions(initialExceptions),
  );

  const raiseException = <Exception extends AnyBusinessException>(
    exception: Exception,
  ) => {
    exceptionsSignal.update((current) => {
      const currentScope = current[exception.scope] as Record<string, unknown>;
      return {
        ...current,
        [exception.scope]: sortRecord({
          ...currentScope,
          [exception.code]: exception.payload,
        }),
      };
    });
    return exception;
  };

  const setScopeExceptions = (
    scope: BusinessExceptionScope,
    values: Record<string, unknown>,
  ) => {
    exceptionsSignal.update((current) => ({
      ...current,
      [scope]: sortRecord(values),
    }));
  };

  const clearException = (scope: BusinessExceptionScope, code: string) => {
    exceptionsSignal.update((current) => {
      const currentScope = current[scope] as Record<string, unknown>;
      const { [code]: _removed, ...rest } = currentScope;
      return {
        ...current,
        [scope]: sortRecord(rest),
      };
    });
  };

  const clearScope = (scope: BusinessExceptionScope) => {
    exceptionsSignal.update((current) => ({
      ...current,
      [scope]: {},
    }));
  };

  const clearAll = () => {
    exceptionsSignal.set({
      state: {},
      method: {},
      derived: {},
      reaction: {},
    });
  };

  return {
    exceptions: exceptionsSignal as Signal<GroupedExceptions>,
    raiseException,
    setScopeExceptions,
    clearException,
    clearScope,
    clearAll,
  };
}

type PromiseLikeValue<T> = {
  then: (onFulfilled: (value: T) => unknown) => unknown;
};

function isPromiseLike<T>(value: unknown): value is PromiseLikeValue<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in (value as Record<string, unknown>) &&
    typeof (value as PromiseLikeValue<T>).then === 'function'
  );
}

export function captureBusinessExceptionResult<Result>(
  result: Result,
  raiseException: (exception: AnyBusinessException) => void,
): Result {
  if (isPromiseLike(result)) {
    return (result.then((resolvedValue) => {
      if (isBusinessException(resolvedValue)) {
        raiseException(resolvedValue);
      }
      return resolvedValue;
    }) as unknown) as Result;
  }

  if (isBusinessException(result)) {
    raiseException(result);
  }
  return result;
}

export function wrapExceptionAwareMethods<
  Insertions extends Record<string, unknown>,
>(
  insertions: Insertions,
  raiseException: (exception: AnyBusinessException) => void,
): Insertions {
  return Object.entries(insertions).reduce((acc, [key, value]) => {
    if (typeof value !== 'function' || isSignal(value)) {
      (acc as Record<string, unknown>)[key] = value;
      return acc;
    }

    (acc as Record<string, unknown>)[key] = (...args: unknown[]) => {
      const methodResult = (value as (...params: unknown[]) => unknown)(...args);
      return captureBusinessExceptionResult(methodResult, raiseException);
    };
    return acc;
  }, {} as Insertions);
}
