/**
 * The branded value types every helper in the design system speaks.
 *
 * Each value is a **nominal object** — `{ readonly [LENGTH]: true }` with
 * `LENGTH` a `unique symbol` — never a `string & { __length?: true }`. An
 * optional phantom on a primitive base brands nothing: `'blabla'` stays
 * assignable and the whole guarantee collapses in silence, with every test
 * still green. That failure mode is the most expensive one this package can
 * have, which is why the shape is an object and why `tokens.spec.ts` measures
 * the brand itself rather than a handful of hand-picked cases.
 *
 * The assignability lattice is carried by the brands, not by a separate table:
 * an integer *is* a number (it carries both brands), a length *is* a
 * length-percentage (the target is a union). See `kinds.ts`.
 */

declare const LENGTH: unique symbol;
declare const PERCENT: unique symbol;
declare const NUMBER: unique symbol;
declare const INTEGER: unique symbol;
declare const ANGLE: unique symbol;
declare const TIME: unique symbol;
declare const COLOR: unique symbol;
declare const IDENT: unique symbol;
declare const CSS_STRING: unique symbol;
declare const URL_VALUE: unique symbol;

/** Shared by every value: the CSS text, and the debt it carries. */
export interface StyleValue {
  readonly css: string;
  /**
   * Non-empty when the value could not be proven — see `unsafeLength`. It
   * travels with the declaration all the way to the graph, which is what makes
   * the debt countable instead of invisible.
   */
  readonly unproven: string;
}

export interface LengthValue extends StyleValue {
  readonly [LENGTH]: true;
}

export interface PercentValue extends StyleValue {
  readonly [PERCENT]: true;
}

export interface NumberValue extends StyleValue {
  readonly [NUMBER]: true;
}

/** An integer carries the number brand too: `<integer>` is a `<number>`. */
export interface IntegerValue extends NumberValue {
  readonly [INTEGER]: true;
}

export interface AngleValue extends StyleValue {
  readonly [ANGLE]: true;
}

export interface TimeValue extends StyleValue {
  readonly [TIME]: true;
}

export type ColorRole = 'surface' | 'text' | 'border' | 'accent' | 'none';

export interface ColorValue extends StyleValue {
  readonly [COLOR]: true;
  /** The dark counterpart. A palette token carries both of its values. */
  readonly dark: string;
  readonly role: ColorRole;
}

/** `<custom-ident>` — a name, never a free string. */
export interface IdentValue extends StyleValue {
  readonly [IDENT]: true;
}

/** `<string>` — quoted at construction, so it cannot break out of the rule. */
export interface CssStringValue extends StyleValue {
  readonly [CSS_STRING]: true;
}

/** `<url>` — wrapped at construction for the same reason. */
export interface UrlValue extends StyleValue {
  readonly [URL_VALUE]: true;
}

/** `<length-percentage>`, spelled as the union the grammar actually means. */
export type LengthPercentageValue = LengthValue | PercentValue;

const value = <Brand>(css: string, unproven = ''): Brand =>
  ({ css, unproven }) as Brand;

export const rawLength = (css: string, unproven = ''): LengthValue =>
  value<LengthValue>(css, unproven);

/**
 * Raw units live under a namespace rather than at the top level for a dull but
 * real reason: `px` is already taken by `padding-inline` on the property side.
 * Two short names for two different concepts in the same import is a guaranteed
 * collision — better settled here, once.
 */
export const unit = {
  rem: (amount: number): LengthValue => rawLength(`${amount}rem`),
  px: (amount: number): LengthValue => rawLength(`${amount}px`),
  em: (amount: number): LengthValue => rawLength(`${amount}em`),
  ch: (amount: number): LengthValue => rawLength(`${amount}ch`),
  vw: (amount: number): LengthValue => rawLength(`${amount}vw`),
  vh: (amount: number): LengthValue => rawLength(`${amount}vh`),
  pct: (amount: number): PercentValue => value<PercentValue>(`${amount}%`),
  deg: (amount: number): AngleValue => value<AngleValue>(`${amount}deg`),
  ms: (amount: number): TimeValue => value<TimeValue>(`${amount}ms`),
  s: (amount: number): TimeValue => value<TimeValue>(`${amount}s`),
} as const;

export const num = (amount: number): NumberValue =>
  value<NumberValue>(String(amount));

export const int = (amount: number): IntegerValue =>
  value<IntegerValue>(String(Math.trunc(amount)));

/**
 * The three types the generator cannot close, each behind its own constructor
 * so that no generated signature ever has to accept a bare `string`.
 */
export const ident = (name: string): IdentValue =>
  value<IdentValue>(name.replace(/[^A-Za-z0-9_-]/g, ''));

export const cssString = (text: string): CssStringValue =>
  value<CssStringValue>(JSON.stringify(text));

export const url = (href: string): UrlValue =>
  value<UrlValue>(`url(${JSON.stringify(href)})`);

/**
 * The only way out of the scales, and it leaves a trace.
 *
 * Without this door a blocked agent bypasses the design system entirely; with
 * it unmarked, the bypass is silent. `unproven` bubbles up to the graph, so the
 * debt is countable. There is no `[17px]` arbitrary-value syntax: if a value is
 * missing from a scale, it is added to the scale.
 */
export const unsafeLength = <Reason extends string>(
  css: string,
  reason: Reason,
): LengthValue => rawLength(css, reason);
