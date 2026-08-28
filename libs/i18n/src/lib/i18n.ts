/*
 * The catalogue stays a plain TypeScript value.  The CraftTS integration is
 * type-only here: DI-aware tokens yield Craft service requests while the
 * catalogue remains declarative.
 */

import type {
  ComponentDepsCarrier,
  ServiceDependencyMapFromYielded,
  StandardSchemaV1,
} from '@craft-ts/core';

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type FormatterContext = {
  readonly locale: string;
  readonly timeZone?: string;
};
export type TokenFormatter<Value> = ((value: Value, context: FormatterContext) => string) & {
  readonly id?: string;
};
/**
 * A Standard Schema — the very contract `state`, `query`, `mutation` and forms
 * already accept, so a Zod / Valibot / ArkType schema written for the rest of
 * the application is usable as-is on a token.
 *
 * `Output` is what the formatter receives, `Input` is what the call site
 * passes: a schema is allowed to **parse**, not only to validate, which is how
 * `'2026-08-25'` reaches a date token and comes out as a `Date`.
 */
export type TokenSchema<Output = unknown, Input = unknown> = StandardSchemaV1<
  Input,
  Output
>;

type SchemaTypes<Schema> = Schema extends {
  readonly '~standard': { readonly types?: infer Types };
}
  ? Types
  : never;

/** What a call site must pass for a token declared with `Schema`. */
export type TokenSchemaInput<Schema> =
  NonNullable<SchemaTypes<Schema>> extends { readonly input: infer Input }
    ? Input
    : never;

/** What the formatter receives for a token declared with `Schema`. */
export type TokenSchemaOutput<Schema> =
  NonNullable<SchemaTypes<Schema>> extends { readonly output: infer Output }
    ? Output
    : never;

export type TokenValueAdapter<Value> =
  | TokenSchema<Value>
  | {
      readonly validate?: (value: unknown) => value is Value;
      readonly name?: string;
    }
  | ((value: unknown) => value is Value);

export type CraftI18nOptionsFactory<Options, Yielded = unknown> = () => Generator<
  Yielded,
  Options,
  unknown
>;

type FactoryYielded<Factory> = Factory extends (...args: any[]) => infer Result
  ? Result extends Generator<infer Yielded, any, any>
    ? Yielded
    : never
  : never;

type DependenciesOfFactory<Factory> = ServiceDependencyMapFromYielded<
  FactoryYielded<Factory>
>;

type TranslationReader<Dependencies extends object> = (() => Generator<
  unknown,
  string,
  unknown
>) & ComponentDepsCarrier<Dependencies>;

export type I18nToken<
  Name extends string = string,
  Value = unknown,
  Kind extends string = string,
  Dependencies extends object = Record<never, never>,
  Input = Value,
