/**
 * The Herbier gallery: a titled group per component, laid out in a wrapping row.
 * Everything else — the page, the title, the text — comes from the shared
 * example sheet, which reads the same theme.
 */
import {
  alignItems,
  craftStyles,
  display,
  flexDirection,
  flexWrap,
  gap,
  space,
} from '@craft-ts/style';

export const gallery = craftStyles('herbierGallery', {
  group: [display.grid, gap(space(3))],
  row: [display.flex, flexWrap.wrap, alignItems.start, gap(space(3))],
  icon: [
    display.flex,
    flexDirection.column,
    alignItems.center,
    gap(space(1)),
  ],
});
