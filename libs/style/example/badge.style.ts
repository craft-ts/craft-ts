/**
 * À quoi ressemble un composant du design system, côté style.
 *
 * Un `*.style.ts` n'importe **que** du vocabulaire — jamais du code applicatif.
 * C'est ce qui permet au plugin de build de l'importer en Node et de lire la
 * valeur retournée pour émettre le CSS. La génération ne passe jamais par
 * l'API du typechecker : les types vérifient, les valeurs émettent.
 */
import {
  alignItems,
  at,
  bg,
  color,
  craftStyles,
  cssVars,
  defineBreakpoints,
  defineStateAxis,
  display,
  font,
  fontWeight,
  gap,
  kind,
  palette,
  px,
  py,
  radii,
  radius,
  scheme,
  space,
  text,
  unit,
  when,
} from '../src';

export const bp = defineBreakpoints({
  sm: at.minInlineSize(unit.rem(40)),
  md: at.minInlineSize(unit.rem(64)),
});

/** L'axe d'état rend `data-tone='danger'` — donc quelque chose de pilotable. */
export const tone = defineStateAxis('tone', [
  'neutral',
  'success',
  'warning',
  'danger',
] as const);

/**
 * Ce qui varie à l'exécution passe par une variable typée, pas par une classe
 * calculée. `v.ink` est une `<color>` : on peut la donner à `color()`, pas à
 * `py()`, et son fallback est typé contre le même kind.
 */
export const v = cssVars('badge', {
  ink: kind.color(palette.text.strong),
  bg: kind.color(palette.surface.raised),
});

export const badge = craftStyles('badge', {
  root: [
    display.inlineFlex,
    alignItems.center,
    gap(space(2)),
    px(space(3)),
    py(space(1)),
    radius(radii.full),
    font(text.sm),
    fontWeight.bold,
    bg(v.bg),
    color(v.ink),

    // Un seul point de l'axe viewport est utilisé : le contrat en contiendra
    // un, pas les deux que `bp` définit.
    when(bp.md, [px(space(4)), font(text.base)]),

    // La conjonction s'écrit par imbrication, et uniquement comme ça.
    when(scheme.dark, [
      color(palette.text.muted),
      when(bp.md, [fontWeight.bold]),
    ]),

    when(tone.danger, [bg(palette.accent.danger), color(palette.surface.page)]),
    when(tone.success, [
      bg(palette.accent.success),
      color(palette.surface.page),
    ]),
  ],

  dot: [display.block, radius(radii.full), bg(v.ink)],
});
