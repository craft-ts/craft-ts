/**
 * Toasts: short messages that arrive, wait, and leave on their own.
 *
 * A toast is a card with the tone's edge and a line along its foot that runs
 * out over the time it stays — the delay is something you can see. The entrance
 * is a fade and a slide of 20 px; under reduced motion the foundation collapses
 * both to nothing, and the line is the only thing that still says "temporary",
 * so the dismiss button is always there too.
 */
import {
  alignItems,
  animate,
  cursor,
  flexShrink,
  interaction,
  justifyContent,
  when,
  bg,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  display,
  easing,
  flexDirection,
  flexGrow,
  font,
  fontFamily,
  fontWeight,
  gap,
  inlineSize,
  blockSize,
  insetBlockEnd,
  insetInlineEnd,
  insetInlineStart,
  keyframes,
  lineWidth,
  math,
  maxInlineSize,
  num,
  opacity,
  p,
  pointerEvents,
  position,
  pseudo,
  radii,
  set,
  shadow,
  space,
  text,
  unit,
  zIndex,
  int,
  paddingInlineStart,
  paddingInlineEnd,
  paddingBlockStart,
  paddingBlockEnd,
} from '@craft-ts/style';
import {
  ease,
  sansFont,
  theme,
  toneRules,
  toneVars,
  weight,
} from '../foundation/herbier.style.ts';

/** How long a toast stays, in milliseconds. The line along its foot runs for this long. */
export const TOAST_MS = 8000;

const slideIn = keyframes('herbierToast', {
  from: [opacity(num(0)), insetInlineStart(unit.px(20))],
  to: [opacity(num(1)), insetInlineStart(unit.px(0))],
});

const runOut = keyframes('herbierToastLine', {
  from: [inlineSize(unit.pct(100))],
  to: [inlineSize(unit.pct(0))],
});

export const toastUi = craftStyles('docToast', {
  region: [
    display.flex,
    flexDirection.column,
    gap(space(3)),
    position.fixed,
    insetBlockEnd(space(6)),
    insetInlineEnd(space(6)),
    inlineSize(math.min(unit.rem(24), unit.pct(100))),
    maxInlineSize(unit.pct(100)),
    zIndex(int(50)),
    // The region itself never catches a click meant for the page behind it.
    pointerEvents.none,
  ],
  root: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    position.relative,
    paddingBlockStart(space(3)),
    paddingBlockEnd(unit.rem(0.875)),
    paddingInlineStart(unit.rem(0.875)),
    paddingInlineEnd(space(2)),
    borderRadius(radii.md),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(toneVars.border),
    bg(theme.raised),
    color(theme.ink),
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.medium),
    shadow({ y: unit.px(12), blur: unit.px(26), color: theme.shadow }),
    pointerEvents.auto,
    ...animate(slideIn, {
      duration: unit.ms(700),
      easing: ease,
      fillMode: 'backwards',
    }),
    ...toneRules,
    set(theme.glyph, toneVars.ink),
    // The line that runs out.
    pseudo.before([
      pseudo.content.empty,
      position.absolute,
      insetInlineStart(space(2)),
      insetBlockEnd(unit.px(0)),
      blockSize(lineWidth.thick),
      bg(toneVars.ink),
      opacity(num(0.7)),
      ...animate(runOut, {
        duration: unit.ms(TOAST_MS),
        easing: easing.linear,
        fillMode: 'forwards',
      }),
    ]),
  ],
  message: [flexGrow(num(1)), p(space(0))],
  // The 32 px close button: no outline at rest, a sage wash on hover.
  close: [
    display.inlineFlex,
    alignItems.center,
    justifyContent.center,
    flexShrink(num(0)),
    inlineSize(unit.rem(2)),
    blockSize(unit.rem(2)),
    borderRadius(radii.sm),
    bg(theme.clear),
    borderWidth(unit.px(0)),
    color(theme.inkMuted),
    cursor.pointer,
    set(theme.glyph, theme.inkMuted),
    when(interaction.hover, [
      bg(theme.selected),
      color(theme.ink),
      set(theme.glyph, theme.ink),
    ]),
  ],
});

