/**
 * The mark of craft-ts: three bars crossing in an asterisk — one upright, two leaning —
 * each a gradient. The drawing is the logo's (`apps/docs/public/assets/craft-ts-logo.png`)
 * redrawn as three masks on a 512 x 512 frame, so the colours are the page's: the same
 * three shapes are painted by the theme variables of the season and of the day or night.
 *
 * Kept in a `*.style.ts` because a style file cannot import a utility module; the three
 * shapes are constants and nothing else.
 */
import {
  aspectRatio,
  bgImage,
  craftStyles,
  defineStateAxis,
  display,
  gradient,
  inset,
  inlineSize,
  maskImage,
  maskPosition,
  maskRepeat,
  maskSize,
  num,
  pointerEvents,
  position,
  unit,
  url,
  when,
} from '@craft-ts/style';
import { theme } from '../foundation/herbier.style.ts';

const svg = (body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="#000">${body}</g></svg>`,
  )}`;

/** Back to front: the bar that runs behind, the upright one, the one across them. */
const BARS = {
  // Leans down to the right, 33° from the horizontal; the lower end shows below the others.
  behind:
    '<rect transform="translate(231 312) rotate(33)" x="-230" y="-42" width="460" height="84" rx="16"/>',
  // Upright, its foot folding away to the lower left behind the bar across.
  upright:
    '<path d="M220 66 Q220 46 242 46 H288 Q310 46 310 66 V210 Q300 262 232 312 L120 400 L170 330 Q220 270 220 200 Z"/>',
  // Leans up to the right, 30° from the horizontal, over the other two.
  across:
    '<rect transform="translate(276 292) rotate(-30)" x="-228" y="-42" width="456" height="84" rx="16"/>',
} as const;

/** Which bar a layer draws. */
export const bar = defineStateAxis('bar', ['behind', 'upright', 'across'] as const);

export const logoUi = craftStyles('docLogo', {
  root: [
    display.block,
    position.relative,
    inlineSize(unit.pct(100)),
    aspectRatio(num(1)),
    pointerEvents.none,
  ],
  layer: [
    position.absolute,
    display.block,
    inset(unit.px(0)),
    maskRepeat.noRepeat,
    maskPosition.center,
    maskSize(unit.pct(100)),
    // Each gradient runs along its bar: the percentages are where the bar starts and ends on
    // the gradient line of the 512 frame, so the first colour is the bar's first end.
    when(bar.behind, [
      maskImage(url(svg(BARS.behind))),
      bgImage(
        gradient.linear(unit.deg(123), [
          [theme.logoB1, unit.pct(19)],
          [theme.logoB2, unit.pct(52)],
          [theme.logoB3, unit.pct(84)],
        ]),
      ),
    ]),
    when(bar.upright, [
      maskImage(url(svg(BARS.upright))),
      bgImage(
        gradient.linear(unit.deg(180), [
          [theme.logoA1, unit.pct(9)],
          [theme.logoA2, unit.pct(70)],
        ]),
      ),
    ]),
    when(bar.across, [
      maskImage(url(svg(BARS.across))),
      bgImage(
        gradient.linear(unit.deg(60), [
          [theme.logoC1, unit.pct(17)],
          [theme.logoC2, unit.pct(83)],
        ]),
      ),
    ]),
  ],
});