> = {
  readonly __i18nToken: true;
  readonly name: Name;
  readonly kind: Kind;
  readonly tokenId: string;
  readonly validate?: (value: unknown) => value is Value;
  /**
   * Set when the token was declared with a schema. It runs before the
   * formatter, so the value the formatter sees is the parsed one — and it is
   * also what makes `Input` differ from `Value`.
   */
  readonly parse?: (value: Input) => Value;
  readonly format: TokenFormatter<Value>;
  readonly resolveFormatter?: () => Generator<
    unknown,
    TokenFormatter<Value>,
    unknown
  >;
  readonly dependencies?: Dependencies;
};

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};
type UnionToIntersection<T> =
  (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
    ? I
    : never;
type TokenParams<T> = T extends I18nToken<
  infer Name,
  any,
  infer _Kind,
  any,
  infer Input
>
  ? { [Key in Name]: Input }
  : Record<never, never>;
type TokenDependencies<T> = T extends I18nToken<
  any,
  any,
  any,
  infer Dependencies extends object
>
  ? Dependencies
  : Record<never, never>;
type ParamsFromTokens<T extends readonly unknown[]> = Simplify<
  UnionToIntersection<TokenParams<T[number]>>
>;
type DependenciesFromTokens<T extends readonly unknown[]> = Simplify<
  UnionToIntersection<TokenDependencies<T[number]>>
>;
type MessageDependencies<T> = T extends Message<any, infer Dependencies extends object>
  ? Dependencies
  : T extends PluralMessage<any, any, any, infer Dependencies extends object>
    ? Dependencies
    : Record<never, never>;
type DependenciesFromMessages<T> = Simplify<
  UnionToIntersection<MessageDependencies<T>>
>;

export type Message<
  Params = Record<never, never>,
  Dependencies extends object = Record<never, never>,
> = {
  readonly kind: 'message';
  // The erased token union is intentionally bivariant; concrete tokens keep their value type in Params.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly parts: readonly (string | I18nToken<string, any, string>)[];
  readonly params: Params;
  readonly dependencies?: Dependencies;
};

/**
 * The selector token's own dependencies are deliberately absent: `renderNode`
 * only reads the count to pick a category, it never runs the selector's
 * formatter. A DI-aware token used as a selector *and* rendered inside a branch
 * contributes through that branch, which is the path that actually resolves it.
 */
export type PluralMessage<
  CountName extends string = string,
  CountValue extends number = number,
  Branches extends Partial<Record<PluralCategory, Message<unknown>>> = Partial<Record<PluralCategory, Message<unknown>>>,
  Dependencies extends object = DependenciesFromMessages<Branches[keyof Branches]>,
  CountInput = CountValue,
> = {
  readonly kind: 'plural';
  readonly count: I18nToken<CountName, CountValue, string, any, CountInput>;
  readonly branches: Branches;
  readonly params: Simplify<
    { [Key in CountName]: CountInput } &
      (Branches[keyof Branches] extends Message<infer Params> ? Params : Record<never, never>)
  >;
  readonly dependencies?: Simplify<
    Dependencies
  >;
};

export type CatalogNode = Message | PluralMessage | { readonly [key: string]: CatalogNode };
export type Catalog = { readonly [key: string]: CatalogNode };

function isMessage(value: unknown): value is Message<unknown> {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'message';
}

function isPlural(value: unknown): value is PluralMessage {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'plural';
}

function isParamsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function paramsRecord(value: unknown): Record<string, unknown> {
  return isParamsRecord(value) ? value : {};
}

export function defineCatalog<const T extends Catalog>(catalog: T): T {
  return catalog;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function msg<const Parts extends readonly I18nToken<string, any, string>[]>(
  strings: TemplateStringsArray,
  ...tokens: Parts
): Message<ParamsFromTokens<Parts>, DependenciesFromTokens<Parts>> {
  const parts: (string | I18nToken)[] = [];
  for (let index = 0; index < strings.length; index += 1) {
    const text = strings[index];
    if (text) parts.push(text);
    const token = tokens[index];
    if (token) parts.push(token);
  }
  return {
    kind: 'message',
    parts,
    params: undefined as unknown as ParamsFromTokens<Parts>,
    dependencies: undefined as unknown as DependenciesFromTokens<Parts>,
  };
}

export type PluralBranches = Partial<Record<PluralCategory, Message<unknown>>> &
  Pick<Record<PluralCategory, Message<unknown>>, 'other'>;

export function plural<
  CountName extends string,
  CountValue extends number,
  const Branches extends PluralBranches,
  CountInput = CountValue,
>(
  count: I18nToken<CountName, CountValue, string, any, CountInput>,
  branches: Branches,
): PluralMessage<
  CountName,
  CountValue,
  Branches,
  DependenciesFromMessages<Branches[keyof Branches]>,
  CountInput
> {
  return {
    kind: 'plural',
    count,
    branches,
    params: undefined as unknown as PluralMessage<
      CountName,
      CountValue,
      Branches,
      DependenciesFromMessages<Branches[keyof Branches]>,
      CountInput
    >['params'],
    dependencies: undefined as unknown as PluralMessage<
      CountName,
      CountValue,
      Branches
    >['dependencies'],
  };
}

type TokenDefinitionBase<
  Name extends string,
  Value,
  Kind extends string,
  Schema,
> = {
  readonly name: Name;
  readonly kind: Kind;
  readonly tokenId?: string;
  readonly validate?: (value: unknown) => value is Value;
  /**
   * A Standard Schema for the parameter. It replaces `validate` and, unlike a
   * type guard, it may parse: the formatter receives the schema's output.
   */
  readonly schema?: Schema;
};

/**
 * A token formats through exactly one of the two: `format` when the formatter
 * is known when the catalogue is written, `resolveFormatter` when it is built
 * from the injector at render time. Both renderers prefer the resolver
 * whenever it is present, so requiring `format` beside it would only ask for
 * code that never runs.
 */
export type TokenDefinition<
  Name extends string,
  Value,
  Kind extends string = string,
  Resolver extends (...args: any[]) => Generator<any, TokenFormatter<Value>, any> = never,
  Schema extends TokenSchema<Value> | undefined = undefined,
> = TokenDefinitionBase<Name, Value, Kind, Schema> &
  (
    | {
        readonly format: TokenFormatter<Value>;
        readonly resolveFormatter?: Resolver;
      }
    | {
        readonly format?: TokenFormatter<Value>;
        readonly resolveFormatter: Resolver;
      }
  );

type DependenciesOfResolver<Resolver> = Resolver extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? ServiceDependencyMapFromYielded<Yielded>
  : Record<never, never>;

type TokenInputOf<Schema, Value> = [Schema] extends [undefined]
  ? Value
  : [TokenSchemaInput<Schema>] extends [never]
    ? Value
    : TokenSchemaInput<Schema>;

type TokenOptionsFactory<Options> = () => Generator<any, Options, unknown>;

function isTokenSchema(value: unknown): value is TokenSchema<unknown> {
  return typeof value === 'object' && value !== null && '~standard' in value;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Turns a Standard Schema into the token's `parse`. A translation is rendered
 * synchronously, so an asynchronous schema is a defect rather than something to
 * await: the message would have to be split in two to accommodate it.
 */
function schemaParser<Value>(
  schema: TokenSchema<Value>,
  name: string,
): (value: unknown) => Value {
  return (value: unknown): Value => {
    const result = schema['~standard'].validate(value);
    if (isPromiseLike(result)) {
      throw new I18nRuntimeError(
        'ASYNC_SCHEMA',
        `The schema of parameter ${name} is asynchronous; a translation is rendered synchronously.`,
      );
    }
    if (result.issues) {
      throw new I18nRuntimeError(
        'INVALID_PARAM',
        `Invalid parameter ${name}: ${result.issues.map((issue) => issue.message).join(', ')}`,
      );
    }
    return result.value;
  };
}

// Overloaded rather than one signature over the union: with no `format` to
// infer `Value` from, it has to be read from what the resolver returns.
export function defineToken<
  Name extends string,
  Value,
  Kind extends string = string,
  Resolver extends (...args: any[]) => Generator<any, TokenFormatter<Value>, any> = never,
  Schema extends TokenSchema<Value> | undefined = undefined,
>(
  definition: TokenDefinitionBase<Name, Value, Kind, Schema> & {
    readonly format: TokenFormatter<Value>;
    readonly resolveFormatter?: Resolver;
  },
): I18nToken<
  Name,
  Value,
  Kind,
  DependenciesOfResolver<Resolver>,
  TokenInputOf<Schema, Value>
>;
export function defineToken<
  Name extends string,
  Value,
  Kind extends string = string,
  Yielded = never,
  Schema extends TokenSchema<Value> | undefined = undefined,
>(
  definition: TokenDefinitionBase<Name, Value, Kind, Schema> & {
    readonly format?: undefined;
    // The bare call signature rather than `TokenFormatter<Value>`: `Value` has
    // no other inference site here, and inference does not reach through the
    // intersection that carries the formatter's `id`.
    readonly resolveFormatter: () => Generator<
      Yielded,
      (value: Value, context: FormatterContext) => string,
      unknown
    >;
  },
): I18nToken<
  Name,
  Value,
  Kind,
  ServiceDependencyMapFromYielded<Yielded>,
  TokenInputOf<Schema, Value>
>;
export function defineToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: TokenDefinition<string, any, string, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): I18nToken<string, any, string, any, any> {
  return {
    __i18nToken: true,
    name: definition.name,
    kind: definition.kind,
    tokenId: definition.tokenId ?? `app.${definition.kind}`,
    validate: definition.validate,
    // Unreachable through either renderer — they both take the resolver first.
    // It exists so the token keeps one formatter-shaped member for anything
    // that reads a catalogue without rendering it.
    format:
      definition.format ??
      (() => {
        throw new I18nRuntimeError(
          'CRAFT_INJECTION_REQUIRED',
          `Token ${definition.name} is formatted by its resolver; it has no standalone formatter.`,
        );
      }),
    parse: definition.schema
      ? schemaParser(definition.schema, definition.name)
      : undefined,
    resolveFormatter: definition.resolveFormatter,
    dependencies: undefined,
  };
}

/**
 * A value guard receives the value, so it declares at least one parameter. A
 * zero-argument function in that position is an options factory that was
 * written as an arrow instead of a `function*`: accepting it silently would
 * install it as the guard and format with the default options.
 */
function assertTokenAdapter<Value>(
  adapter: TokenValueAdapter<Value> | TokenOptionsFactory<unknown> | undefined,
  name: string,
): TokenValueAdapter<Value> | undefined {
  if (typeof adapter === 'function' && adapter.length === 0) {
    throw new I18nRuntimeError(
      'INVALID_TOKEN_ADAPTER',
      `Token ${name} received a zero-argument function where a value guard, a schema or a generator function was expected. A DI-aware token must be declared with \`function* () { ... }\`.`,
    );
  }
  return adapter as TokenValueAdapter<Value> | undefined;
}

/**
 * The three ways to declare a token of a given kind. Named rather than inferred
 * so a shipped factory (`number`, `money`, …) keeps a declaration that can be
 * emitted without expanding the Craft service markers it refers to.
 */
export interface TokenFactory<Kind extends string, Value, Options> {
  // The DI form: the options are produced by a Craft generator, so the services
  // it yields become part of the token's — and then the message's — contract.
  <Name extends string, Factory extends TokenOptionsFactory<Options>>(
    name: Name,
    optionsFactory: Factory,
  ): I18nToken<Name, Value, Kind, DependenciesOfFactory<Factory>>;
  // The schema form: the call site passes the schema's input, the formatter
  // receives its output.
  <Name extends string, Schema extends TokenSchema<Value>>(
    name: Name,
    schema: Schema,
    options?: Options,
  ): I18nToken<
    Name,
    Value,
    Kind,
    Record<never, never>,
    TokenInputOf<Schema, Value>
  >;
  <Name extends string>(
    name: Name,
    adapter?: TokenValueAdapter<Value>,
    options?: Options,
  ): I18nToken<Name, Value, Kind>;
}

export function defineTokenFactory<Kind extends string, Value, Options = undefined>(definition: {
  readonly kind: Kind;
  readonly tokenId?: string;
  readonly format: (options: Options | undefined) => TokenFormatter<Value>;
}): TokenFactory<Kind, Value, Options> {
  function create(
    name: string,
    adapterOrOptionsFactory?: TokenValueAdapter<Value> | TokenOptionsFactory<Options>,
    options?: Options,
  ): I18nToken<string, Value, Kind> {
    if (isGeneratorFunction(adapterOrOptionsFactory)) {
      const optionsFactory = adapterOrOptionsFactory as TokenOptionsFactory<Options>;
      return defineToken({
        name,
        kind: definition.kind,
        tokenId: definition.tokenId,
        format: definition.format(options),
        resolveFormatter: function* () {
          return definition.format(yield* optionsFactory());
        },
      }) as I18nToken<string, Value, Kind>;
    }

    const adapter = assertTokenAdapter(adapterOrOptionsFactory, name);
    return defineToken({
      name,
      kind: definition.kind,
      tokenId: definition.tokenId,
      schema: isTokenSchema(adapter)
        ? (adapter as TokenSchema<Value>)
        : undefined,
      validate: isTokenSchema(adapter)
        ? undefined
        : typeof adapter === 'function'
          ? adapter
          : adapter?.validate,
      format: definition.format(options),
    }) as I18nToken<string, Value, Kind>;
  }

  return create as TokenFactory<Kind, Value, Options>;
}

export type NumberFormatterOptions = Intl.NumberFormatOptions & {
  readonly timeZone?: never;
};
export type DateFormatterOptions = Intl.DateTimeFormatOptions;
export type RelativeTimeFormatterOptions = {
  readonly unit?: Intl.RelativeTimeFormatUnit;
  readonly numeric?: 'always' | 'auto';
};

function numberFormat(options: Intl.NumberFormatOptions = {}): TokenFormatter<number> {
  const formatter = ((value: number, context: FormatterContext) => {
    if (!Number.isFinite(value)) throw new I18nRuntimeError('INVALID_NUMBER', 'Cannot format a non-finite number.');
    return new Intl.NumberFormat(context.locale, options).format(value);
  }) as unknown as TokenFormatter<number>;
  Object.defineProperty(formatter, 'id', { value: 'number', enumerable: true });
  return formatter;
}

function dateFormat(options: Intl.DateTimeFormatOptions = {}): TokenFormatter<Date | number> {
  const formatter = ((value: Date | number, context: FormatterContext) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new I18nRuntimeError('INVALID_DATE', 'Cannot format an invalid date.');
    return new Intl.DateTimeFormat(context.locale, { ...options, timeZone: context.timeZone ?? options.timeZone }).format(date);
  }) as unknown as TokenFormatter<Date | number>;
  Object.defineProperty(formatter, 'id', { value: 'date', enumerable: true });
  return formatter;
}

function relativeTimeFormat(options: RelativeTimeFormatterOptions = {}): TokenFormatter<number> {
  const formatter = ((value: number, context: FormatterContext) => {
    if (!Number.isFinite(value)) throw new I18nRuntimeError('INVALID_NUMBER', 'Cannot format a non-finite relative time.');
    return new Intl.RelativeTimeFormat(context.locale, {
      numeric: options.numeric ?? 'auto',
    }).format(value, options.unit ?? 'day');
  }) as unknown as TokenFormatter<number>;
  Object.defineProperty(formatter, 'id', { value: 'relative-time', enumerable: true });
  return formatter;
}

export const formatters = {
  number: numberFormat,
  integer: () => numberFormat({ maximumFractionDigits: 0 }),
  percent: (options: Intl.NumberFormatOptions = {}) => numberFormat({ style: 'percent', ...options }),
  compactNumber: (options: Intl.NumberFormatOptions = {}) => numberFormat({ notation: 'compact', ...options }),
  money: (currency = 'EUR', options: Intl.NumberFormatOptions = {}) =>
    numberFormat({ style: 'currency', currency, ...options }),
  dateShort: () => dateFormat({ dateStyle: 'short' }),
  dateLong: () => dateFormat({ dateStyle: 'long' }),
  dateTime: (options: Intl.DateTimeFormatOptions = {}) => dateFormat(options),
  relativeTime: relativeTimeFormat,
} as const;

export const number = defineTokenFactory({ kind: 'number', format: (options?: NumberFormatterOptions) => numberFormat(options) });
export const integer = defineTokenFactory({ kind: 'integer', format: () => formatters.integer() });
export const percent = defineTokenFactory({ kind: 'percent', format: (options?: NumberFormatterOptions) => formatters.percent(options) });
export const compactNumber = defineTokenFactory({ kind: 'compact-number', format: (options?: NumberFormatterOptions) => formatters.compactNumber(options) });
export type MoneyOptions = { readonly currency?: string } & NumberFormatterOptions;

type GeneratorFunction = (...args: never[]) => Generator<unknown, unknown, unknown>;

// Mirrors `isGeneratorFunction` in `@craft-ts/core`: the same two checks, kept
// local so the package still has no runtime import of core.
function isGeneratorFunction(value: unknown): value is GeneratorFunction {
  return (
    typeof value === 'function' &&
    (value.constructor?.name === 'GeneratorFunction' ||
      Object.prototype.toString.call(value) === '[object GeneratorFunction]')
  );
}

export const money = defineTokenFactory({
  kind: 'money',
  format: (options?: MoneyOptions) =>
    formatters.money(options?.currency ?? 'EUR', options),
});
export const dateShort = defineTokenFactory({ kind: 'date-short', format: () => formatters.dateShort() });
export const dateLong = defineTokenFactory({ kind: 'date-long', format: () => formatters.dateLong() });
export const dateTime = defineTokenFactory({ kind: 'date-time', format: (options?: DateFormatterOptions) => formatters.dateTime(options) });
export const relativeTime = defineTokenFactory({ kind: 'relative-time', format: (options?: RelativeTimeFormatterOptions) => formatters.relativeTime(options) });

const pluralCategoriesByLanguage = {
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  cy: ['zero', 'one', 'two', 'few', 'many', 'other'],
  ga: ['one', 'two', 'few', 'many', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  uk: ['one', 'few', 'many', 'other'],
  cs: ['one', 'few', 'many', 'other'],
  sk: ['one', 'few', 'many', 'other'],
  sl: ['one', 'two', 'few', 'other'],
  fr: ['one', 'other'],
  en: ['one', 'other'],
} as const;

export type RequiredPluralCategories<Locale extends string> =
  Lowercase<Locale> extends `${infer Language}-${string}`
    ? Language extends keyof typeof pluralCategoriesByLanguage
      ? (typeof pluralCategoriesByLanguage)[Language][number]
      : 'one' | 'other'
    : Lowercase<Locale> extends keyof typeof pluralCategoriesByLanguage
      ? (typeof pluralCategoriesByLanguage)[Lowercase<Locale>][number]
      : 'one' | 'other';

function requiredPluralCategories(locale: string): readonly PluralCategory[] {
  const language = locale.toLowerCase().split('-')[0] ?? locale.toLowerCase();
  return (pluralCategoriesByLanguage as Record<string, readonly PluralCategory[]>)[language] ?? new Intl.PluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[];
}

type KeysEqual<Left, Right> =
  Exclude<keyof Left, keyof Right> extends never
    ? Exclude<keyof Right, keyof Left> extends never ? true : false
    : false;
type MessageParams<T> = T extends Message<infer Params> ? Params : T extends PluralMessage ? T['params'] : never;
type ValidatePlural<Locale extends string, T> = T extends PluralMessage<infer _CountName, infer _CountValue, infer Branches>
  ? Exclude<RequiredPluralCategories<Locale>, keyof Branches> extends never
    ? T
    : never
  : T;
type ValidateCatalog<Locale extends string, T> = T extends PluralMessage
  ? ValidatePlural<Locale, T>
  : T extends Message
    ? T
    : T extends object
      ? { [Key in keyof T]: ValidateCatalog<Locale, T[Key]> }
      : T;
type CompatibleCatalog<Locale extends string, Actual, Expected> =
  Actual extends Message | PluralMessage
    ? Expected extends Message | PluralMessage
      ? [ValidatePlural<Locale, Actual>] extends [never]
        ? never
        : KeysEqual<MessageParams<Actual>, MessageParams<Expected>> extends true ? Actual : never
      : never
    : Actual extends object
      ? Expected extends object
        ? KeysEqual<Actual, Expected> extends true
          ? { [Key in keyof Actual]: CompatibleCatalog<Locale, Actual[Key], Key extends keyof Expected ? Expected[Key] : never> }
          : never
        : never
      : never;

export type LocaleDefinition<Id extends string = string, T extends Catalog = Catalog> = {
  readonly id: Id;
  readonly catalog: T;
};
export type LocaleId<T> = T extends LocaleDefinition<infer Id, Catalog> ? Id : string;

export function defineLocale<const Id extends string, const T extends Catalog>(
  id: Id,
  catalog: T & ValidateCatalog<Id, T>,
): LocaleDefinition<Id, T> {
  // Asserts rather than validates: `validateCatalog` only *returns*
  // diagnostics, so calling it here computed the answer and dropped it. The
  // type-level check covers a catalogue written by hand; this one covers the
  // rest — a catalogue built dynamically, deserialised, or cast.
  assertValidCatalog(catalog, id);
  return { id, catalog };
}

export function defineLocaleLike<
  const Reference extends LocaleDefinition,
  const Id extends string,
  const T extends Catalog,
>(
  _reference: Reference,
  id: Id,
  catalog: T & CompatibleCatalog<Id, T, Reference['catalog']>,
): LocaleDefinition<Id, T> {
  assertValidCatalog(catalog, id);
  assertLocaleParity(_reference.catalog, catalog);
  return { id, catalog };
}

type CatalogOf<T> = T extends LocaleDefinition<string, infer CatalogValue> ? CatalogValue : T;
type CatalogKeys<T, Prefix extends string = ''> = {
  [Key in keyof T & string]: T[Key] extends Message | PluralMessage
    ? `${Prefix}${Key}`
    : T[Key] extends object
      ? CatalogKeys<T[Key], `${Prefix}${Key}.`>
      : never;
}[keyof T & string];
export type TranslationKey<C> = CatalogKeys<CatalogOf<C>>;

type NodeAtPath<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T ? NodeAtPath<T[Head], Tail> : never
  : Path extends keyof T ? T[Path] : never;
export type TranslationParams<C, Key extends string> = MessageParams<NodeAtPath<CatalogOf<C>, Key>>;

type TranslationNodeDependencies<Node> = Node extends Message<
  any,
  infer Dependencies extends object
>
  ? Dependencies
  : Node extends PluralMessage<any, any, any, infer Dependencies extends object>
    ? Dependencies
    : Record<never, never>;

export type TranslationDependencies<C, Key extends string> =
  TranslationNodeDependencies<NodeAtPath<CatalogOf<C>, Key>>;

/**
 * The keys `t` can render on its own: those whose formatting resolves no Craft
 * service. A key that does needs the injection context of a bound translator,
 * so it is rejected here at compile time rather than at the first render.
 */
export type StaticTranslationKey<C> = {
  [Key in TranslationKey<C>]: [
    keyof TranslationDependencies<C, Key & string>,
  ] extends [never]
    ? Key
    : never;
}[TranslationKey<C>];

export type TranslationParamsArgument<Params> = keyof Params extends never
  ? [params?: Params]
  : [params: Params];

export type CatalogDiagnostic = {
  readonly code: 'MISSING_PLURAL_CATEGORY' | 'INVALID_CATALOG' | 'LOCALE_MISMATCH';
  readonly path: string;
  readonly message: string;
};

export class I18nRuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'I18nRuntimeError';
    this.code = code;
  }
}

