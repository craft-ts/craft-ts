/**
 * The dialog: a native `<dialog>` opened modally, so the browser owns the focus
 * trap, the Escape key and the inert page behind it. What this sheet owns is the
 * look: a raised card, a scrim behind it, a header with the title and a close
 * button.
 *
 * The scrim is `::backdrop`, painted with the ink at 40 % opacity. Opacity is
 * its own property, so it needs no alpha in the colour — the vocabulary refuses
 * one.
 */
import {
  alignItems,
  bg,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  borderColor,
  borderRadius,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  display,
  flexGrow,
  font,
  fontFamily,
  fontWeight,
  gap,
  inlineSize,
  justifyContent,
  lineWidth,
  marginBlock,
  marginInline,
  math,
  maxBlockSize,
  maxInlineSize,
  num,
  opacity,
  p,
  paddingInlineStart,
  paddingInlineEnd,
  paddingBlockStart,
  paddingBlockEnd,
  provides,
  pseudo,
  radii,
  scrollPort,
  space,
  text,
  unit,
  fontSize,
  lineHeight,
} from '@craft-ts/style';
import {
  fading,
  displayFont,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

export const dialogUi = craftStyles('docDialog', {
  root: [
    // No `display` here: a closed dialog is `display: none` by the browser's own rule, and
    // an author `display: block` would beat it and show the closed dialog at the foot of
    // the page — with its autofocus field, which then takes the focus and the scroll.
    inlineSize(math.min(unit.rem(36), unit.pct(100))),
    maxInlineSize(unit.pct(92)),
    maxBlockSize(unit.pct(86)),
    marginInline.auto,
    marginBlock.auto,
    p(space(0)),
    borderRadius(radii.lg),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    bg(theme.raised),
    color(theme.ink),
    fontFamily(sansFont),
    ...font(text.sm),
    ...fading,
    pseudo.backdrop([bg(theme.ink), opacity(num(0.4))]),
  ],
  header: [
    display.flex,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(3)),
    paddingBlockStart(space(4)),
    paddingBlockEnd(space(3)),
    paddingInlineStart(space(5)),
    paddingInlineEnd(space(3)),
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
  ],
  title: [
    flexGrow(num(1)),
    fontFamily(displayFont),
    fontSize(unit.rem(1.4375)),
    lineHeight(num(1.2)),
    fontWeight(weight.medium),
    color(theme.ink),
  ],
  body: [
    display.block,
    paddingBlockStart(space(4)),
    paddingBlockEnd(space(5)),
    paddingInlineStart(space(5)),
    paddingInlineEnd(space(5)),
    maxBlockSize(unit.vh(60)),
    provides(scrollPort.block),
  ],
});
