/**
 * The small emblem on a card of the front page: one line drawing per season, a sprig for
 * the classic Herbier. Black strokes on a 24 wide frame, painted in a theme colour, so
 * a drawing serves day and night and the season only swaps which one is drawn.
 */
import type { Season } from '@craft-ts/ui/style';

const STROKE =
  'fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const petals = [0, 72, 144, 216, 288]
  .map(
    (turn) =>
      `<ellipse cx="12" cy="6.6" rx="2.9" ry="4.2" transform="rotate(${turn} 12 12)"/>`,
  )
  .join('');

const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((turn) => `<path d="M12 2.6 V5.2" transform="rotate(${turn} 12 12)"/>`)
  .join('');

const arms = [0, 60, 120]
  .map(
    (turn) =>
      `<g transform="rotate(${turn} 12 12)"><path d="M12 2.5 V21.5"/><path d="M9.6 5 L12 7.4 L14.4 5"/><path d="M9.6 19 L12 16.6 L14.4 19"/></g>`,
  )
  .join('');

/** What each season draws. The keys are the seasons and the classic one, `classic`. */
const GLYPHS: Readonly<Record<Season | 'classic', string>> = {
  // A fern frond: a stem and three pairs of leaves.
  classic: `<g ${STROKE}><path d="M6 21 C8 13 11 8 18 3"/><path d="M8.2 15.5 C5.6 15 4.4 13.6 4 11.8 C6.2 11.8 7.8 13 8.2 15.5Z"/><path d="M10.4 11.6 C7.8 11.2 6.8 9.8 6.4 8 C8.6 8 10 9.2 10.4 11.6Z"/><path d="M8.8 15.8 C11.4 16.6 13.4 16 14.6 14.4 C12.4 13.4 10.2 13.8 8.8 15.8Z"/><path d="M12.4 11 C14.6 11.6 16.4 11 17.4 9.4 C15.4 8.6 13.6 9 12.4 11Z"/></g>`,
  // A blossom: five petals around a heart.
  spring: `<g ${STROKE}>${petals}<circle cx="12" cy="12" r="1.7"/></g>`,
  // A sun: a disc and eight rays.
  summer: `<g ${STROKE}><circle cx="12" cy="12" r="4.2"/>${rays}</g>`,
  // A leaf that has turned: its outline, its vein and its stalk.
  autumn: `<g ${STROKE}><path d="M5 19 C4.4 10.4 10 4.6 20 4 C20.4 13.4 15.2 19.4 5 19Z"/><path d="M3.6 20.6 L13 11"/><path d="M9.6 14.6 H12.4"/><path d="M12.2 11.8 V9"/></g>`,
  // A snowflake: three arms across, each with its two small branches.
  winter: `<g ${STROKE}>${arms}</g>`,
};

/** The emblem of one season (or of the classic Herbier), as a data URI whose alpha is the drawing. */
export const glyphMask = (season: Season | 'classic'): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${GLYPHS[season]}</svg>`,
  )}`;
