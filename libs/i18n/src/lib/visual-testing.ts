/**
 * Translation, as a source of layout axes.
 *
 * The catalogue is a TypeScript value, not a bundle of `.po` files, and that
 * changes what is knowable. Three things fall out of it, and two of them are
 * exact:
 *
 * - **the longest locale** for a given screen is a computation, not a guess.
 *   One axis point, not one per language — and the right one, which the
 *   convention of "test in German" only approximates.
 * - **the plural categories** are already written down and already checked
 *   exhaustive per locale. They are axis points by construction; nothing has to
 *   be enumerated by hand.
 * - **the pseudo-locale** is the only approximation here, and it is the one
 *   that finds the *future* case: the translation nobody has written yet, and
 *   the hard-coded string somebody forgot to externalise.
 *
 * The two pressures are kept apart throughout, because they break in opposite
 * ways. A rising `min-content` — an unbreakable word, a URL, a long number —
 * stops a column shrinking. A rising `max-content` — a long but breakable
 * sentence — steals width from siblings in an `auto` track. A long sentence
 * with spaces in it usually does not move `min-content` at all.
 */
import type {
  Catalog,
  CatalogNode,
  I18nToken,
  LocaleDefinition,
  Message,
  PluralCategory,
  PluralMessage,
} from './i18n';

const isMessage = (value: CatalogNode): value is Message =>
  (value as { kind?: unknown }).kind === 'message';

const isPlural = (value: CatalogNode): value is PluralMessage =>
  (value as { kind?: unknown }).kind === 'plural';

const isToken = (value: unknown): value is I18nToken =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __i18nToken?: unknown }).__i18nToken === true;

export interface CatalogEntry {
  /** `cart.items`, the key a runtime translates. */
  readonly key: string;
  readonly kind: 'message' | 'plural';
  /** Literal text, tokens erased. */
  readonly literals: readonly string[];
  readonly tokens: readonly I18nToken[];
  /** Present on a plural: the categories this locale declares. */
  readonly categories?: readonly PluralCategory[];
}

