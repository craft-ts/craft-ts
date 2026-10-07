/**
 * The frame of a page: the bar, the sidebar, the column of text, the outline.
 *
 * One column on a phone, with the sidebar as a drawer; the sidebar from `md`;
 * the outline from `lg`. The root also carries the scope: a subtree that must
 * stay dark (the Effect lessons) or light whatever the page prefers is a class
 * of data attribute here, because the foundation's rules only reach `:root`.
 */
import {
  bg,
  color,
  craftStyles,
  defineStateAxis,
  display,
  fontFamily,
  gridTemplateColumns,
  insetBlockStart,
  int,
  marginBlockEnd,
  maxBlockSize,
  maxInlineSize,
  minBlockSize,
  minInlineSize,
  position,
  provides,
  px,
  py,
  scrollPort,
  space,
  tracks,
  unit,
  when,
  zIndex,
  paddingBlockStart,
  paddingInlineEnd,
  marginInline,
} from '@craft-ts/style';
import {
  bp,
  paintDark,
  paintLight,
  sansFont,
  scope,
  theme,
} from '../foundation/herbier.style.ts';

/** Whether the page has a sidebar. A home page and a 404 do not. */
export const sidebarAxis = defineStateAxis('sidebar', ['with', 'without'] as const);

export const layoutUi = craftStyles('docLayout', {
  root: [
    display.block,
    minBlockSize(unit.vh(100)),
    bg(theme.surface),
    color(theme.ink),
    fontFamily(sansFont),
    // A forced scope re-paints every theme variable for its own subtree.
    when(scope.dark, [...paintDark]),
    when(scope.light, [...paintLight]),
  ],
  shell: [
    display.grid,
    minInlineSize(space(0)),
    when(sidebarAxis.with, [
      when(bp.md, [
        gridTemplateColumns(
          tracks.list(unit.rem(15), tracks.minmax(space(0), tracks.fr(1))),
        ),
      ]),
      when(bp.lg, [
        gridTemplateColumns(
          tracks.list(
            unit.rem(15),
            tracks.minmax(space(0), tracks.fr(1)),
            unit.rem(14),
          ),
        ),
      ]),
    ]),
  ],
  main: [
    display.block,
    minInlineSize(space(0)),
    px(space(4)),
    paddingBlockStart(space(6)),
    when(bp.md, [px(space(8))]),
  ],
  article: [
    display.block,
    maxInlineSize(unit.rem(48)),
    marginInline.auto,
  ],
  trail: [display.block, maxInlineSize(unit.rem(48)), marginInline.auto, marginBlockEnd(space(2))],
  pager: [
    display.block,
    maxInlineSize(unit.rem(48)),
    marginInline.auto,
    paddingBlockStart(space(8)),
  ],
  // The outline: a column on the right, from `lg`, that stays in view.
  outline: [
    display.none,
    when(bp.lg, [
      display.block,
      position.sticky,
      insetBlockStart(unit.rem(6)),
      maxBlockSize(unit.vh(80)),
      paddingInlineEnd(space(6)),
      py(space(6)),
      provides(scrollPort.block),
    ]),
  ],
  skip: [position.absolute, zIndex(int(60))],
});
