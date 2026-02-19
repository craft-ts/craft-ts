import { isSignal, Signal, signal } from '@angular/core';

export const BUSINESS_EXCEPTION_SCOPES = [
  'state',
  'loader',
  'method',
  'reactionInsertion',
  'params',
  'computedInsertion',
  'methodInsertion',
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
  identifier?: string;
}>;

export type StateException<Code extends string = string, Payload = unknown> =
  BusinessException<'state', Code, Payload>;

export type MethodException<Code extends string = string, Payload = unknown> =
  BusinessException<'method', Code, Payload>;

export type ReactionInsertionException<
  Code extends string = string,
  Payload = unknown,
> = BusinessException<'reactionInsertion', Code, Payload>;

export type ParamException<Code extends string = string, Payload = unknown> =
  BusinessException<'params', Code, Payload>;

export type LoaderException<Code extends string = string, Payload = unknown> =
  BusinessException<'loader', Code, Payload>;

export type ComputedInsertionException<
  Code extends string = string,
  Payload = unknown,
> = BusinessException<'computedInsertion', Code, Payload>;

export type MethodInsertionException<
  Code extends string = string,
  Payload = unknown,
> = BusinessException<'methodInsertion', Code, Payload>;

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
  ReactionInsertionExceptions extends ReactionInsertionException = never,
  ParamsExceptions extends ParamException = never,
> = {
  state: ScopePayloadByCode<StateExceptions>;
  method: ScopePayloadByCode<MethodExceptions>;
  reactionInsertion: ScopePayloadByCode<ReactionInsertionExceptions>;
  params: ScopePayloadByCode<ParamsExceptions>;
};

export type BusinessExceptionListItem<
  Scope extends BusinessExceptionScope = BusinessExceptionScope,
  Code extends string = string,
  Payload = unknown,
> = Readonly<{
  id: string;
  scope: Scope;
  code: Code;
  payload: Payload;
  identifier?: string;
  updatedAt: number;
}>;

export type BusinessExceptionList = Array<BusinessExceptionListItem>;

export type BusinessExceptionListContainer = {
  list: BusinessExceptionList;
};

export type AnyGroupedBusinessExceptions = GroupedBusinessExceptions<
  StateException<string, unknown>,
  MethodException<string, unknown>,
  ReactionInsertionException<string, unknown>,
  ParamException<string, unknown>
> & {
  loader: Record<string, unknown>;
  computedInsertion: Record<string, unknown>;
  methodInsertion: Record<string, unknown>;
};

export const EMPTY_GROUPED_BUSINESS_EXCEPTIONS: AnyGroupedBusinessExceptions = {
  state: {},
  method: {},
  reactionInsertion: {},
  params: {},
  loader: {},
  computedInsertion: {},
  methodInsertion: {},
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
    (candidate.identifier === undefined ||
      typeof candidate.identifier === 'string') &&
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
  identifier?: string,
): BusinessException<Scope, Code, Payload> {
  return {
    scope,
    code,
    payload: payload as Payload,
    identifier,
  };
}

export function stateException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
  identifier?: string,
): StateException<Code, Payload> {
  return createException('state', code, payload, identifier);
}

export function methodException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
  identifier?: string,
): MethodException<Code, Payload> {
  return createException('method', code, payload, identifier);
}

/**
 * @deprecated Use `methodException` instead.
 */
export function craftException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
  identifier?: string,
): MethodException<Code, Payload>;
export function craftException<Code extends string, Payload = undefined>(
  config: {
    code: Code;
    identifier?: string;
  },
  payload?: Payload,
): MethodException<Code, Payload>;
export function craftException<Code extends string, Payload = undefined>(
  codeOrConfig:
    | Code
    | {
        code: Code;
        identifier?: string;
      },
  payload?: Payload,
  identifier?: string,
): MethodException<Code, Payload> {
  if (typeof codeOrConfig === 'object') {
    return createException(
      'method',
      codeOrConfig.code,
      payload,
      codeOrConfig.identifier,
    ) as MethodException<Code, Payload>;
  }
  return createException('method', codeOrConfig, payload, identifier);
}

export function reactionInsertionException<
  Code extends string,
  Payload = undefined,
>(
  code: Code,
  payload?: Payload,
  identifier?: string,
): ReactionInsertionException<Code, Payload> {
  return createException('reactionInsertion', code, payload, identifier);
}

