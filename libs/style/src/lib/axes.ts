/**
 * Les axes : les conditions sous lesquelles une règle s'applique.
 *
 * Un axe est un ensemble **fermé** livré par la lib ou construit par
 * `defineBreakpoints` / `defineStateAxis`. Jamais une chaîne : `scrollState.stuck.blockEnd`,
 * pas `scrollState.stuck('block-end')`. Une clé qui n'existe pas est une erreur
 * de compilation, pas du CSS ignoré par le navigateur.
 *
 * Chaque point porte son **driver** de test. Un axe sans driver serait pire
 * qu'un axe absent : la matrice énumérerait des scénarios inatteignables et
 * rendrait des captures identiques, donc une fausse couverture.
 */
import type { LengthValue } from './tokens/units.ts';

export type Driver =
  | { readonly kind: 'none' }
  | { readonly kind: 'emulateMedia'; readonly colorScheme: 'dark' | 'light' }
  | { readonly kind: 'resize'; readonly minInlineSize: string }
  | {
      readonly kind: 'setAttribute';
      readonly name: string;
      readonly value: string;
    }
  | { readonly kind: 'scrollToEnd' };

export interface AxisPoint<Axis extends string, Point extends string> {
  readonly axis: Axis;
  readonly point: Point;
  /** L'at-rule ou le sélecteur que l'émetteur enroulera autour de la règle. */
  readonly open: string;
  readonly driver: Driver;
}

const point = <Axis extends string, Point extends string>(
  axis: Axis,
  name: Point,
  open: string,
  driver: Driver,
): AxisPoint<Axis, Point> => ({ axis, point: name, open, driver });

/** `base` est implicite sur tout axe : c'est l'absence de condition. */
export const scheme = {
  dark: point('scheme', 'dark', '@media (prefers-color-scheme: dark)', {
    kind: 'emulateMedia',
    colorScheme: 'dark',
  }),
} as const;

export const motion = {
  reduced: point(
    'motion',
    'reduced',
    '@media (prefers-reduced-motion: reduce)',
    { kind: 'none' },
  ),
} as const;

/**
 * Breakpoints take **built conditions**, never strings: `at.minInlineSize(unit.rem(40))`
 * and not `'(min-width: 40rem)'`.
 *
 * They live under `at` because `minInlineSize` is also a CSS property in the
 * generated table. Same collision as `px` the unit versus `px` the padding
 * helper, settled the same way.
 */
export const at = {
  minInlineSize: (value: LengthValue) => ({ minInlineSize: value }),
} as const;

export function defineBreakpoints<
  const Points extends Readonly<
    Record<string, { readonly minInlineSize: LengthValue }>
  >,
>(
  points: Points,
): { readonly [K in keyof Points & string]: AxisPoint<'viewport', K> } {
  return Object.fromEntries(
    Object.entries(points).map(([name, { minInlineSize: size }]) => [
      name,
      point('viewport', name, `@media (min-width: ${size.css})`, {
        kind: 'resize',
        minInlineSize: size.css,
      }),
    ]),
  ) as never;
}

/**
 * Un axe d'état génère `data-{prefix}-{state}` — donc quelque chose que le
 * driver de test sait poser, et que le composant sait rendre. Un axe dont on ne
 * sait pas atteindre les points n'a pas sa place dans la matrice.
 */
export function defineStateAxis<
  const Prefix extends string,
  const States extends readonly string[],
>(
  prefix: Prefix,
  states: States,
): { readonly [K in States[number]]: AxisPoint<Prefix, K> } {
  return Object.fromEntries(
    states.map((state) => [
      state,
      point(prefix, state, `&[data-${prefix}='${state}']`, {
        kind: 'setAttribute',
        name: `data-${prefix}`,
        value: state,
      }),
    ]),
  ) as never;
}

export type AnyAxisPoint = AxisPoint<string, string>;
