/**
 * Les valeurs du design system, et rien d'autre.
 *
 * Chaque valeur est un **objet nominal** — `{ readonly [LENGTH]: true }` avec
 * `LENGTH` un `unique symbol` — et non un `string & { __length?: true }`. Le
 * phantom optionnel sur une base primitive ne brande rien : `'blabla'` reste
 * assignable et toute la garantie tombe en silence. C'est la panne la plus
 * coûteuse possible ici, parce qu'elle laisse tous les tests verts.
 */

declare const LENGTH: unique symbol;
declare const COLOR: unique symbol;
declare const RADIUS: unique symbol;
declare const FONT_SIZE: unique symbol;

export interface LengthValue {
  readonly [LENGTH]: true;
  readonly css: string;
  /** Non vide quand la valeur n'a pas pu être prouvée — voir `unsafeLength`. */
  readonly unproven: string;
}

export interface ColorValue {
  readonly [COLOR]: true;
  readonly css: string;
  /** La contrepartie sombre. Un token de palette porte ses deux valeurs. */
  readonly dark: string;
  readonly role: ColorRole;
}

export interface RadiusValue {
  readonly [RADIUS]: true;
  readonly css: string;
}

export interface FontSizeValue {
  readonly [FONT_SIZE]: true;
  readonly css: string;
  readonly lineHeight: string;
}

export type ColorRole = 'surface' | 'text' | 'border' | 'accent';

const length = (css: string, unproven = ''): LengthValue =>
  ({ css, unproven }) as LengthValue;

// ─── échelles fermées ───────────────────────────────────────────────────────
// `space(4.5)` ne compile pas : l'échelle est une union de littéraux, pas un
// `number`. S'il manque un pas, on l'ajoute à l'échelle — il n'y a pas
// d'équivalent au `[17px]` de Tailwind.

export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16;

const SPACE_REM: Record<SpaceStep, number> = {
  0: 0,
  1: 0.25,
  2: 0.5,
  3: 0.75,
  4: 1,
  6: 1.5,
  8: 2,
  12: 3,
  16: 4,
};

export const space = (step: SpaceStep): LengthValue =>
  length(`${SPACE_REM[step]}rem`);

/**
 * Les unités brutes sont sous un namespace, et pas au premier niveau, pour une
 * raison bête mais réelle : `px` est déjà pris par `padding-inline` côté
 * propriétés. Deux noms courts pour deux concepts différents dans le même
 * import, c'est une collision garantie — mieux vaut la trancher ici.
 */
export const unit = {
  rem: (value: number): LengthValue => length(`${value}rem`),
  px: (value: number): LengthValue => length(`${value}px`),
  em: (value: number): LengthValue => length(`${value}em`),
} as const;

/**
 * L'unique sortie de l'échelle, et elle laisse une trace.
 *
 * Sans cette porte, un agent bloqué contourne le design system entièrement.
 * Avec elle non marquée, il le contourne en silence. `unproven` remonte
 * jusqu'au graphe et rend la dette comptable.
 */
export const unsafeLength = <Reason extends string>(
  css: string,
  reason: Reason,
): LengthValue => length(css, reason);

export const radii = {
  none: { css: '0' } as RadiusValue,
  sm: { css: '0.25rem' } as RadiusValue,
  md: { css: '0.5rem' } as RadiusValue,
  full: { css: '9999px' } as RadiusValue,
} as const;

export const text = {
  sm: { css: '0.875rem', lineHeight: '1.25rem' } as FontSizeValue,
  base: { css: '1rem', lineHeight: '1.5rem' } as FontSizeValue,
  lg: { css: '1.125rem', lineHeight: '1.75rem' } as FontSizeValue,
} as const;

// ─── palette ────────────────────────────────────────────────────────────────
// Un token porte ses DEUX valeurs et son rôle. `palette.surface.raised` est une
// valeur, pas une chaîne, et le mode sombre n'est pas un second fichier à tenir
// synchronisé à la main.

const swatch = (light: string, dark: string, role: ColorRole): ColorValue =>
  ({ css: light, dark, role }) as ColorValue;

export const palette = {
  surface: {
    page: swatch('#ffffff', '#0b0d11', 'surface'),
    raised: swatch('#f6f7f9', '#151922', 'surface'),
  },
  text: {
    strong: swatch('#111318', '#f2f4f8', 'text'),
    muted: swatch('#5b6472', '#98a2b3', 'text'),
  },
  border: {
    subtle: swatch('#e3e6ea', '#232936', 'border'),
  },
  accent: {
    success: swatch('#0f7b4f', '#3ddc97', 'accent'),
    warning: swatch('#8a5a00', '#f5b544', 'accent'),
    danger: swatch('#a11b1b', '#ff6b6b', 'accent'),
  },
} as const;
