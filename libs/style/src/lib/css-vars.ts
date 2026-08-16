/**
 * Les variables CSS, typées par la grammaire de `@property`.
 *
 * Le kind n'est pas une invention : c'est exactement ce que CSS sait
 * enregistrer (`<color>`, `<length>`, `<length-percentage>`…). Inventer un kind
 * que `@property` ne connaît pas ferait sauter la garantie runtime — la valeur
 * ne serait plus validée par le navigateur.
 *
 * Statique → classe au build. Dynamique → variable CSS typée. Aucune classe
 * n'est calculée au runtime : une valeur qui dépend d'un signal passe par
 * `assign(v.x, …)`, jamais par une chaîne de classes concaténée.
 */
import type { ColorValue, LengthValue } from './values';

export interface CssVarDeclaration {
  readonly name: `--${string}`;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string;
}

/**
 * Un jeton de variable **porte la marque de son kind**. C'est ce qui fait que
 * `bg(v.ink)` marche sans conversion, et que `p(v.ink)` ne compile pas : le
 * jeton d'une variable `<color>` est une `ColorValue`, pas un fourre-tout.
 */
export type ColorVar = ColorValue & {
  readonly declaration: CssVarDeclaration;
  /** Le fallback est typé contre le même kind : `.or(space(4))` ne compile pas. */
  or(fallback: ColorValue): ColorValue;
};

export type LengthVar = LengthValue & {
  readonly declaration: CssVarDeclaration;
  or(fallback: LengthValue): LengthValue;
};

export interface ColorVarSpec {
  readonly kind: 'color';
  readonly initial: ColorValue;
}
export interface LengthVarSpec {
  readonly kind: 'length';
  readonly initial: LengthValue;
}

/**
 * Les kinds sont sous un namespace : `color` au premier niveau serait en
 * collision avec la propriété `color`, et `kind.color` dit mieux ce que c'est —
 * une grammaire `@property`, pas une déclaration.
 */
export const kind = {
  color: (initial: ColorValue): ColorVarSpec => ({ kind: 'color', initial }),
  length: (initial: LengthValue): LengthVarSpec => ({ kind: 'length', initial }),
} as const;

type VarSpec = ColorVarSpec | LengthVarSpec;
type VarOf<Spec> = Spec extends ColorVarSpec
  ? ColorVar
  : Spec extends LengthVarSpec
    ? LengthVar
    : never;

export type CssVarTokens<Specs extends Readonly<Record<string, VarSpec>>> = {
  readonly [Key in keyof Specs]: VarOf<Specs[Key]>;
};

const SYNTAX = { color: '<color>', length: '<length>' } as const;

/**
 * `inherits: false` par défaut : ça borne l'invalidation quand la variable est
 * réécrite au runtime, au lieu de faire recalculer tout le sous-arbre.
 *
 * Le nom `--{prefix}-{key}` est **dérivé**, jamais retapé — c'est ce qui rend
 * impossible le décalage entre le nom déclaré et le nom lu.
 */
export function cssVars<const Specs extends Readonly<Record<string, VarSpec>>>(
  prefix: string,
  specs: Specs,
): CssVarTokens<Specs> {
  const tokens = Object.entries(specs).map(([key, spec]) => {
    const name = `--${prefix}-${key}` as `--${string}`;
    const declaration: CssVarDeclaration = {
      name,
      syntax: SYNTAX[spec.kind],
      inherits: false,
      initialValue: spec.initial.css,
    };
    const base = {
      ...spec.initial,
      css: `var(${name})`,
      declaration,
      or: (fallback: { readonly css: string }) => ({
        ...spec.initial,
        css: `var(${name}, ${fallback.css})`,
      }),
    };
    return [key, base] as const;
  });

  return Object.fromEntries(tokens) as unknown as CssVarTokens<Specs>;
}

/** Le bloc `@property` correspondant, pour l'émetteur. */
export const propertyRule = (declaration: CssVarDeclaration): string =>
  `@property ${declaration.name} { syntax: '${declaration.syntax}'; inherits: ${declaration.inherits}; initial-value: ${declaration.initialValue}; }`;

/**
 * L'unique passerelle vers le dynamique. Retourne un style inline typé, à
 * brancher sur `style:` — donc lisible par le renderer existant sans rien
 * changer, et invisible pour la matrice de scénarios (une variable n'est pas
 * un axe).
 */
export function assign(
  token: ColorVar,
  value: ColorValue,
): Readonly<Record<string, string>>;
export function assign(
  token: LengthVar,
  value: LengthValue,
): Readonly<Record<string, string>>;
export function assign(
  token: { readonly declaration: CssVarDeclaration },
  value: { readonly css: string },
): Readonly<Record<string, string>> {
  return { [token.declaration.name]: value.css };
}
