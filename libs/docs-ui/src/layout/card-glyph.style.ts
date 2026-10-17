/**
 * The emblem on the cards of the front page: a line drawing of the season.
 *
 * It belongs to the docs' front page, not to the design system, so the variable is
 * declared here and the season writes it on the root, the way the theme writes its
 * own: the classic drawing by default, one per season under `data-season`.
 */
import {
  craftGlobalStyles,
  cssVars,
  kind,
  set,
  url,
  when,
} from '@craft-ts/style';
import { season } from '@craft-ts/ui/style';
import { glyphMask } from './glyph.art.style.ts';

export const cardGlyph = cssVars('docsHome', {
  mask: kind.url(url(glyphMask('classic')), { inherits: true }),
});

craftGlobalStyles('docsHome', {
  root: [
    when(season.spring, [set(cardGlyph.mask, url(glyphMask('spring')))]),
    when(season.summer, [set(cardGlyph.mask, url(glyphMask('summer')))]),
    when(season.autumn, [set(cardGlyph.mask, url(glyphMask('autumn')))]),
    when(season.winter, [set(cardGlyph.mask, url(glyphMask('winter')))]),
  ],
});