export function validateCatalog(
  catalog: Catalog,
  locale: string,
  options: { readonly strictPlural?: boolean } = {},
): readonly CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  const visit = (node: unknown, path: string): void => {
    if (isPlural(node)) {
      if (options.strictPlural !== false) {
        for (const category of requiredPluralCategories(locale)) {
          if (!node.branches[category]) diagnostics.push({
            code: 'MISSING_PLURAL_CATEGORY',
            path,
            message: `Locale ${locale} requires plural category ${category}.`,
          });
        }
      }
      for (const [category, branch] of Object.entries(node.branches)) {
        if (branch) visit(branch, `${path}.${category}`);
      }
      return;
    }
    if (isMessage(node)) return;
    if (typeof node !== 'object' || node === null) {
      diagnostics.push({ code: 'INVALID_CATALOG', path, message: 'Catalog nodes must be messages, plurals, or objects.' });
      return;
    }
    for (const [key, child] of Object.entries(node)) visit(child, path ? `${path}.${key}` : key);
  };
  visit(catalog, '');
  return diagnostics;
}

export function assertValidCatalog(catalog: Catalog, locale: string): void {
  const diagnostics = validateCatalog(catalog, locale, { strictPlural: true });
  if (diagnostics.length > 0) throw new I18nRuntimeError('INVALID_CATALOG', diagnostics.map((item) => `${item.path}: ${item.message}`).join('\n'));
}