/** Every message in a catalogue, keyed the way a runtime keys it. */
export function flattenCatalog(
  catalog: Catalog,
  prefix: readonly string[] = [],
): readonly CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const [name, node] of Object.entries(catalog)) {
    const path = [...prefix, name];
    if (isMessage(node)) {
      entries.push({ key: path.join('.'), kind: 'message', ...partsOf(node) });
      continue;
    }
    if (isPlural(node)) {
      const branches = Object.entries(node.branches) as [
        PluralCategory,
        Message,
      ][];
      entries.push({
        key: path.join('.'),
        kind: 'plural',
        // A plural's length is that of its *longest* branch: the layout has to
        // hold whichever one the count selects, and averaging them would report
        // room that only exists for `one`.
        literals: branches.flatMap(([, branch]) => partsOf(branch).literals),
        tokens: [
          node.count as I18nToken,
          ...branches.flatMap(([, branch]) => partsOf(branch).tokens),
        ],
        categories: branches.map(([category]) => category).sort(),
      });
      continue;
    }
    entries.push(...flattenCatalog(node as Catalog, path));
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

function partsOf(message: Message): {
  literals: readonly string[];
  tokens: readonly I18nToken[];
} {
  const literals: string[] = [];
  const tokens: I18nToken[] = [];
  for (const part of message.parts) {
    if (typeof part === 'string') literals.push(part);
    else if (isToken(part)) tokens.push(part as I18nToken);
  }
  return { literals, tokens };
}

/* ------------------------------------------------------------------------ *
 * The longest locale, measured
 * ------------------------------------------------------------------------ */

export interface LocaleLength {
  readonly id: string;
  /** Total literal characters over the keys asked about. */
  readonly length: number;
  /** Longest single message, which is what actually breaks a title. */
  readonly longestKey?: string;
  readonly longestLength: number;
  /** Keys asked for that this locale does not have. */
  readonly missing: readonly string[];
}

const lengthOf = (entry: CatalogEntry): number =>
  entry.kind === 'plural'
    ? Math.max(0, ...entry.literals.map((literal) => literal.length))
    : entry.literals.join('').length;

export function measureLocales(
  locales: readonly LocaleDefinition[],
  keys?: readonly string[],
): readonly LocaleLength[] {
  const wanted = keys ? new Set(keys) : undefined;
  return locales
    .map((locale) => {
      const entries = flattenCatalog(locale.catalog).filter(
        (entry) => !wanted || wanted.has(entry.key),
      );
      const present = new Set(entries.map((entry) => entry.key));
      let longestKey: string | undefined;
      let longestLength = 0;
      let length = 0;
      for (const entry of entries) {
        const size = lengthOf(entry);
        length += size;
        if (size > longestLength) {
          longestLength = size;
          longestKey = entry.key;
        }
      }
      return {
        id: locale.id,
        length,
        ...(longestKey ? { longestKey } : {}),
        longestLength,
        missing: (keys ?? []).filter((key) => !present.has(key)).sort(),
      };
    })
    .sort((left, right) => right.length - left.length || left.id.localeCompare(right.id));
}

/**
 * The locale that puts the most pressure on a given screen.
 *
 * Exact and free: the catalogue is a value, the keys the screen uses are known,
 * and the sum is arithmetic. It contributes **one** axis point rather than one
 * per language — which is the difference between a matrix that grows with the
 * number of translations and one that does not.
 */
export function longestLocale(
  locales: readonly LocaleDefinition[],
  keys?: readonly string[],
): LocaleLength | undefined {
  return measureLocales(locales, keys)[0];
}

/* ------------------------------------------------------------------------ *
 * The pseudo-locale
 * ------------------------------------------------------------------------ */

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'ä', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'ï',
  j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'š', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Ä', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Ï',
  J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Š', T: 'Ţ', U: 'Ü', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const PADDING = 'ⱺ';

export interface PseudoLocaleOptions {
  /** How much longer than the reference. German runs about 35% over English. */
  readonly expansion?: number;
  /** Wrapped around every message, so truncation is visible at a glance. */
  readonly brackets?: readonly [string, string];
  /** Accent every letter, which is what exposes an un-externalised string. */
  readonly accent?: boolean;
}

export const DEFAULT_PSEUDO_OPTIONS: Required<PseudoLocaleOptions> = {
  expansion: 0.4,
  brackets: ['[[', ']]'],
  accent: true,
};

/**
 * One literal, pseudo-localised.
 *
 * Padding is appended as whole "words" rather than as characters glued to the
 * end: gluing them on would raise `min-content` and report a column as too
 * narrow when the real translation, which has spaces in it, fits comfortably.
 * The pseudo-locale must exaggerate `max-content`, not fake an unbreakable
 * word.
 */
export function pseudoText(
  text: string,
  options: PseudoLocaleOptions = {},
): string {
  const settings = { ...DEFAULT_PSEUDO_OPTIONS, ...options };
  if (text.trim().length === 0) return text;

  const accented = settings.accent
    ? [...text].map((character) => ACCENTS[character] ?? character).join('')
    : text;

  const wanted = Math.round(text.length * settings.expansion);
  const padding: string[] = [];
  for (let added = 0; added < wanted; added += 5) {
    padding.push(PADDING.repeat(Math.min(4, wanted - added)));
  }

  const [open, close] = settings.brackets;
  return `${open}${accented}${padding.length ? ` ${padding.join(' ')}` : ''}${close}`;
}

/**
 * A whole catalogue, pseudo-localised, with its tokens untouched.
 *
 * Tokens are left alone on purpose: mangling `${count}` would break the
 * parameter contract and the render would fail for a reason that has nothing to
 * do with layout.
 */
export function pseudoCatalog<T extends Catalog>(
  catalog: T,
  options: PseudoLocaleOptions = {},
): T {
  const walk = (node: CatalogNode): CatalogNode => {
    if (isMessage(node)) {
      return {
        ...node,
        parts: node.parts.map((part) =>
          typeof part === 'string' ? pseudoText(part, options) : part,
        ),
      };
    }
    if (isPlural(node)) {
      return {
        ...node,
        branches: Object.fromEntries(
          Object.entries(node.branches).map(([category, branch]) => [
            category,
            walk(branch as Message) as Message,
          ]),
        ),
      } as PluralMessage;
    }
    return Object.fromEntries(
      Object.entries(node as Catalog).map(([key, child]) => [key, walk(child)]),
    ) as Catalog;
  };
  return walk(catalog) as T;
}

/**
 * Text on screen that is *not* wrapped in the pseudo brackets.
 *
 * A string that survives pseudo-localisation unchanged was never routed through
 * the catalogue. This is the check that finds it, and it is the only reason to
 * accent every character rather than merely padding.
 */
export function findHardCodedText(
  rendered: readonly string[],
  options: PseudoLocaleOptions = {},
): readonly string[] {
  const [open, close] = { ...DEFAULT_PSEUDO_OPTIONS, ...options }.brackets;
  return rendered
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .filter((text) => !(text.includes(open) && text.includes(close)))
    .sort();
}

/* ------------------------------------------------------------------------ *
 * Plurals and token bounds
 * ------------------------------------------------------------------------ */

/**
 * The plural categories of a key, as axis points.
 *
 * Already declared, already checked exhaustive per locale by `defineLocale`.
 * Nothing is enumerated here — this only reads what the catalogue was forced to
 * write down, which is why it is exact.
 */
export function pluralAxis(
  catalog: Catalog,
  key: string,
): readonly PluralCategory[] {
  return (
    flattenCatalog(catalog).find((entry) => entry.key === key)?.categories ?? []
  );
}

export interface EdgeValues {
  readonly token: string;
  readonly kind: string;
  readonly values: readonly unknown[];
  /** Which pressure each value exercises. They fail in opposite ways. */
  readonly pressure: 'min-content' | 'max-content' | 'both';
}

const NUMBER_EDGES = [0, 1, 2, 5, 11, 21, 101, 9_999_999] as const;

const STRING_EDGES = [
  '',
  'Ok',
  'A typical label of about forty characters',
  'Eine außergewöhnlich lange Beschriftung, die über mehrere Zeilen läuft',
  '設定とアカウントの管理',
  '👩🏽‍🚒👨🏻‍🍳👩🏿‍⚕️',
  'https://example.com/a/very/long/unbreakable/path/segment',
] as const;

/**
 * Boundary values for a token, derived rather than invented.
 *
 * Numbers get the CLDR-relevant counts and the digit-count extremes; strings
 * get short, typical, long, CJK, emoji-with-ZWJ and one unbreakable run. The
 * last one is the important one and the one hand-written cases always miss: a
 * URL raises `min-content`, which stops a column shrinking, where a long
 * sentence with spaces in it does not.
 */
export function tokenEdgeValues(token: I18nToken): EdgeValues {
  const numeric = /number|integer|percent|money|compact/.test(token.kind);
  return {
    token: token.name,
    kind: token.kind,
    values: numeric ? [...NUMBER_EDGES] : [...STRING_EDGES],
    pressure: numeric ? 'min-content' : 'both',
  };
}

/** Every token a screen's keys carry, with its boundary values. */
export function edgeValuesFor(
  catalog: Catalog,
  keys?: readonly string[],
): readonly EdgeValues[] {
  const wanted = keys ? new Set(keys) : undefined;
  const seen = new Map<string, EdgeValues>();
  for (const entry of flattenCatalog(catalog)) {
    if (wanted && !wanted.has(entry.key)) continue;
    for (const token of entry.tokens) {
      if (!seen.has(token.name)) seen.set(token.name, tokenEdgeValues(token));
    }
  }
  return [...seen.values()].sort((left, right) =>
    left.token.localeCompare(right.token),
  );
}
