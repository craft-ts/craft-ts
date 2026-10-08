/**
 * The button: five variants, every state, one class.
 *
 * The variant arrives as `data-variant`; the sheet answers it by writing three
 * local variables (fill, ink, edge) and the states nest under it — hover and
 * pressed are `interaction.*` points, so the visual matrix captures them and
 * the contrast proof crosses each fill with its ink. Nothing here is a
 * hand-written `:hover`, and nothing draws a focus ring: the foundation draws
 * one on every `:focus-visible` (`craft.base`).
 *
 * The press is a 1 px settle, written with `inset-block-start` on a relatively
 * positioned box: the vocabulary has no typed `transform`.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderInlineEndColor,
  borderRadius,
  borderStyle,
  borderWidth,
  boxShadow,
  color,
  craftStyles,
  cssVars,
  cursor,
  defineStateAxis,
  display,
  font,
  fontFamily,
  fontWeight,
  gap,
  insetBlockStart,
  inlineSize,
  interaction,
  justifyContent,
  keyframes,
  animate,
  kind,
  lineWidth,
  maxInlineSize,
  num,
  opacity,
  position,
  prop,
  pseudo,
  px,
  radii,
  rotate,
  set,
  shadow,
  space,
  text,
  textDecoration,
  textDecorationThickness,
  textUnderlineOffset,
  transitions,
  unit,
  whiteSpace,
  when,
  easing,
} from '@craft-ts/style';
import {
  duration,
  ease,
  herbier,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** primary, tonal, secondary, danger, link. */
export const variant = defineStateAxis('variant', [
  'primary',
  'tonal',
  'secondary',
  'danger',
  'link',
] as const);

/** A button waiting for a result. `aria-busy` says it; this paints it. */
export const loading = defineStateAxis('loading', ['true'] as const);

const spin = keyframes('herbierSpin', {
  from: [rotate(unit.deg(0))],
  to: [rotate(unit.deg(360))],
});

const v = cssVars('docButton', {
  fill: kind.color(herbier.accent.action),
  ink: kind.color(herbier.accent.onAction),
  edge: kind.color(herbier.accent.action),
});

/** What every pressable thing of the system shares: a settle, a soft shadow. */
const lift = shadow({ y: unit.px(8), blur: unit.px(18), color: theme.shadow });

export const buttonUi = craftStyles(
  'docButton',
  {
    root: [
      display.inlineFlex,
      alignItems.center,
      justifyContent.center,
      gap(space(2)),
      inlineSize(unit.pct(100)),
      maxInlineSize(unit.rem(10.75)),
      blockSize(unit.rem(2.625)),
      px(unit.rem(0.875)),
      position.relative,
      borderRadius(radii.md),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(v.edge),
      bg(v.fill),
      color(v.ink),
      fontFamily(sansFont),
      ...font(text.sm),
      fontWeight(weight.semibold),
      whiteSpace.nowrap,
      textDecoration.none,
      cursor.pointer,
      boxShadow.none,
      ...transitions(
        [prop.backgroundColor, prop.borderColor, prop.boxShadow, prop.insetBlockStart],
        { duration: duration.normal, easing: ease },
      ),
      set(theme.glyph, v.ink),

      // primary: spruce fill, deepening on hover and press.
      set(v.fill, theme.action),
      set(v.ink, theme.onAction),
      set(v.edge, theme.action),
      when(variant.primary, [
        when(interaction.hover, [
          set(v.fill, theme.actionHover),
          set(v.edge, theme.actionHover),
          lift,
        ]),
        when(interaction.active, [
          set(v.fill, theme.actionActive),
          set(v.edge, theme.actionActive),
          boxShadow.none,
        ]),
      ]),

      // tonal: sage fill, spruce ink.
      when(variant.tonal, [
        set(v.fill, theme.selected),
        set(v.ink, theme.link),
        set(v.edge, theme.selected),
        when(interaction.hover, [
          set(v.fill, theme.selectedHover),
          set(v.edge, theme.selectedHover),
        ]),
        when(interaction.active, [
          set(v.fill, theme.selectedActive),
          set(v.edge, theme.selectedActive),
        ]),
      ]),

      // secondary: a card-coloured fill and a visible outline. Never clear:
      // a clear fill lets whatever sits behind the button show through.
      when(variant.secondary, [
        set(v.fill, theme.raised),
        set(v.ink, theme.ink),
        set(v.edge, theme.lineStrong),
        when(interaction.hover, [
          set(v.fill, theme.selected),
          set(v.edge, theme.action),
        ]),
        when(interaction.active, [
          set(v.fill, theme.selectedHover),
          set(v.edge, theme.action),
        ]),
      ]),

      // danger: wine fill, same ink as the primary.
      when(variant.danger, [
        set(v.fill, theme.danger),
        set(v.ink, theme.onAction),
        set(v.edge, theme.danger),
        when(interaction.hover, [
          set(v.fill, theme.dangerHover),
          set(v.edge, theme.dangerHover),
          lift,
        ]),
        when(interaction.active, [
          set(v.fill, theme.dangerActive),
          set(v.edge, theme.dangerActive),
          boxShadow.none,
        ]),
      ]),

      // link: text only, underlined; the one variant with no fill.
      when(variant.link, [
        set(v.fill, theme.clear),
        set(v.ink, theme.link),
        set(v.edge, theme.clear),
        textDecoration.underline,
        textUnderlineOffset(unit.px(4)),
        textDecorationThickness(unit.px(1)),
        when(interaction.hover, [
          set(v.ink, theme.ink),
          textDecorationThickness(unit.px(2)),
        ]),
      ]),

      // pressed: a 1 px settle, for every variant but the link.
      when(interaction.active, [insetBlockStart(unit.px(1))]),

      when(interaction.disabled, [
        opacity(num(0.45)),
        cursor.notAllowed,
        boxShadow.none,
        insetBlockStart(unit.px(0)),
      ]),

      when(loading.true, [
        cursor.progress,
        pseudo.before([
          pseudo.content.empty,
          display.inlineBlock,
          inlineSize(unit.px(15)),
          blockSize(unit.px(15)),
          borderWidth(lineWidth.thick),
          borderStyle.solid,
          borderColor(v.ink),
          borderInlineEndColor(theme.clear),
          borderRadius(radii.full),
          ...animate(spin, {
            duration: unit.ms(800),
            easing: easing.linear,
            iterations: 'infinite',
          }),
        ]),
      ]),
    ],
  },
  { axes: [variant, loading, { hover: interaction.hover }, { active: interaction.active }, { disabled: interaction.disabled }] },
);

/**
 * The square button that holds only a glyph: close, copy, theme, menu. It has
 * no label, so the component demands an accessible name instead.
 */
export const iconButtonUi = craftStyles('docIconButton', {
  root: [
    display.inlineFlex,
    alignItems.center,
    justifyContent.center,
    inlineSize(unit.rem(2.625)),
    blockSize(unit.rem(2.625)),
    position.relative,
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    bg(theme.raised),
    color(theme.ink),
    cursor.pointer,
    ...transitions([prop.backgroundColor, prop.borderColor, prop.insetBlockStart], {
      duration: duration.normal,
      easing: ease,
    }),
    set(theme.glyph, theme.ink),
    when(interaction.hover, [
      bg(theme.selected),
      borderColor(theme.action),
    ]),
    when(interaction.active, [
      bg(theme.selectedHover),
      insetBlockStart(unit.px(1)),
    ]),
    when(interaction.disabled, [
      opacity(num(0.45)),
      cursor.notAllowed,
      insetBlockStart(unit.px(0)),
    ]),
  ],
});