/**
 * Two locales must agree on more than the token names: a token that resolves a
 * service in one locale and not in the other renders through a different path,
 * and one that parses its input changes what the call site must pass.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tokenSignature(token: I18nToken<string, any, string>): string {
  return [
    token.name,
    token.kind,
    token.resolveFormatter ? 'injected' : 'static',
    token.parse ? 'parsed' : 'raw',
  ].join(':');
}

export function validateLocaleParity(reference: Catalog, candidate: Catalog): readonly CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  const compare = (left: unknown, right: unknown, path: string): void => {
    if (isMessage(left) || isMessage(right)) {
      if (!isMessage(left) || !isMessage(right)) {
        diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale message shape does not match the reference.' });
        return;
      }
      const leftTokens = left.parts.filter((part): part is I18nToken => typeof part !== 'string').map(tokenSignature).sort();
      const rightTokens = right.parts.filter((part): part is I18nToken => typeof part !== 'string').map(tokenSignature).sort();
      if (leftTokens.join('|') !== rightTokens.join('|')) diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale token set does not match the reference.' });
      return;
    }
    if (isPlural(left) || isPlural(right)) {
      if (!isPlural(left) || !isPlural(right) || tokenSignature(left.count) !== tokenSignature(right.count)) {
        diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale plural selector does not match the reference.' });
        return;
      }
      for (const category of Object.keys(left.branches)) {
        const branch = left.branches[category as PluralCategory];
        const candidateBranch = right.branches[category as PluralCategory];
        if (!candidateBranch) diagnostics.push({ code: 'LOCALE_MISMATCH', path: `${path}.${category}`, message: 'Locale is missing a reference plural branch.' });
        else if (branch) compare(branch, candidateBranch, `${path}.${category}`);
      }
      return;
    }
    if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
      diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale node shape does not match the reference.' });
      return;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.join('|') !== rightKeys.join('|')) {
      diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale keys do not match the reference.' });
      return;
    }
    for (const key of leftKeys) compare((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
  };
  compare(reference, candidate, '');
  return diagnostics;
}

export function assertLocaleParity(reference: Catalog, candidate: Catalog): void {
  const diagnostics = validateLocaleParity(reference, candidate);
  if (diagnostics.length > 0) throw new I18nRuntimeError('LOCALE_MISMATCH', diagnostics.map((item) => `${item.path}: ${item.message}`).join('\n'));
}

function nodeAt(catalog: Catalog, key: string): Message<unknown> | PluralMessage {
  let node: unknown = catalog;
  for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
  if (isMessage(node) || isPlural(node)) return node;
  throw new I18nRuntimeError('UNKNOWN_KEY', `Unknown translation key: ${key}`);
}

/**
 * Resolves one parameter: present, parsed by the token's schema when it has
 * one, then guarded. The schema runs first on purpose — it is allowed to turn
 * the call-site input into the value the formatter expects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tokenValue(token: I18nToken<string, any, string>, params: Record<string, unknown>): unknown {
  const raw = params[token.name];
  if (raw === undefined) throw new I18nRuntimeError('MISSING_PARAM', `Missing parameter ${token.name}.`);
  const value = token.parse ? token.parse(raw) : raw;
  if (token.validate && !token.validate(value)) throw new I18nRuntimeError('INVALID_PARAM', `Invalid parameter ${token.name}.`);
  return value;
}

/**
 * `t` has no injection context, so it can only drive a resolver that asks for
 * nothing. That is the exact runtime counterpart of `StaticTranslationKey`: a
 * token whose dependency map is empty renders here, one that yields a service
 * request does not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatterSync(token: I18nToken<string, any, string>): TokenFormatter<unknown> {
  if (!token.resolveFormatter) return token.format;
  const step = token.resolveFormatter().next();
  if (!step.done) {
    throw new I18nRuntimeError(
      'CRAFT_INJECTION_REQUIRED',
      `Token ${token.name} resolves a dependency and must be rendered through a CraftTS translator.`,
    );
  }
  return step.value;
}

function renderMessageSync(message: Message<unknown>, params: Record<string, unknown>, context: FormatterContext): string {
  return message.parts.map((part) => {
    if (typeof part === 'string') return part;
    return formatterSync(part)(tokenValue(part, params), context);
  }).join('');
}

function renderNodeSync(node: Message<unknown> | PluralMessage, params: Record<string, unknown>, context: FormatterContext): string {
  if (isMessage(node)) return renderMessageSync(node, params, context);
  const count = pluralCount(node, params);
  const category = new Intl.PluralRules(context.locale).select(count) as PluralCategory;
  const branch = node.branches[category];
  if (!branch) throw new I18nRuntimeError('MISSING_PLURAL_CATEGORY', `Missing plural category ${category} for ${context.locale}.`);
  return renderMessageSync(branch, params, context);
}

/**
 * The selector is read through the same parse path as any other parameter, so a
 * schema that coerces (`'3'` → `3`) works for a plural too.
 */
