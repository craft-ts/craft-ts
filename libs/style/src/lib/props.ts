/**
 * Les propriétés CSS, typées par ce qu'elles acceptent.
 *
 * ESQUISSE — la vraie table est **générée** depuis les données MDN/webref, ce
 * qui est la seule façon de garantir qu'aucun mot-clé n'a été inventé. Ce qui
 * compte ici, c'est la forme : aucune signature ne prend `string`, et un
 * ensemble fermé est un accès par propriété (`display.flex`), jamais une chaîne.
 *
 * `overflow` est **volontairement absent**, et le restera dans la table
 * générée : le seul chemin vers `overflow: auto` passe par
 * `provides(scrollPort.block)`, qui pose l'effet CSS et la décharge dans le même
 * objet. Le mauvais correctif doit être inexprimable, pas seulement découragé.
 */
import type {
  ColorValue,
  FontSizeValue,
  LengthValue,
  RadiusValue,
} from './values';

export interface Declaration {
  readonly property: string;
  readonly value: string;
  /** Propagé depuis `unsafeLength` — la dette voyage avec la déclaration. */
  readonly unproven: string;
}

const decl = (
  property: string,
  value: { readonly css: string; readonly unproven?: string },
): Declaration => ({
  property,
  value: value.css,
  unproven: value.unproven ?? '',
});

// ─── espacement ─────────────────────────────────────────────────────────────

export const p = (value: LengthValue): Declaration => decl('padding', value);
export const px = (value: LengthValue): Declaration =>
  decl('padding-inline', value);
export const py = (value: LengthValue): Declaration =>
  decl('padding-block', value);
export const gap = (value: LengthValue): Declaration => decl('gap', value);
export const inlineSize = (value: LengthValue): Declaration =>
  decl('inline-size', value);
export const blockSize = (value: LengthValue): Declaration =>
  decl('block-size', value);

// ─── couleur ────────────────────────────────────────────────────────────────
// Une couleur accepte un token de palette OU une variable CSS de kind `<color>`.
// Elle n'accepte pas une longueur, et surtout pas `'red'`.

export const bg = (value: ColorValue): Declaration =>
  decl('background-color', value);
export const color = (value: ColorValue): Declaration => decl('color', value);
export const borderColor = (value: ColorValue): Declaration =>
  decl('border-color', value);

export const radius = (value: RadiusValue): Declaration =>
  decl('border-radius', value);

export const font = (value: FontSizeValue): Declaration[] => [
  decl('font-size', value),
  { property: 'line-height', value: value.lineHeight, unproven: '' },
];

// ─── ensembles fermés : accès par propriété, jamais une chaîne ──────────────
// Une faute de frappe est `Property 'inlineFlexx' does not exist`, pas une
// règle CSS silencieusement ignorée par le navigateur.

const keyword = (property: string, value: string): Declaration => ({
  property,
  value,
  unproven: '',
});

export const display = {
  block: keyword('display', 'block'),
  flex: keyword('display', 'flex'),
  inlineFlex: keyword('display', 'inline-flex'),
  grid: keyword('display', 'grid'),
  none: keyword('display', 'none'),
} as const;

export const position = {
  static: keyword('position', 'static'),
  relative: keyword('position', 'relative'),
  absolute: keyword('position', 'absolute'),
  sticky: keyword('position', 'sticky'),
  fixed: keyword('position', 'fixed'),
} as const;

export const align = {
  start: keyword('align-items', 'flex-start'),
  center: keyword('align-items', 'center'),
  baseline: keyword('align-items', 'baseline'),
} as const;

export const fontWeight = {
  regular: keyword('font-weight', '400'),
  medium: keyword('font-weight', '500'),
  bold: keyword('font-weight', '700'),
} as const;

/** Les globaux passent par ici, jamais par un littéral accepté par un helper. */
export const global = {
  inherit: 'inherit',
  initial: 'initial',
  unset: 'unset',
  revert: 'revert',
  revertLayer: 'revert-layer',
} as const;