export function paramException<Code extends string, Payload = undefined>(
  code: Code,
  payload?: Payload,
  identifier?: string,
): ParamException<Code, Payload> {
  return createException('params', code, payload, identifier);
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

export function withReactionInsertionExceptions<
  Value,
  Definitions extends Record<string, unknown>,
>(
  value: Value,
  definitions: Definitions,
): Value &
  ExceptionCarrier<
    ExceptionDefinitionsToUnion<'reactionInsertion', Definitions>
  > {
  return value as Value &
    ExceptionCarrier<
      ExceptionDefinitionsToUnion<'reactionInsertion', Definitions>
    >;
}

type AnySignal = Signal<unknown>;
type AnyFn = (...args: any[]) => unknown;

export type ExtractBusinessExceptionsFromValue<Value> =
  | ExtractExceptionCarrier<Value>
  | Extract<Value, AnyBusinessException>
  | (Value extends {
      readonly __reactionInsertionExceptions__?: infer Exceptions;
    }
      ? Extract<Exceptions, ReactionInsertionException>
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

export type ExtractReactionInsertionExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  ReactionInsertionException
>;

export type ExtractParamExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  ParamException
>;

export type ExtractLoaderExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  LoaderException
>;

export type ExtractComputedInsertionExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  ComputedInsertionException
>;

export type ExtractMethodInsertionExceptions<Value> = Extract<
  ExtractBusinessExceptionsFromValue<Value>,
  MethodInsertionException
>;

function sortRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.keys(record)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      (acc as Record<string, unknown>)[key] = record[key];
      return acc;
    }, {} as T);
}

const IDENTIFIER_KEY_SEPARATOR = '::';

function toScopeRecordKey(code: string, identifier?: string): string {
  if (!identifier) {
    return code;
  }
  return `${encodeURIComponent(identifier)}${IDENTIFIER_KEY_SEPARATOR}${code}`;
}

function toExceptionId(
  scope: BusinessExceptionScope,
  code: string,
  identifier?: string,
): string {
  return identifier ? `${scope}:${identifier}:${code}` : `${scope}:${code}`;
}

function sortExceptionList(list: BusinessExceptionList): BusinessExceptionList {
  return [...list].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) {
      return a.id.localeCompare(b.id);
    }
    return b.updatedAt - a.updatedAt;
  });
}

function createExceptionList(
  groupedExceptions: AnyGroupedBusinessExceptions,
): BusinessExceptionList {
  return sortExceptionList(
    BUSINESS_EXCEPTION_SCOPES.flatMap((scope) =>
      Object.entries(groupedExceptions[scope]).map(([code, payload]) => ({
        id: toExceptionId(scope, code),
        scope,
        code,
        payload,
        updatedAt: 0,
      })),
    ),
  );
}

export function sortGroupedBusinessExceptions<
  GroupedExceptions extends AnyGroupedBusinessExceptions,
>(exceptions: GroupedExceptions): GroupedExceptions {
  return {
    state: sortRecord(exceptions.state),
    method: sortRecord(exceptions.method),
    reactionInsertion: sortRecord(exceptions.reactionInsertion),
    params: sortRecord(exceptions.params),
    loader: sortRecord(exceptions.loader),
    computedInsertion: sortRecord(exceptions.computedInsertion),
    methodInsertion: sortRecord(exceptions.methodInsertion),
  } as GroupedExceptions;
}

function toGroupedBusinessExceptions(
  exceptions?: Partial<AnyGroupedBusinessExceptions>,
): AnyGroupedBusinessExceptions {
  return sortGroupedBusinessExceptions({
    state: { ...(exceptions?.state ?? {}) },
    method: { ...(exceptions?.method ?? {}) },
    reactionInsertion: { ...(exceptions?.reactionInsertion ?? {}) },
    params: { ...(exceptions?.params ?? {}) },
    loader: { ...(exceptions?.loader ?? {}) },
    computedInsertion: { ...(exceptions?.computedInsertion ?? {}) },
    methodInsertion: { ...(exceptions?.methodInsertion ?? {}) },
  } as AnyGroupedBusinessExceptions);
}

export type BusinessExceptionStore<
  GroupedExceptions extends Record<string, Record<string, unknown>> = AnyGroupedBusinessExceptions,
> = {
  readonly exceptions: Signal<GroupedExceptions>;
  hasException: () => boolean;
  raiseException: <Exception extends AnyBusinessException>(
    exception: Exception,
  ) => Exception;
  setScopeExceptions: (
    scope: BusinessExceptionScope,
    values: Record<string, unknown>,
  ) => void;
  clearException: (
    scope: BusinessExceptionScope,
    code: string,
    identifier?: string,
  ) => void;
  clearScope: (scope: BusinessExceptionScope) => void;
  clearAll: () => void;
};

export function createBusinessExceptionStore<
  GroupedExceptions extends Record<string, Record<string, unknown>> = AnyGroupedBusinessExceptions,
