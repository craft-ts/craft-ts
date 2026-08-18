export const CRAFT_EXCEPTION_SYMBOL = Symbol('CRAFT_EXCEPTION_SYMBOL');

export type CraftExceptionMeta<
  Code extends string = string,
  Scope extends string | undefined = string | undefined,
  Identifier extends string | undefined = string | undefined,
> = {
  _tag: Code;
  scope?: Scope;
  identifier?: Identifier;
};

export type CraftExceptionResult<
  Meta extends CraftExceptionMeta,
  Payload = unknown,
> = {
  readonly [CRAFT_EXCEPTION_SYMBOL]: true;
  readonly payload: Payload;
} & Meta & {
    [key in Meta['_tag']]: Payload;
  };

export type CraftException<
  Meta extends CraftExceptionMeta = CraftExceptionMeta,
  Payload = unknown,
> = CraftExceptionResult<Meta, Payload>;

export type AnyCraftException = CraftExceptionResult<
  CraftExceptionMeta,
  unknown
>;

export function craftException<
  const Code extends string,
  Scope extends string | undefined = undefined,
  Identifier extends string | undefined = undefined,
  Payload = undefined,
>(
  meta: {
    _tag: Code;
    scope?: Scope;
    identifier?: Identifier;
  },
  payload?: Payload,
): CraftExceptionResult<
  {
    _tag: Code;
    scope: Scope;
    identifier?: Identifier;
  },
  Payload
> {
  const result = {
    [CRAFT_EXCEPTION_SYMBOL]: true as const,
    _tag: meta._tag,
    scope: meta.scope as Scope,
    ...(meta.identifier !== undefined ? { identifier: meta.identifier } : {}),
    payload: payload as Payload,
    [meta._tag]: payload as Payload,
  };

  return result as CraftExceptionResult<
    {
      _tag: Code;
      scope: Scope;
      identifier?: Identifier;
    },
    Payload
  >;
}

export function isCraftException(value: unknown): value is AnyCraftException {
  return (
    !!value && typeof value === 'object' && CRAFT_EXCEPTION_SYMBOL in value
  );
}

export type StripCraftException<T> = Exclude<T, AnyCraftException>;
export type ExtractCraftException<T> = Extract<T, AnyCraftException>;

export type InsertMetaInCraftExceptionIfExists<
  Exception,
  Scope extends string | undefined,
  Identifier extends string | undefined | unknown,
> =
  Exception extends CraftExceptionResult<
    infer CraftExceptionMeta,
    infer Payload
  >
    ? [unknown] extends [Identifier]
      ? CraftExceptionResult<
          {
            _tag: CraftExceptionMeta['_tag'];
            scope: Scope;
          },
          Payload
        >
      : [Identifier] extends [string]
        ? CraftExceptionResult<
            {
              _tag: CraftExceptionMeta['_tag'];
              scope: Scope;
              identifier: Identifier;
            },
            Payload
          >
        : CraftExceptionResult<
            {
              _tag: CraftExceptionMeta['_tag'];
              scope: Scope;
            },
            Payload
          >
    : Exception;

export type ExtractCodeFromCraftResultUnion<T> =
  T extends CraftExceptionResult<infer E, any> ? E['_tag'] : never;

export type ExcludeByCode<T, C> =
  T extends CraftExceptionResult<infer E, any>
    ? E['_tag'] extends C
      ? never
      : T
    : never;
