/**
 * The book search: what the shared example sheet does not have — a
 * full-width search field and a book row with its cover.
 */
import {
  alignItems,
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  definePalette,
  display,
  fontWeight,
  gap,
  inlineSize,
  lineWidth,
  num,
  objectFit,
  p,
  radii,
  radius,
  space,
  unit,
} from '@craft-ts/style';

const books = definePalette('bookSearch', {
  surface: { cover: { light: '#e2e8f0', dark: '#e2e8f0' } },
  text: { link: { light: '#2563eb', dark: '#2563eb' } },
  border: { row: { light: '#e2e8f0', dark: '#e2e8f0' } },
});

export const bookSearch = craftStyles('bookSearch', {
  book: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    p(space(3)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(books.border.row),
    radius(radii.lg),
  ],
  cover: [
    inlineSize(unit.px(48)),
    blockSize(unit.px(68)),
    objectFit.cover,
    bg(books.surface.cover),
  ],
  content: [display.grid, gap(space(1))],
  link: [fontWeight(num(600)), color(books.text.link)],
});