>(
  initialExceptions?: Partial<AnyGroupedBusinessExceptions>,
): BusinessExceptionStore<GroupedExceptions> {
  const groupedInitialExceptions = toGroupedBusinessExceptions(initialExceptions);
  const exceptionsSignal = signal<
    AnyGroupedBusinessExceptions & BusinessExceptionListContainer
  >({
    ...groupedInitialExceptions,
    list: createExceptionList(groupedInitialExceptions),
  });
  let lastUpdatedAt = Date.now();
  const nextUpdatedAt = () => {
    const now = Date.now();
    lastUpdatedAt = now > lastUpdatedAt ? now : lastUpdatedAt + 1;
    return lastUpdatedAt;
  };
  const hasException = () => exceptionsSignal().list.length > 0;

  const raiseException = <Exception extends AnyBusinessException>(
    exception: Exception,
  ) => {
    exceptionsSignal.update((current) => {
      const currentScope = current[exception.scope] as Record<string, unknown>;
      const scopeRecordKey = toScopeRecordKey(
        exception.code,
        exception.identifier,
      );
      const id = toExceptionId(
        exception.scope,
        exception.code,
        exception.identifier,
      );
      return {
        ...current,
        [exception.scope]: sortRecord({
          ...currentScope,
          [scopeRecordKey]: exception.payload,
        }),
        list: sortExceptionList([
          {
            id,
            scope: exception.scope,
            code: exception.code,
            payload: exception.payload,
            identifier: exception.identifier,
            updatedAt: nextUpdatedAt(),
          },
          ...current.list.filter((item) => item.id !== id),
        ]),
      };
    });
    return exception;
  };

  const setScopeExceptions = (
    scope: BusinessExceptionScope,
    values: Record<string, unknown>,
  ) => {
    exceptionsSignal.update((current) => {
      const nextScopeValues = sortRecord({ ...values });
      const currentScopeList = current.list.filter((item) => item.scope === scope);
      const currentScopeListById = new Map(
        currentScopeList.map((item) => [item.id, item]),
      );
      const nextScopeList = Object.entries(nextScopeValues).map(
        ([code, payload]) => {
          const id = toExceptionId(scope, code);
          const existing = currentScopeListById.get(id);
          if (existing) {
            return {
              ...existing,
              payload,
            };
          }
          return {
            id,
            scope,
            code,
            payload,
            updatedAt: nextUpdatedAt(),
          };
        },
      );
      return {
        ...current,
        [scope]: nextScopeValues,
        list: sortExceptionList([
          ...current.list.filter((item) => item.scope !== scope),
          ...nextScopeList,
        ]),
      };
    });
  };

  const clearException = (
    scope: BusinessExceptionScope,
    code: string,
    identifier?: string,
  ) => {
    exceptionsSignal.update((current) => {
      const currentScope = current[scope] as Record<string, unknown>;
      const scopeRecordKey = toScopeRecordKey(code, identifier);
      const { [scopeRecordKey]: _removed, ...rest } = currentScope;
      const id = toExceptionId(scope, code, identifier);
      return {
        ...current,
        [scope]: sortRecord(rest),
        list: current.list.filter((item) => item.id !== id),
      };
    });
  };

  const clearScope = (scope: BusinessExceptionScope) => {
    exceptionsSignal.update((current) => ({
      ...current,
      [scope]: {},
      list: current.list.filter((item) => item.scope !== scope),
    }));
  };

  const clearAll = () => {
    exceptionsSignal.set({
      state: {},
      method: {},
      reactionInsertion: {},
      params: {},
      loader: {},
      computedInsertion: {},
      methodInsertion: {},
      list: [],
    });
  };

  return {
    exceptions: exceptionsSignal as unknown as Signal<GroupedExceptions>,
    hasException,
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
  options?: {
    clearExceptionOnSuccess?: (key: string, previousExceptionCode: string) => void;
  },
): Insertions {
  return Object.entries(insertions).reduce((acc, [key, value]) => {
    if (typeof value !== 'function' || isSignal(value)) {
      (acc as Record<string, unknown>)[key] = value;
      return acc;
    }

    let previousExceptionCode: string | undefined;
    (acc as Record<string, unknown>)[key] = (...args: unknown[]) => {
      const methodResult = (value as (...params: unknown[]) => unknown)(...args);
      const handleMethodResult = <Result>(result: Result): Result => {
        if (isBusinessException(result)) {
          if (
            previousExceptionCode &&
            previousExceptionCode !== result.code
          ) {
            options?.clearExceptionOnSuccess?.(key, previousExceptionCode);
          }
          raiseException(result);
          previousExceptionCode = result.code;
          return result;
        }
        if (previousExceptionCode) {
          options?.clearExceptionOnSuccess?.(key, previousExceptionCode);
          previousExceptionCode = undefined;
        }
        return result;
      };

      if (isPromiseLike(methodResult)) {
        return methodResult.then((resolvedValue) =>
          handleMethodResult(resolvedValue),
        ) as unknown;
      }

      return handleMethodResult(methodResult);
    };
    return acc;
  }, {} as Insertions);
}
