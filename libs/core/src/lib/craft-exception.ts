export const CRAFT_EXCEPTION_SYMBOL = Symbol('CRAFT_EXCEPTION_SYMBOL');

export type CraftExceptionMeta<
  Code extends string = string,
  Scope extends string | undefined = string | undefined,
  Identifier extends string | undefined = string | undefined,
> = {
  code: Code;
  scope: Scope;
  identifier?: Identifier;
};

export type CraftExceptionResult<
  Meta extends CraftExceptionMeta,
  Payload = unknown,
> = {
  readonly [CRAFT_EXCEPTION_SYMBOL]: true;
  readonly payload: Payload;
} & Meta & {
    [key in Meta['code']]: Payload;
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
    code: Code;
    scope?: Scope;
    identifier?: Identifier;
  },
  payload?: Payload,
): CraftExceptionResult<
  {
    code: Code;
    scope: Scope;
    identifier?: Identifier;
  },
  Payload
> {
  return {
    [CRAFT_EXCEPTION_SYMBOL]: true,
    ...meta,
    payload: payload as Payload,
  };
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
            code: CraftExceptionMeta['code'];
            scope: Scope;
          },
          Payload
        >
      : [Identifier] extends [string]
        ? CraftExceptionResult<
            {
              code: CraftExceptionMeta['code'];
              scope: Scope;
              identifier: Identifier;
            },
            Payload
          >
        : CraftExceptionResult<
            {
              code: CraftExceptionMeta['code'];
              scope: Scope;
            },
            Payload
          >
    : Exception;