function pluralCount(node: PluralMessage, params: Record<string, unknown>): number {
  const count = (node.count.parse as ((value: unknown) => unknown) | undefined)
    ? (node.count.parse as (value: unknown) => unknown)(params[node.count.name])
    : params[node.count.name];
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    throw new I18nRuntimeError(
      'INVALID_PLURAL_COUNT',
      `Plural count ${node.count.name} must be a finite number.`,
    );
  }
  return count;
}

function* renderMessage(
  message: Message<unknown>,
  params: Record<string, unknown>,
  context: FormatterContext,
): Generator<unknown, string, unknown> {
  let output = '';
  for (const part of message.parts) {
    if (typeof part === 'string') {
      output += part;
      continue;
    }
    const value = tokenValue(part, params);
    const formatter = part.resolveFormatter
      ? yield* part.resolveFormatter()
      : part.format;
    output += formatter(value, context);
  }
  return output;
}

function* renderNode(
  node: Message<unknown> | PluralMessage,
  params: Record<string, unknown>,
  context: FormatterContext,
): Generator<unknown, string, unknown> {
  if (isMessage(node)) return yield* renderMessage(node, params, context);
  const count = pluralCount(node, params);
  const category = new Intl.PluralRules(context.locale).select(count) as PluralCategory;
  const branch = node.branches[category];
  if (!branch) {
    throw new I18nRuntimeError(
      'MISSING_PLURAL_CATEGORY',
      `Missing plural category ${category} for ${context.locale}.`,
    );
  }
  return yield* renderMessage(branch, params, context);
}

