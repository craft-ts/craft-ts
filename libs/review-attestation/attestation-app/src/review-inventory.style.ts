/**
 * The inventory views (application, bypasses, assets, visual tests,
 * templates): a padded panel, a list of bordered items, and — for the visual
 * tests — the detail of the selected one beside the list.
 */
import {
  alignItems,
  at,
  bg,
  borderBlockStartColor,
  borderBlockStartStyle,
  borderBlockStartWidth,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cursor,
  defineBreakpoints,
  defineStateAxis,
  display,
  gap,
  gridTemplateColumns,
  inlineSize,
  interaction,
  justifyContent,
  justifySelf,
  lineWidth,
  listStyleType,
  marginBlockStart,
  math,
  maxBlockSize,
  minWidth,
  p,
  paddingBlockStart,
  paddingInlineEnd,
  position,
  provides,
  radius,
  scrollPort,
  shadow,
  space,
  textAlign,
  top,
  tracks,
  unit,
  when,
  alignSelf,
} from '@craft-ts/style';
import { reviewUi, theme } from './review-app.style';

/** Whether a list item is the selected one. Drives `data-inventoryActive`. */
export const inventoryActive = defineStateAxis('inventoryActive', ['true']);

const bp = defineBreakpoints({ wide: at.minInlineSize(unit.px(901)) });

export const inventory = craftStyles('reviewInventory', {
  panel: [minWidth(unit.px(0)), p(unit.px(28)), provides(scrollPort.block)],
  /** The visual-tests panel: the list and the detail side by side when wide. */
  visualPanel: [
    display.block,
    minWidth(unit.px(0)),
    p(unit.px(28)),
    when(bp.wide, [
      display.grid,
      gridTemplateColumns(
        tracks.list(
          tracks.minmax(unit.px(240), tracks.fr(0.78)),
          tracks.minmax(unit.px(0), tracks.fr(1.22)),
        ),
      ),
      alignItems.start,
      gap(unit.px(28)),
    ]),
  ],
  list: [display.grid, gap(unit.px(10)), p(space(0)), listStyleType.none],
  /** The list beside the detail scrolls on its own when wide. */
  sideList: [
    display.grid,
    gap(unit.px(10)),
    p(space(0)),
    listStyleType.none,
    minWidth(unit.px(0)),
    when(bp.wide, [
      maxBlockSize(math.max(unit.px(240), unit.vh(80))),
      provides(scrollPort.block),
      paddingInlineEnd(unit.px(4)),
    ]),
  ],
  entry: [
    display.grid,
    gap(unit.px(6)),
    p(unit.px(14)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.line),
    radius(unit.px(10)),
    bg(theme.surface),
    when(inventoryActive.true, [
      borderColor(theme.accent),
      bg(theme.accentBg),
      shadow({
        y: unit.px(0),
        blur: unit.px(0),
        spread: unit.px(1),
        color: theme.accent,
      }),
    ]),
  ],
  item: [
    display.grid,
    gap(unit.px(6)),
    inlineSize(unit.pct(100)),
    p(space(0)),
    borderStyle.none,
    bg(reviewUi.surface.transparent),
    textAlign.start,
    cursor.pointer,
    when(interaction.hover, [color(theme.accentText)]),
  ],
  detail: [
    display.grid,
    gap(unit.px(18)),
    marginBlockStart(unit.px(28)),
    paddingBlockStart(unit.px(28)),
    borderBlockStartWidth(lineWidth.hairline),
    borderBlockStartStyle.solid,
    borderBlockStartColor(theme.line),
    minWidth(unit.px(0)),
    when(bp.wide, [
      marginBlockStart(space(0)),
      paddingBlockStart(space(0)),
      borderBlockStartStyle.none,
      position.sticky,
      top(unit.px(28)),
    ]),
  ],
  detailHeading: [
    display.flex,
    alignItems.flexStart,
    justifyContent.spaceBetween,
    gap(unit.px(18)),
  ],
  reviewLink: [justifySelf.start],
  heading: [alignSelf.start],
});
