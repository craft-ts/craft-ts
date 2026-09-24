/**
 * Writing a reason: the field, the references inside it, and the hints on the
 * decision buttons.
 *
 * Tooltips are `::after` boxes whose text is an attribute the template writes
 * (`data-paths`, `data-hint`): a native `title` waits a second, cannot be
 * styled, and stacks on top of anything drawn here.
 */
import {
  ariaInvalid,
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  bottom,
  color,
  craftStyles,
  cursor,
  defineStateAxis,
  display,
  fontFamily,
  fontSize,
  fontWeight,
  ident,
  inlineSize,
  interaction,
  left,
  lineHeight,
  lineWidth,
  maxInlineSize,
  minBlockSize,
  monospaceStack,
  num,
  overflowWrap,
  position,
  pseudo,
  px,
  py,
  radius,
  right,
  shadow,
  textAlign,
  unit,
  userSelect,
  verticalAlign,
  when,
  whiteSpace,
  zIndex,
  int,
  marginBlockEnd,
  marginInline,
} from '@craft-ts/style';
import { reviewFont, theme } from './review-app.style';

/** Whether the reason field is empty. Drives `data-reasonNote`. */
export const reasonNote = defineStateAxis('reasonNote', ['empty']);

const floating = [
  position.absolute,
  display.none,
  inlineSize.maxContent,
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(theme.lineStrong),
  bg(theme.surfaceRaised),
  shadow({ y: unit.px(10), blur: unit.px(30), color: theme.shadowStrong }),
  color(theme.textMuted),
  fontWeight(num(400)),
  lineHeight(num(1.5)),
  whiteSpace.normal,
];

export const annotation = craftStyles('reviewAnnotation', {
  /** The contenteditable reason field. Deliberately not scrollable. */
  reason: [
    minBlockSize(unit.px(92)),
    py(unit.px(9)),
    px(unit.px(11)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    radius(unit.px(7)),
    lineHeight(num(1.55)),
    whiteSpace.preWrap,
    overflowWrap.anywhere,
    color(theme.text),
    bg(theme.surfaceSunken),
    when(ariaInvalid.true, [
      borderColor(theme.danger),
      shadow({
        y: unit.px(0),
        blur: unit.px(0),
        spread: unit.px(2),
        color: theme.dangerRing,
      }),
    ]),
    pseudo.before([
      pseudo.content.empty,
      when(reasonNote.empty, [
        pseudo.content.attr(ident('data-placeholder')),
        color(theme.textDim),
      ]),
    ]),
  ],
  /** A reference to picked nodes, inside the reason. */
  chip: [
    position.relative,
    display.inlineBlock,
    marginInline(unit.px(1)),
    py(unit.px(1)),
    px(unit.px(7)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.accentBorder),
    radius(unit.px(5)),
    fontSize(unit.px(11)),
    fontWeight(num(600)),
    whiteSpace.nowrap,
    verticalAlign.baseline,
    cursor.default,
    userSelect.none,
    color(theme.accentText),
    bg(theme.accentBg),
    pseudo.after([
      pseudo.content.attr(ident('data-paths')),
      ...floating,
      zIndex(int(5)),
      bottom(unit.pct(100)),
      marginBlockEnd(unit.px(6)),
      left(unit.px(0)),
      maxInlineSize(unit.px(320)),
      py(unit.px(7)),
      px(unit.px(9)),
      radius(unit.px(6)),
      fontFamily(monospaceStack),
      fontSize(unit.px(11)),
      overflowWrap.anywhere,
      when(interaction.hover, [display.block]),
      when(interaction.focus, [display.block]),
    ]),
  ],
  /** A control explained where it is: `data-hint`, shown on hover and focus. */
  hinted: [
    position.relative,
    pseudo.after([
      pseudo.content.attr(ident('data-hint')),
      ...floating,
      zIndex(int(6)),
      bottom(unit.pct(100)),
      marginBlockEnd(unit.px(8)),
      right(unit.px(0)),
      maxInlineSize(unit.px(300)),
      py(unit.px(8)),
      px(unit.px(10)),
      radius(unit.px(7)),
      fontFamily(reviewFont),
      fontSize(unit.px(12)),
      textAlign.start,
      when(interaction.hover, [display.block]),
      when(interaction.focus, [display.block]),
    ]),
  ],
});