export type I18nLoader<Locale extends LocaleDefinition = LocaleDefinition> = {
  readonly load: (id: string) => Promise<Locale>;
  readonly clear: () => void;
  readonly has: (id: string) => boolean;
};

export function createI18nLoader<Locale extends LocaleDefinition>(
  load: (id: string) => Promise<Locale>,
): I18nLoader<Locale> {
  const cache = new Map<string, Promise<Locale>>();
  return {
    load: (id) => {
      const current = cache.get(id);
      if (current) return current;
      const pending = load(id);
      cache.set(id, pending);
      return pending.catch((error: unknown) => {
        cache.delete(id);
        throw error;
      });
    },
    clear: () => cache.clear(),
    has: (id) => cache.has(id),
  };
}

export type I18nRuntime<Locales extends readonly LocaleDefinition[]> = {
  readonly locale: () => Locales[number]['id'];
  readonly setLocale: (id: Locales[number]['id']) => void;
  readonly translate: <Key extends StaticTranslationKey<Locales[number]>>(
    key: Key,
    ...params: TranslationParamsArgument<
      TranslationParams<Locales[number], Key & string>
    >
  ) => string;
  readonly t: I18nRuntime<Locales>['translate'];
  readonly bind: (
    dependency: ReactiveTranslationDependency,
  ) => ReactiveTranslator<Locales>;
  readonly loadLocale: (id: Locales[number]['id']) => Promise<void>;
};

