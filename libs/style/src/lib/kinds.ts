/**
 * Custom-property kinds, modelled after the `@property` grammar itself.
 *
 * A kind is not an invention: it is exactly what CSS knows how to register
 * (`<color>`, `<length>`, `<length-percentage>`, `+`, `#`, `|`). Inventing a
 * kind `@property` does not know would break the runtime half of the
 * guarantee — the browser would stop validating the value, and a variable
 * assigned a length where a colour was expected would simply paint nothing.
 *
 * A kind is **callable**: `kind.color(palette.text.strong)` builds the spec
 * `cssVars` wants, while `kind.color` on its own is the grammar that `many`,
 * `csv` and the axis `writes` constraint operate on. One name for one concept,
 * used in both positions.
 *
 * The assignability lattice is **not** a second table kept in sync with the
 * brands. It reads the brands: an integer carries the number brand, so
 * `<integer>` flows into `<number>`; `<length-percentage>` is a union, so
 * `<length>` flows into it and not the other way round. A table would be one
 * more thing that can silently disagree with reality.
 */
import type {
  AngleValue,
  ColorRole,
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
} from './tokens/units';

export type CssVarRole = ColorRole;

export interface CssVarOptions {
  readonly role?: CssVarRole;
  /**
   * `false` by default: it bounds invalidation when the variable is rewritten
   * at runtime instead of making the whole subtree recompute.
   */
  readonly inherits?: boolean;
}

export interface CssVarSpec<Syntax extends string, Value> {
  readonly syntax: Syntax;
  readonly initial: Value;
  readonly role: CssVarRole;
  readonly inherits: boolean;
}

export interface CssVarKind<Syntax extends string, Value> {
  (initial: Value, options?: CssVarOptions): CssVarSpec<Syntax, Value>;
  readonly syntax: Syntax;
  /** Type-only inference site; nothing reads it at runtime. */
  readonly __value?: Value;
}

const roleOf = (initial: unknown): CssVarRole => {
  const role = (initial as { readonly role?: CssVarRole } | null)?.role;
  return role ?? 'none';
};

function kindOf<Syntax extends string, Value>(
  syntax: Syntax,
): CssVarKind<Syntax, Value> {
  const build = (initial: Value, options?: CssVarOptions) => ({
    syntax,
    initial,
    role: options?.role ?? roleOf(initial),
    inherits: options?.inherits ?? false,
  });
  return Object.assign(build, { syntax }) as CssVarKind<Syntax, Value>;
}

export const kind = {
  color: kindOf<'<color>', ColorValue>('<color>'),
  length: kindOf<'<length>', LengthValue>('<length>'),
  percentage: kindOf<'<percentage>', PercentValue>('<percentage>'),
  lengthPercentage: kindOf<'<length-percentage>', LengthPercentageValue>(
    '<length-percentage>',
  ),
  number: kindOf<'<number>', NumberValue>('<number>'),
  integer: kindOf<'<integer>', IntegerValue>('<integer>'),
  angle: kindOf<'<angle>', AngleValue>('<angle>'),
  time: kindOf<'<time>', TimeValue>('<time>'),
  ident: kindOf<'<custom-ident>', IdentValue>('<custom-ident>'),
  string: kindOf<'<string>', CssStringValue>('<string>'),
  url: kindOf<'<url>', UrlValue>('<url>'),
} as const;

export type AnyKind = CssVarKind<string, any>;

export type ValueOf<Kind> =
  Kind extends CssVarKind<string, infer Value> ? Value : never;

export type SyntaxOf<Kind> =
  Kind extends CssVarKind<infer Syntax, any> ? Syntax : never;

/**
 * `<a>+` — a space-separated list of at least one.
 *
 * The value type is a non-empty tuple rather than an array so that `many(kind.length)`
 * cannot be satisfied by `[]`, which registers as an invalid value at runtime.
 */
export const many = <Kind extends AnyKind>(
  of: Kind,
): CssVarKind<
  `${SyntaxOf<Kind>}+`,
  readonly [ValueOf<Kind>, ...ValueOf<Kind>[]]
> => kindOf(`${of.syntax}+`) as never;

/** `<a>#` — a comma-separated list of at least one. */
export const csv = <Kind extends AnyKind>(
  of: Kind,
): CssVarKind<
  `${SyntaxOf<Kind>}#`,
  readonly [ValueOf<Kind>, ...ValueOf<Kind>[]]
> => kindOf(`${of.syntax}#`) as never;

/**
 * `a | b | c` — a closed keyword set, registered as such.
 *
 * The keywords are the *values*: `oneOf('auto', 'none')` accepts `'auto'` and
 * nothing else. This is the one place a string literal is a legitimate value,
 * because the grammar itself is a set of literals and the union is closed.
 */
export const oneOf = <const Keywords extends readonly [string, ...string[]]>(
  ...keywords: Keywords
): CssVarKind<string, Keywords[number]> => kindOf(keywords.join(' | '));

/**
 * Can a value of kind `From` be written into a variable of kind `To`?
 *
 * Read off the brands, so it cannot drift from what the values actually are.
 */
export type Assignable<From extends AnyKind, To extends AnyKind> = [
  ValueOf<From>,
] extends [ValueOf<To>]
  ? true
  : false;
