/**
 * The icons: sixteen thin-line glyphs on a 24 grid, a 1.5 stroke, round caps and
 * joins — the look of a botanical engraving — plus four the pages need.
 *
 * An icon is a **mask**, not an image: the glyph is the alpha of a data URI and
 * the colour is `currentColor`, so the theme drives it and a dark mode costs
 * nothing. There is no inline `<svg>` in a craft component (the namespace is
 * not reliable there), and a mask needs none.
 *
 * The paths live in this file because a `*.style.ts` imports vocabulary only
 * (`style-file-boundary`): it cannot reach a utility module. The name picks the
 * mask through the `icon` axis, written as `data-icon` by `DocIcon`.
 */
import {
  bg,
  blockSize,
  craftStyles,
  defineStateAxis,
  display,
  flexShrink,
  inlineSize,
  maskImage,
  maskPosition,
  maskRepeat,
  maskSize,
  num,
  space,
  unit,
  url,
  when,
} from '@craft-ts/style';
import { theme } from '../foundation/herbier.style.ts';

/** The inner markup of each glyph, in a 24 x 24 box. Stroke only. */
const GLYPHS = {
  leaf: '<path d="M5 19 C5 10 11 5 19 5 C19 13 14 19 5 19Z"/><path d="M5 19 L14 10 M10 14 V10 M12.5 11.8 L16 11.5"/>',
  spruce: '<path d="M12 3 L17 10 H14.5 L19 16.5 H13.5 V21 H10.5 V16.5 H5 L9.5 10 H7Z"/>',
  sprout: '<path d="M12 21 V11 M12 12 C12 8 9 6 4.5 6 C4.5 10 7.5 12 12 12Z M12 10 C12 6.5 14.5 4.5 19.5 4.5 C19.5 8.5 16.5 10 12 10Z"/>',
  relief: '<path d="M3 19 L9.5 8 L13 14 L15.5 10.5 L21 19Z"/><path d="M9.5 8 L11 10.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 L13.5 13.5 L8.5 15.5 L10.5 10.5Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16 L21 21"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 V13 a2 2 0 0 0 2 2 H9"/>',
  link: '<path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 -5.7 -5.7 l-1 1 M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1 -1"/>',
  check: '<path d="M5 12.5 L10 17.5 L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11 V16 M12 7.8 V8"/>',
  warning: '<path d="M12 4 L21 19.5 H3Z"/><path d="M12 10 V14 M12 16.7 V16.9"/>',
  close: '<path d="M6 6 L18 18 M18 6 L6 18"/>',
  next: '<path d="M5 12 H19 M13 6 L19 12 L13 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M18.4 5.6 L17 7 M7 17 L5.6 18.4"/>',
  moon: '<path d="M20 14 A8 8 0 1 1 10 4 A6.5 6.5 0 0 0 20 14Z"/>',
  menu: '<path d="M4 7 H20 M4 12 H20 M4 17 H14"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M9 9 L15 15 M15 9 L9 15"/>',
  previous: '<path d="M19 12 H5 M11 6 L5 12 L11 18"/>',
  chevron: '<path d="M9 6 L15 12 L9 18"/>',
  snowflake: '<path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5 M9.5 4.8 L12 7 L14.5 4.8 M9.5 19.2 L12 17 L14.5 19.2 M5 9.8 L8.1 9.5 L7.5 6.6 M19 14.2 L15.9 14.5 L16.5 17.4 M5 14.2 L8.1 14.5 L7.5 17.4 M19 9.8 L15.9 9.5 L16.5 6.6"/>',
  calendar: '<path d="M5 6.5 H19 a1 1 0 0 1 1 1 V19 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V7.5 a1 1 0 0 1 1 -1Z M4 11 H20 M8 4 V8 M16 4 V8"/>',
  external: '<path d="M14 5 H19 V10 M19 5 L11 13 M17 14 V18 a1 1 0 0 1 -1 1 H6 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 H10"/>',
} as const;

export type IconName = keyof typeof GLYPHS;

export const ICON_NAMES = Object.keys(GLYPHS) as readonly IconName[];

/** A glyph as a data URI. The stroke is black: only its alpha matters. */
const maskOf = (inner: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`,
  )}`;

/** Which glyph the mask draws. */
export const icon = defineStateAxis('icon', ICON_NAMES as readonly [IconName, ...IconName[]]);

/** How big it draws. The mock-up uses 24; a button holds 20, a line of text 16. */
export const iconSize = defineStateAxis('icon-size', ['sm', 'md', 'lg'] as const);

export const iconUi = craftStyles('docIcon', {
  root: [
    display.inlineBlock,
    flexShrink(num(0)),
    inlineSize(space(5)),
    blockSize(space(5)),
    // The colour of the text it sits in, passed down by `theme.glyph`.
    bg(theme.glyph),
    maskRepeat.noRepeat,
    maskPosition.center,
    maskSize(unit.pct(100)),
    when(iconSize.sm, [inlineSize(space(4)), blockSize(space(4))]),
    when(iconSize.lg, [inlineSize(space(6)), blockSize(space(6))]),
    ...ICON_NAMES.map((name) => when(icon[name], [maskImage(url(maskOf(GLYPHS[name])))])),
  ],
});
