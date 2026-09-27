/**
 * The styles of what `@craft-ts/component` renders on its own: the default
 * pending indicator and the skip link. Shipped with the package, and emitted
 * into every application by `craftStyle()` (which includes
 * `@craft-ts/component` by default).
 */
import {
  bg,
  color,
  craftStyles,
  fontFamily,
  fontWeight,
  int,
  interaction,
  left,
  num,
  p,
  palette,
  position,
  px,
  py,
  radii,
  radius,
  space,
  systemUiStack,
  top,
  unsafeLength,
  when,
  zIndex,
} from '@craft-ts/style';

/**
 * Both are mounted into applications the package does not know, so both are
 * isolated: emitted outside the cascade layers, out of reach of a host's
 * unlayered element styles. See `StyleSheetOptions.isolated`.
 */
export const craftPending = craftStyles(
  'craftPending',
  { root: [p(space(4)), fontFamily(systemUiStack), color(palette.text.muted)] },
  { isolated: true },
);

/**
 * Off-screen until focused, then in the top-left corner: the first thing a
 * keyboard user reaches, and nothing anybody else sees.
 */
export const craftSkipLink = craftStyles(
  'craftSkipLink',
  {
    link: [
      position.absolute,
      left(
        unsafeLength(
          '-9999px',
          'Moved off-screen, not hidden: a hidden link cannot receive focus.',
        ),
      ),
      top(space(4)),
      zIndex(int(10)),
      py(space(2)),
      px(space(3)),
      bg(palette.accent.info),
      color(palette.text.inverted),
      radius(radii.md),
      fontWeight(num(700)),
      when(interaction.focus, [left(space(4))]),
    ],
  },
  { axes: [interaction], isolated: true },
);
