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
import { theme } from '@craft-ts/ui/style';

/** The Herbier theme, under the names this sheet uses. */
const books = {
  surface: { cover: theme.line },
  text: { link: theme.link },
  border: { row: theme.line },
};

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