export type ReactiveTranslationDependency = () => Generator<
  unknown,
  unknown,
  unknown
>;

export type ReactiveTranslator<
  Locales extends readonly LocaleDefinition[],
> = {
  <Key extends TranslationKey<Locales[number]>>(
    key: Key,
    ...params: TranslationParamsArgument<
      TranslationParams<Locales[number], Key & string>
    >
  ): TranslationReader<
    TranslationDependencies<Locales[number], Key & string>
  >;
} & ComponentDepsCarrier<
  TranslationDependencies<Locales[number], TranslationKey<Locales[number]>>
>;

export function createI18nRuntime<const Locales extends readonly LocaleDefinition[]>(options: {
  readonly locales: Locales;
  readonly defaultLocale?: Locales[number]['id'];
  readonly strict?: boolean;
  readonly timeZone?: string;
  readonly loader?: I18nLoader;
}): I18nRuntime<Locales> {
  if (options.locales.length === 0) throw new I18nRuntimeError('NO_LOCALES', 'At least one locale is required.');
  const locales = new Map(options.locales.map((locale) => [locale.id, locale]));
  let current = options.defaultLocale ?? options.locales[0].id;
  const loaded = new Map(locales);
  if (options.strict !== false) for (const locale of options.locales) assertValidCatalog(locale.catalog, locale.id);
  if (options.strict !== false) for (const locale of options.locales.slice(1)) assertLocaleParity(options.locales[0].catalog, locale.catalog);
  const loadLocale = async (id: Locales[number]['id']): Promise<void> => {
    if (loaded.has(id)) return;
    if (!options.loader) throw new I18nRuntimeError('LOCALE_NOT_LOADED', `Locale ${id} has not been loaded.`);
    const locale = await options.loader.load(id);
    loaded.set(id, locale);
  };
  const translate = <Key extends StaticTranslationKey<Locales[number]>>(
    key: Key,
    ...params: TranslationParamsArgument<
      TranslationParams<Locales[number], Key & string>
    >
  ): string => {
    const locale = loaded.get(current);
    if (!locale) throw new I18nRuntimeError('LOCALE_NOT_LOADED', `Locale ${current} has not been loaded.`);
    return renderNodeSync(
      nodeAt(locale.catalog, key),
      paramsRecord(params[0]),
      { locale: current, timeZone: options.timeZone },
    );
  };
  const translateGenerator = function* (
    key: string,
    params?: unknown,
  ): Generator<unknown, string, unknown> {
    const locale = loaded.get(current);
    if (!locale) {
      throw new I18nRuntimeError('LOCALE_NOT_LOADED', `Locale ${current} has not been loaded.`);
    }
    return yield* renderNode(
      nodeAt(locale.catalog, key),
      paramsRecord(params),
      { locale: current, timeZone: options.timeZone },
    );
  };
  return {
    locale: () => current,
    setLocale: (id) => {
      if (!loaded.has(id)) throw new I18nRuntimeError('LOCALE_NOT_LOADED', `Locale ${id} has not been loaded.`);
      current = id;
    },
    translate,
    t: translate,
    bind: (dependency: ReactiveTranslationDependency) =>
      createReactiveTranslator<Locales>({
        runtime: { translateGenerator },
        dependency,
      }),
    loadLocale,
  };
}

