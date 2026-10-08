/**
 * The switch: a track and a thumb, on or off.
 *
 * It is a `button` with `role="switch"`, so it is one tab stop and Space and
 * Enter both toggle it for free. The state is `aria-checked` — what is
 * announced — and the sheet reads the `checked` axis written beside it. On is
 * not only a colour: the thumb also travels to the other end of the track.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cursor,
  defineStateAxis,
  display,
  flexShrink,
  font,
  fontFamily,
  fontWeight,
  gap,
  inlineSize,
  insetBlockStart,
  insetInlineStart,
  interaction,
  num,
  opacity,
  position,
  prop,
  pseudo,
  radii,
  space,
  text,
  transitions,
  unit,
  when,
} from '@craft-ts/style';
import {
  duration,
  ease,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** The switch is on. Written beside `aria-checked`. */
export const checked = defineStateAxis('checked', ['true'] as const);

export const switchUi = craftStyles('docSwitch', {
  row: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    color(theme.ink),
  ],
  track: [
    display.block,
    position.relative,
    flexShrink(num(0)),
    inlineSize(unit.rem(2.75)),
    blockSize(unit.rem(1.5)),
    borderRadius(radii.full),
    borderWidth(unit.px(1.5)),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    bg(theme.surface),
    cursor.pointer,
    ...transitions([prop.backgroundColor, prop.borderColor], {
      duration: duration.normal,
      easing: ease,
    }),
    // The thumb: off at the start of the track, on at its end.
    pseudo.after([
      pseudo.content.empty,
      display.block,
      position.absolute,
      insetBlockStart(unit.px(3)),
      insetInlineStart(unit.px(3)),
      inlineSize(unit.px(15)),
      blockSize(unit.px(15)),
      borderRadius(radii.full),
      bg(theme.inkSubtle),
      ...transitions([prop.insetInlineStart, prop.backgroundColor], {
        duration: duration.normal,
        easing: ease,
      }),
    ]),
    when(checked.true, [
      bg(theme.action),
      borderColor(theme.action),
      pseudo.after([
        pseudo.content.empty,
        insetInlineStart(unit.px(23)),
        bg(theme.onAction),
      ]),
    ]),
    when(interaction.disabled, [opacity(num(0.45)), cursor.notAllowed]),
  ],
});
