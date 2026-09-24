/**
 * The dev-only type-check badge, pinned over the page.
 *
 * Its own palette rather than the lab's theme: it reports on the build, not on
 * the page, and must read the same whatever the page does with its variables.
 */
import {
  alignItems,
  animate,
  animationName,
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderTopColor,
  borderWidth,
  color,
  craftStyles,
  cssString,
  cursor,
  defineStateAxis,
  definePalette,
  display,
  easing,
  fontSize,
  fontWeight,
  gap,
  inlineSize,
  insetBlockStart,
  insetInlineEnd,
  int,
  interaction,
  keyframes,
  lineHeight,
  lineWidth,
  math,
  maxInlineSize,
  num,
  p,
  placeItems,
  position,
  pseudo,
  px,
  py,
  radii,
  radius,
  rotate,
  shadow,
  space,
  unit,
  when,
  zIndex,
} from '@craft-ts/style';

const badge = definePalette('effectTypecheck', {
  surface: {
    running: { light: '#eff6ff', dark: '#eff6ff' },
    failed: { light: '#fef2f2', dark: '#fef2f2' },
    dismissHover: { light: '#fee2e2', dark: '#fee2e2' },
    transparent: { light: 'transparent', dark: 'transparent' },
  },
  text: {
    running: { light: '#1e3a8a', dark: '#1e3a8a' },
    failed: { light: '#991b1b', dark: '#991b1b' },
  },
  border: {
    running: { light: '#bfdbfe', dark: '#bfdbfe' },
    failed: { light: '#fecaca', dark: '#fecaca' },
  },
  effect: {
    running: { light: '#1e3a8a1f', dark: '#1e3a8a1f' },
    failed: { light: '#991b1b1f', dark: '#991b1b1f' },
  },
});

/** Drives `data-typecheck` on the badge. */
export const typecheckStatus = defineStateAxis('typecheck', ['failed']);

const spin = keyframes('effectTypecheckSpin', {
  to: [rotate(unit.deg(360))],
});

export const typecheckIndicator = craftStyles('effectTypecheck', {
  root: [
    position.fixed,
    insetBlockStart(space(3)),
    insetInlineEnd(space(3)),
    zIndex(int(9999)),
    display.inlineFlex,
    alignItems.center,
    gap(space(2)),
    maxInlineSize(math.min(unit.rem(24), unit.vw(90))),
    py(space(1)),
    px(space(2)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(badge.border.running),
    radius(radii.lg),
    color(badge.text.running),
    bg(badge.surface.running),
    shadow({ y: unit.px(4), blur: unit.px(12), color: badge.effect.running }),
    fontSize(unit.rem(0.7)),
    fontWeight(num(600)),
    pseudo.before([
      pseudo.content.empty,
      inlineSize(unit.rem(0.55)),
      blockSize(unit.rem(0.55)),
      borderWidth(lineWidth.thick),
      borderStyle.solid,
      borderColor(badge.text.running),
      borderTopColor(badge.surface.transparent),
      radius(radii.full),
      animate(spin, {
        duration: unit.ms(800),
        easing: easing.linear,
        iterations: 'infinite',
      }),
      when(typecheckStatus.failed, [
        pseudo.content.text(cssString('⚠')),
        borderStyle.none,
        animationName.none,
        fontSize(unit.rem(0.8)),
      ]),
    ]),
    when(typecheckStatus.failed, [
      borderColor(badge.border.failed),
      color(badge.text.failed),
      bg(badge.surface.failed),
      shadow({ y: unit.px(4), blur: unit.px(12), color: badge.effect.failed }),
    ]),
  ],
  dismiss: [
    display.inlineGrid,
    inlineSize(unit.rem(1.25)),
    blockSize(unit.rem(1.25)),
    p(space(0)),
    placeItems.center,
    radius(radii.sm),
    color(badge.text.failed),
    bg(badge.surface.transparent),
    cursor.pointer,
    fontSize(unit.rem(1)),
    lineHeight(num(1)),
    when(interaction.hover, [bg(badge.surface.dismissHover)]),
  ],
});
