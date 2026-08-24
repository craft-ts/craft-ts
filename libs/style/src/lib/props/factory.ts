/**
 * What the generated table is made of.
 *
 * Two shapes, and no third: a closed keyword set is a namespace object, a
 * typed value is a callable. A typo is `Property 'inlineFlexx' does not exist`,
 * never a CSS rule the browser drops on the floor.
 *
 * No signature here takes `string`. That is not a convention to remember, it is
 * what `props.spec.ts` measures generically over every export of the generated
 * file — the only form of the check that survives a regeneration.
 */
import type {
  AngleValue,
  ColorValue,
  CssStringValue,
  IdentValue,
  IntegerValue,
  LengthPercentageValue,
  LengthValue,
  NumberValue,
  PercentValue,
  TimeValue,
  UrlValue,
} from '../tokens/units';

export interface Declaration {
  readonly property: string;
  readonly value: string;
  /** Carried over from `unsafeLength`: the debt travels with the declaration. */
  readonly unproven: string;
}

export type TerminalName =
  | 'length'
  | 'percentage'
  | 'lengthPercentage'
  | 'number'
  | 'integer'
  | 'angle'
  | 'time'
  | 'color'
  | 'ident'
  | 'string'
  | 'url';

export interface TerminalValues {
  readonly length: LengthValue;
  readonly percentage: PercentValue;
  readonly lengthPercentage: LengthPercentageValue;
  readonly number: NumberValue;
  readonly integer: IntegerValue;
  readonly angle: AngleValue;
  readonly time: TimeValue;
  readonly color: ColorValue;
  readonly ident: IdentValue;
  readonly string: CssStringValue;
  readonly url: UrlValue;
}

/** `min-content` reads as `minContent`; the CSS keyword itself is never retyped. */
export type Camel<Name extends string> =
  Name extends `${infer Head}-${infer Tail}`
    ? `${Head}${Capitalize<Camel<Tail>>}`
    : Name;

export type KeywordMembers<Keywords extends string> = {
  readonly [Keyword in Keywords as Camel<Keyword>]: Declaration;
};

export type ValueProp<
  Terminals extends TerminalName,
  Keywords extends string,
> = ((value: TerminalValues[Terminals]) => Declaration) &
  KeywordMembers<Keywords>;

const camel = (name: string): string =>
  name.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());

export const declaration = (property: string, value: string): Declaration => ({
  property,
  value,
  unproven: '',
});

const members = (
  property: string,
  keywords: readonly string[],
): Record<string, Declaration> =>
  Object.fromEntries(
    keywords.map((keyword) => [camel(keyword), declaration(property, keyword)]),
  );

export function keywordProp<const Keywords extends readonly string[]>(
  property: string,
  keywords: Keywords,
): KeywordMembers<Keywords[number]> {
  return members(property, keywords) as KeywordMembers<Keywords[number]>;
}

export function valueProp<
  const Terminals extends readonly TerminalName[],
  const Keywords extends readonly string[],
>(
  property: string,
  _terminals: Terminals,
  keywords: Keywords,
): ValueProp<Terminals[number], Keywords[number]> {
  const set = (value: { readonly css: string; readonly unproven: string }) => ({
    property,
    value: value.css,
    unproven: value.unproven,
  });
  return Object.assign(
    set,
    members(property, keywords),
  ) as unknown as ValueProp<Terminals[number], Keywords[number]>;
}

declare const PROPERTY_NAME: unique symbol;

/**
 * A property *name*, for the places that name a property instead of setting it.
 *
 * The brand is **required**, not optional: an optional phantom on a string base
 * brands nothing, and `global.inherit('whatever')` would compile.
 */
export type PropertyToken<Name extends string = string> = Name & {
  readonly [PROPERTY_NAME]: true;
};

export const propertyName = <const Name extends string>(
  name: Name,
): PropertyToken<Name> => name as PropertyToken<Name>;

/**
 * The CSS-wide keywords, as tokens applied to a named property.
 *
 * `global.inherit(prop.color)` and never `color('inherit')`: a helper that
 * accepted the literal would be a helper that accepts a string, and the
 * conformance spec would be right to fail it.
 */
const globalValue = (keyword: string) => (property: PropertyToken) =>
  declaration(property, keyword);

export const global = {
  inherit: globalValue('inherit'),
  initial: globalValue('initial'),
  unset: globalValue('unset'),
  revert: globalValue('revert'),
  revertLayer: globalValue('revert-layer'),
} as const;
