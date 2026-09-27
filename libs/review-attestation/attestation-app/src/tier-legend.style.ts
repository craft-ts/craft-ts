/**
 * The key to the outlines drawn in the frozen page.
 *
 * The outlines themselves are painted into the replay by the review library,
 * from `TIERS`. A sheet cannot import that module (it is evaluated in Node,
 * with style vocabulary only), so the swatch colours are declared here and
 * `tier-legend.style.spec.ts` asserts they are `TIERS`' own: a legend that
 * drifts from what it explains fails a test instead of misleading a reviewer.
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
  defineStateAxis,
  display,
  flexWrap,
  fontSize,
  gap,
  inlineSize,
  lineWidth,
  listStyleType,
  marginBlockEnd,
  p,
  radius,
  space,
  unit,
  when,
} from '@craft-ts/style';
import { reviewUi, theme } from './review-app.style';

const same = (value: string) => ({ light: value, dark: value });

export const tierColours = definePalette('reviewTiers', {
  border: {
    subject: same('#1570ef'),
    changed: same('#d92d20'),
    occluded: same('#dc6803'),
    picked: same('#7f56d9'),
  },
});

/** Which tier a swatch stands for. Drives `data-tier`. */
export const tier = defineStateAxis('tier', [
  'subject',
  'changed',
  'occluded',
  'picked',
]);

export const tierLegend = craftStyles('tierLegend', {
  root: [
    display.flex,
    flexWrap.wrap,
    gap(unit.px(4)),
    marginBlockEnd(unit.px(10)),
    p(space(0)),
    listStyleType.none,
    fontSize(unit.px(12)),
    color(theme.textMuted),
  ],
  entry: [display.flex, alignItems.center, gap(unit.px(7))],
  swatch: [
    display.inlineBlock,
    inlineSize(unit.px(15)),
    blockSize(unit.px(11)),
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    radius(unit.px(2)),
    bg(reviewUi.surface.transparent),
    when(tier.subject, [borderColor(tierColours.border.subject)]),
    when(tier.changed, [borderColor(tierColours.border.changed)]),
    when(tier.occluded, [
      borderColor(tierColours.border.occluded),
      borderStyle.dotted,
    ]),
    when(tier.picked, [borderColor(tierColours.border.picked)]),
  ],
});
