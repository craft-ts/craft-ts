/**
 * CSS custom properties, typed by the `@property` grammar.
 *
 * Static → a class at build time. Dynamic → a typed custom property. No class
 * is ever computed at runtime: a value that depends on a signal goes through
 * `assign(v.x, …)`, never through a concatenated class string. That split is
 * what keeps the visual matrix finite — a variable is not an axis.
 */
import type { AnyKind, CssVarRole, CssVarSpec, ValueOf } from './kinds';

export interface CssVarDeclaration {
  readonly name: `--${string}`;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string;
  readonly role: CssVarRole;
}

declare const VAR_VALUE: unique symbol;

/**
 * A variable token **carries its kind's brand**: the token of a `<color>`
 * variable is a `ColorValue`, so `color(v.ink)` needs no conversion and
 * `p(v.ink)` does not compile. It is not a generic bag of strings.
 */
export type CssVarToken<Value> = Value & {
  readonly declaration: CssVarDeclaration;
  /** Inference site for `assign`; nothing reads it at runtime. */
  readonly [VAR_VALUE]?: Value;
  /** The fallback is typed against the same kind: `.or(space(4))` will not compile. */
  or(fallback: Value): Value;
};

export type AnySpec = CssVarSpec<string, any>;

export type CssVarTokens<Specs extends Readonly<Record<string, AnySpec>>> = {
  readonly [Key in keyof Specs]: CssVarToken<Specs[Key]['initial']>;
};

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
    const declaration: CssVarDeclaration = {
      name,
      syntax: spec.syntax,
      inherits: spec.inherits,
      initialValue: String(
        (spec.initial as { readonly css?: unknown }).css ?? spec.initial,
      ),
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
): Readonly<Record<string, string>> {
  return { [token.declaration.name]: value.css };
}

export type { CssVarRole, ValueOf, AnyKind };
