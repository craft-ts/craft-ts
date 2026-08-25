/*
 * This file intentionally has no CraftTS, Angular or Effect import.  The
 * catalogue is a plain TypeScript value and the runtime is usable in a
 * browser, a server, a worker, or a test without a framework.
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type FormatterContext = {
  readonly locale: string;
  readonly timeZone?: string;
};
export type TokenFormatter<Value> = ((value: Value, context: FormatterContext) => string) & {
  readonly id?: string;
};
export type TokenValueAdapter<Value> = {
  readonly validate?: (value: unknown) => value is Value;
  readonly name?: string;
} | ((value: unknown) => value is Value);

export type I18nToken<Name extends string = string, Value = unknown, Kind extends string = string> = {
  readonly __i18nToken: true;
  readonly name: Name;
  readonly kind: Kind;
  readonly tokenId: string;
  readonly validate?: (value: unknown) => value is Value;
  readonly format: TokenFormatter<Value>;
};

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};
type UnionToIntersection<T> =
  (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
    ? I
    : never;
type TokenParams<T> = T extends I18nToken<infer Name, infer Value, infer _Kind>
  ? { [Key in Name]: Value }
  : Record<never, never>;
type ParamsFromTokens<T extends readonly unknown[]> = Simplify<
  UnionToIntersection<TokenParams<T[number]>>
>;

export type Message<Params = Record<never, never>> = {
  readonly kind: 'message';
  // The erased token union is intentionally bivariant; concrete tokens keep their value type in Params.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly parts: readonly (string | I18nToken<string, any, string>)[];
  readonly params: Params;
};

export type PluralMessage<
  CountName extends string = string,
  CountValue extends number = number,
  Branches extends Partial<Record<PluralCategory, Message<unknown>>> = Partial<Record<PluralCategory, Message<unknown>>>,
> = {
  readonly kind: 'plural';
  readonly count: I18nToken<CountName, CountValue, string>;
  readonly branches: Branches;
  readonly params: Simplify<
    { [Key in CountName]: CountValue } &
      (Branches[keyof Branches] extends Message<infer Params> ? Params : Record<never, never>)
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

export function defineCatalog<const T extends Catalog>(catalog: T): T {
  return catalog;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function msg<const Parts extends readonly I18nToken<string, any, string>[]>(
  strings: TemplateStringsArray,
  ...tokens: Parts
): Message<ParamsFromTokens<Parts>> {
  const parts: (string | I18nToken)[] = [];
  for (let index = 0; index < strings.length; index += 1) {
    const text = strings[index];
    if (text) parts.push(text);
    const token = tokens[index];
    if (token) parts.push(token);
  }
  return { kind: 'message', parts, params: undefined as unknown as ParamsFromTokens<Parts> };
}

export type PluralBranches = Partial<Record<PluralCategory, Message<unknown>>> &
  Pick<Record<PluralCategory, Message<unknown>>, 'other'>;

export function plural<
  CountName extends string,
  CountValue extends number,
  const Branches extends PluralBranches,
>(
  count: I18nToken<CountName, CountValue, string>,
  branches: Branches,
): PluralMessage<CountName, CountValue, Branches> {
  return {
    kind: 'plural',
    count,
    branches,
    params: undefined as unknown as PluralMessage<CountName, CountValue, Branches>['params'],
  };
}

export type TokenDefinition<Name extends string, Value, Kind extends string = string> = {
  readonly name: Name;
  readonly kind: Kind;
  readonly tokenId?: string;
  readonly validate?: (value: unknown) => value is Value;
  readonly format: TokenFormatter<Value>;
};

export function defineToken<Name extends string, Value, Kind extends string = string>(
  definition: TokenDefinition<Name, Value, Kind>,
): I18nToken<Name, Value, Kind> {
  return {
    __i18nToken: true,
    name: definition.name,
    kind: definition.kind,
    tokenId: definition.tokenId ?? `app.${definition.kind}`,
    validate: definition.validate,
    format: definition.format,
  };
}

export function defineTokenFactory<Kind extends string, Value, Options = undefined>(definition: {
  readonly kind: Kind;
  readonly tokenId?: string;
  readonly format: (options: Options | undefined) => TokenFormatter<Value>;
}) {
  return function create<Name extends string>(
    name: Name,
    adapter?: TokenValueAdapter<Value>,
    options?: Options,
  ): I18nToken<Name, Value, Kind> {
    return defineToken({
      name,
      kind: definition.kind,
      tokenId: definition.tokenId,
      validate: typeof adapter === 'function' ? adapter : adapter?.validate,
      format: definition.format(options),
    });
  };
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
export const money = defineTokenFactory({ kind: 'money', format: (options?: { readonly currency?: string } & NumberFormatterOptions) => formatters.money(options?.currency ?? 'EUR', options) });
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

export function validateLocaleParity(reference: Catalog, candidate: Catalog): readonly CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];
  const compare = (left: unknown, right: unknown, path: string): void => {
    if (isMessage(left) || isMessage(right)) {
      if (!isMessage(left) || !isMessage(right)) {
        diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale message shape does not match the reference.' });
        return;
      }
      const leftTokens = left.parts.filter((part): part is I18nToken => typeof part !== 'string').map((part) => `${part.name}:${part.kind}`).sort();
      const rightTokens = right.parts.filter((part): part is I18nToken => typeof part !== 'string').map((part) => `${part.name}:${part.kind}`).sort();
      if (leftTokens.join('|') !== rightTokens.join('|')) diagnostics.push({ code: 'LOCALE_MISMATCH', path, message: 'Locale token set does not match the reference.' });
      return;
    }
    if (isPlural(left) || isPlural(right)) {
      if (!isPlural(left) || !isPlural(right) || left.count.name !== right.count.name || left.count.kind !== right.count.kind) {
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

function renderMessage(message: Message<unknown>, params: Record<string, unknown>, context: FormatterContext): string {
  return message.parts.map((part) => {
    if (typeof part === 'string') return part;
    const value = params[part.name];
    if (value === undefined) throw new I18nRuntimeError('MISSING_PARAM', `Missing parameter ${part.name}.`);
    if (part.validate && !part.validate(value)) throw new I18nRuntimeError('INVALID_PARAM', `Invalid parameter ${part.name}.`);
    return part.format(value, context);
  }).join('');
}

function renderNode(node: Message<unknown> | PluralMessage, params: Record<string, unknown>, context: FormatterContext): string {
  if (isMessage(node)) return renderMessage(node, params, context);
  const count = params[node.count.name];
  if (typeof count !== 'number' || !Number.isFinite(count)) throw new I18nRuntimeError('INVALID_PLURAL_COUNT', `Plural count ${node.count.name} must be a finite number.`);
  const category = new Intl.PluralRules(context.locale).select(count) as PluralCategory;
  const branch = node.branches[category];
  if (!branch) throw new I18nRuntimeError('MISSING_PLURAL_CATEGORY', `Missing plural category ${category} for ${context.locale}.`);
  return renderMessage(branch, params, context);
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
  readonly translate: <Key extends TranslationKey<Locales[number]>>(
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
> = <Key extends TranslationKey<Locales[number]>>(
  key: Key,
  ...params: TranslationParamsArgument<
    TranslationParams<Locales[number], Key & string>
  >
) => () => Generator<unknown, string, unknown>;

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
  const translate = ((key: string, params?: Record<string, unknown>) => {
    const locale = loaded.get(current);
    if (!locale) throw new I18nRuntimeError('LOCALE_NOT_LOADED', `Locale ${current} has not been loaded.`);
    const node = nodeAt(locale.catalog, key);
    return renderNode(node, params ?? {}, { locale: current, timeZone: options.timeZone });
  }) as I18nRuntime<Locales>['translate'];
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
        runtime: { translate },
        dependency,
      }),
    loadLocale,
  };
}

export function createReactiveTranslator<
  const Locales extends readonly LocaleDefinition[],
>(options: {
  readonly runtime: Pick<I18nRuntime<Locales>, 'translate'>;
  readonly dependency: ReactiveTranslationDependency;
}): ReactiveTranslator<Locales> {
  return ((key: string, params?: Record<string, unknown>) =>
    function* () {
      yield* options.dependency();
      return options.runtime.translate(key as never, params as never);
    }) as ReactiveTranslator<Locales>;
}

export function serializeToken<Name extends string, Value, Kind extends string>(token: I18nToken<Name, Value, Kind>): { readonly token: string; readonly name: string } {
  return { token: token.tokenId, name: token.name };
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
