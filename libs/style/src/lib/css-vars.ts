/**
 * CSS custom properties, typed by the `@property` grammar.
 *
 * Static → a class at build time. Dynamic → a typed custom property. No class
 * is ever computed at runtime: a value that depends on a signal goes through
 * `assign(v.x, …)`, never through a concatenated class string. That split is
 * what keeps the visual matrix finite — a variable is not an axis.
 */
import type { AnyKind, CssVarRole, CssVarSpec, ValueOf } from './kinds.ts';

export interface CssVarDeclaration {
  readonly name: `--${string}`;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string;
  readonly role: CssVarRole;
}

declare const VAR_VALUE: unique symbol;
declare const VAR_SYNTAX: unique symbol;
export declare const VAR_WRITE: unique symbol;

/**
 * A declaration that writes a custom property, carrying the kind it writes.
 *
 * The syntax rides on the type so that an axis constrained to `<color>` can be
 * checked at the call site of `when`, instead of by reading the emitted CSS
 * afterwards and hoping.
 */
export type VarWrite<Syntax extends string = string> = {
  readonly property: string;
  readonly value: string;
  readonly unproven: string;
  /**
   * **Required**, not optional. An optional marker brands nothing: a plain
   * declaration would satisfy `VarWrite<'<color>'>` structurally, and an axis
   * constrained to colours would accept `p(space(6))` while looking correct.
   * The same trap as an optional phantom on a primitive base, one level up.
   */
  readonly [VAR_WRITE]: Syntax;
};

/**
 * A variable token **carries its kind's brand**: the token of a `<color>`
 * variable is a `ColorValue`, so `color(v.ink)` needs no conversion and
 * `p(v.ink)` does not compile. It is not a generic bag of strings.
 */
export type CssVarToken<Value, Syntax extends string = string> = Value & {
  readonly declaration: CssVarDeclaration;
  /** Inference site for `assign`; nothing reads it at runtime. */
  readonly [VAR_VALUE]?: Value;
  /** Inference site for the axis write constraint. */
  readonly [VAR_SYNTAX]?: Syntax;
  /** The fallback is typed against the same kind: `.or(space(4))` will not compile. */
  or(fallback: Value): Value;
};

export type AnySpec = CssVarSpec<string, any>;

export type CssVarTokens<Specs extends Readonly<Record<string, AnySpec>>> = {
  readonly [Key in keyof Specs]: CssVarToken<
    Specs[Key]['initial'],
    Specs[Key]['syntax']
  >;
};

/**
 * Units a registered `initial-value` may not use.
 *
 * `@property` requires the initial value to be **computationally independent**:
 * it must not depend on the font size or the viewport. `initial-value: 1rem`
 * therefore makes the whole `@property` rule invalid, and the browser drops it
 * *silently* — the variable stops being registered, `var(--x)` resolves to
 * nothing, and the declaration that reads it computes to zero. Every test stays
 * green because nothing threw.
 *
 * Found the hard way on the design-system demo: the colours were registered and
 * the lengths were not, and the only symptom was buttons with no padding.
 */
const RELATIVE_UNIT =
  /\d\s*(r?em|ex|ch|cap|ic|r?lh|[sld]?v(w|h|i|b|min|max))\b/i;

const declared = new Map<string, CssVarDeclaration>();
const prefixes = new Set<string>();

/** Every custom property declared so far — the emitter's `@property` input. */
export const registeredVars = (): readonly CssVarDeclaration[] => [
  ...declared.values(),
];

/** Test-only: the registry is module state, and a spec must be able to reset it. */
export const resetCssVarRegistry = (): void => {
  declared.clear();
  prefixes.clear();
};

/**
 * The name `--{prefix}-{key}` is **derived**, never retyped — which is what
 * makes a mismatch between the declared name and the read name impossible.
 *
 * Two sheets sharing a prefix is an error rather than a merge: silently
 * merging would let one component's `--card-bg` be redefined by another's,
 * which is exactly the class of bug this package exists to remove.
 */
export function cssVars<const Specs extends Readonly<Record<string, AnySpec>>>(
  prefix: string,
  specs: Specs,
): CssVarTokens<Specs> {
  if (prefixes.has(prefix)) {
    throw new Error(
      `cssVars: prefix '${prefix}' is already declared. Two sheets sharing a prefix would redefine each other's variables; pick a prefix per sheet.`,
    );
  }
  prefixes.add(prefix);

  const tokens = Object.entries(specs).map(([key, spec]) => {
    const name = `--${prefix}-${key}` as `--${string}`;
    const initialValue = String(
      (spec.initial as { readonly css?: unknown }).css ?? spec.initial,
    );
    if (spec.syntax.includes('length') && RELATIVE_UNIT.test(initialValue)) {
      throw new Error(
        `cssVars: '${name}' registers a <length> with the initial value '${initialValue}', which is not computationally independent. @property refuses relative units there, and the browser drops the whole registration without a word — the variable then resolves to nothing wherever it is read. Give the initial value an absolute unit (unit.px(...)) and keep the relative one for what writes the variable.`,
      );
    }
    const declaration: CssVarDeclaration = {
      name,
      syntax: spec.syntax,
      inherits: spec.inherits,
      initialValue,
      role: spec.role,
    };
    declared.set(name, declaration);

    const token = {
      ...(spec.initial as object),
      css: `var(${name})`,
      declaration,
      or: (fallback: { readonly css: string }) => ({
        ...(spec.initial as object),
        css: `var(${name}, ${fallback.css})`,
      }),
    };
    return [key, token] as const;
  });

  return Object.fromEntries(tokens) as unknown as CssVarTokens<Specs>;
}

/** The `@property` block for one declaration, for the emitter. */
export const propertyRule = (declaration: CssVarDeclaration): string =>
  `@property ${declaration.name} { syntax: "${declaration.syntax}"; inherits: ${declaration.inherits}; initial-value: ${declaration.initialValue}; }`;

/**
 * Writes a variable **statically**, as part of a sheet.
 *
 * This is how an axis paints: `when(tone.danger, [set(v.bg, palette.accent.danger)])`
 * emits one atomic rule that assigns the custom property, and the base rule
 * that reads it never changes. The alternative — a class per tone per property —
 * multiplies the atoms by the number of tones for no gain.
 */
export function set<Value, Syntax extends string>(
  token: {
    readonly [VAR_VALUE]?: Value;
    readonly [VAR_SYNTAX]?: Syntax;
    readonly declaration: CssVarDeclaration;
  },
  value: Value & { readonly css: string; readonly unproven?: string },
): VarWrite<Syntax> {
  // The marker is a declared symbol: nothing is written at runtime, and the
  // object stays an ordinary declaration the sheet walker already understands.
  return {
    property: token.declaration.name,
    value: value.css,
    unproven: value.unproven ?? '',
  } as unknown as VarWrite<Syntax>;
}

/**
 * The single gateway to the dynamic side. Returns an inline style object, to be
 * bound to `style:` — readable by the existing renderer with no change, and
 * invisible to the visual matrix, because a variable is not an axis.
 */
export function assign<Value>(
  token: {
    readonly [VAR_VALUE]?: Value;
    readonly declaration: CssVarDeclaration;
  },
  value: Value & { readonly css: string },
): Readonly<Record<`--${string}`, string>> {
  // The key type is narrow on purpose: the renderer's `style:` binding accepts
  // a record of custom properties, and a plain `Record<string, string>` would
  // widen into "any CSS property", which is not what this returns.
  return { [token.declaration.name]: value.css };
}

export type { CssVarRole, ValueOf, AnyKind };