export function createReactiveTranslator<
  const Locales extends readonly LocaleDefinition[],
>(options: {
  // Only the generator form is accepted: a translator built on the synchronous
  // `translate` would advertise dependencies in its type and then throw on the
  // first DI-aware message it renders.
  readonly runtime: {
    readonly translateGenerator: (
      key: string,
      params?: unknown,
    ) => Generator<unknown, string, unknown>;
  };
  readonly dependency: ReactiveTranslationDependency;
}): ReactiveTranslator<Locales> {
  const translate = <Key extends TranslationKey<Locales[number]>>(
    key: Key,
    ...params: TranslationParamsArgument<
      TranslationParams<Locales[number], Key & string>
    >
  ): TranslationReader<
    TranslationDependencies<Locales[number], Key & string>
  > =>
    function* () {
      yield* options.dependency();
      return yield* options.runtime.translateGenerator(key, params[0]);
    };

  return translate;
}

export function serializeToken<Name extends string, Value, Kind extends string>(
  token: I18nToken<Name, Value, Kind>,
): { readonly token: string; readonly name: string; readonly parsed?: true } {
  if (token.resolveFormatter) {
    throw new I18nRuntimeError(
      'CRAFT_INJECTION_REQUIRED',
      `Token ${token.name} resolves a dependency: its formatter is produced at render time and cannot be serialised. Deliver such a message from the application rather than from a serialised catalogue.`,
    );
  }
  // A token id alone would let a parsed token and a raw one of the same kind
  // look identical on the other side of the boundary.
  return token.parse
    ? { token: token.tokenId, name: token.name, parsed: true }
    : { token: token.tokenId, name: token.name };
}

export type SerializedCatalog = {
  readonly kind: 'catalog';
  readonly entries: Readonly<Record<string, unknown>>;
};

/**
 * Produces a JSON-safe delivery representation. Formatters are deliberately
 * represented by stable token ids; the application registers their executable
 * formatters when it renders the catalogue.
 */
export function serializeCatalog(catalog: Catalog): SerializedCatalog {
  const serialize = (node: unknown): unknown => {
    if (isMessage(node)) {
      return {
        kind: 'message',
        parts: node.parts.map((part) => typeof part === 'string' ? part : serializeToken(part)),
      };
    }
    if (isPlural(node)) {
      return {
        kind: 'plural',
        count: serializeToken(node.count),
        branches: Object.fromEntries(Object.entries(node.branches).map(([category, branch]) => [category, serialize(branch)])),
      };
    }
    if (typeof node === 'object' && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, serialize(value)]));
    }
    return node;
  };
  return { kind: 'catalog', entries: serialize(catalog) as Readonly<Record<string, unknown>> };
}
