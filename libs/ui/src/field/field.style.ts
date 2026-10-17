/**
 * A text field with its label and its hint.
 *
 * Three states are read, none drawn by hand: hover and focus are
 * `interaction.*`, a refused value is `aria-invalid` (`ariaInvalid.true`, the
 * attribute a screen reader announces), and disabled is the native one. The
 * focus ring itself is the foundation's; the 3 px halo here is the extra the
 * mock-up gives a field, an opaque tint under `interaction.focus`.
 */
import {
  ariaInvalid,
  bg,
  blockSize,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  boxShadow,
  color,
  craftStyles,
  cursor,
  display,
  font,
  fontFamily,
  fontWeight,
  inlineSize,
  interaction,
  lineWidth,
  marginBlockEnd,
  marginBlockStart,
  num,
  opacity,
  prop,
  pseudo,
  px,
  radii,
  shadow,
  text,
  transitions,
  unit,
  when,
  space,
  flexDirection,
} from '@craft-ts/style';
import {
  duration,
  ease,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

export const fieldUi = craftStyles('docField', {
  root: [display.flex, flexDirection.column, inlineSize(unit.pct(100))],
  label: [
    display.block,
    marginBlockEnd(space(2)),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.semibold),
    color(theme.ink),
  ],
  input: [
    display.block,
    inlineSize(unit.pct(100)),
    blockSize(unit.rem(2.625)),
    px(space(3)),
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    bg(theme.raised),
    color(theme.ink),
    fontFamily(sansFont),
    ...font(text.sm),
    ...transitions([prop.borderColor, prop.boxShadow], {
      duration: duration.normal,
      easing: ease,
    }),
    pseudo.placeholder([color(theme.inkSubtle), opacity(num(1))]),
    when(interaction.hover, [borderColor(theme.ink)]),
    when(interaction.focus, [
      borderColor(theme.action),
      shadow({
        spread: unit.px(3),
        y: unit.px(0),
        blur: unit.px(0),
        color: theme.focusHalo,
      }),
    ]),
    when(ariaInvalid.true, [
      borderColor(theme.danger),
      bg(theme.dangerSurface),
    ]),
    when(interaction.disabled, [
      opacity(num(0.5)),
      bg(theme.surface),
      cursor.notAllowed,
      boxShadow.none,
    ]),
  ],
  hint: [
    display.block,
    marginBlockStart(space(2)),
    ...font(text.xs),
    color(theme.inkMuted),
  ],
});
