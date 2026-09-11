import { craftComponent, li, span, ul, type Input } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { TIERS } from '@craft-ts/style-testing/review/frame';
import type { Messages } from './messages';

/**
 * One line of the legend, drawn from the same object that paints the frame.
 *
 * The swatch takes its colour and its border style from `TIERS`, so a legend
 * that says "dotted orange" cannot survive the outline becoming something
 * else. Kept local (not exported): it returns a Craft node directly, and
 * craft-ts/require-craft-component-for-exported-node-factory only allows
 * that for a factory private to its file.
 */
const legendEntry = (
  tier: (typeof TIERS)[keyof typeof TIERS],
  options: {
    readonly hidden?: () => Generator<unknown, boolean>;
    /** Overrides the tier's wording when the card knows something better. */
    readonly label?: () => Generator<unknown, string>;
  } = {},
) =>
  li(
    {
      class: 'tier-legend-entry',
      ...(options.hidden ? { hidden: options.hidden } : {}),
    },
    [
      span({
        class: 'tier-swatch',
        'aria-hidden': 'true',
        style: `border-color:${tier.colour};border-style:${tier.style}`,
      }),
      options.label ?? tier.label,
    ],
  );

/**
 * What the outlines drawn into the replay frame mean. Without it a reviewer
 * meets a dotted orange box around a button they never touched and has no
 * way to find out what it is telling them.
 */
export const TierLegend = craftComponent(
  'TierLegend',
  {},
  (
    showing: Input<boolean>,
    changedCount: Input<number>,
    coveredCount: Input<number>,
    chromeNames: Input<readonly string[]>,
    t: Input<Messages>,
  ) => {
    const hiddenLegend = craftComputed('hiddenLegend', function* () {
      return !(yield* showing());
    });
    const subjectLabel = craftComputed('subjectLabel', function* () {
      return (yield* t()).tierSubject;
    });
    const changedHidden = craftComputed('changedHidden', function* () {
      return (yield* changedCount()) === 0;
    });
    const changedLabel = craftComputed('changedLabel', function* () {
      return (yield* t()).tierChanged;
    });
    const occludedHidden = craftComputed('occludedHidden', function* () {
      return (yield* coveredCount()) === 0;
    });
    // Named when the replay knows the name. "Covered by the page's own
    // overlay" asked the reviewer to work out what an overlay is and which
    // one; this points at the same thing the lift control above removes.
    const occludedLabel = craftComputed('occludedLabel', function* () {
      const covering = yield* chromeNames();
      const say = yield* t();
      if (covering.length === 1) {
        return say.tierOccludedOne(covering[0] ?? '');
      }
      return covering.length > 1
        ? say.tierOccludedMany(covering.length)
        : say.tierOccludedUnknown;
    });
    const pickedLabel = craftComputed('pickedLabel', function* () {
      return (yield* t()).tierPicked;
    });

    return {
      hiddenLegend,
      subjectLabel,
      changedHidden,
      changedLabel,
      occludedHidden,
      occludedLabel,
      pickedLabel,
    };
  },
  ({
    hiddenLegend,
    subjectLabel,
    changedHidden,
    changedLabel,
    occludedHidden,
    occludedLabel,
    pickedLabel,
  }) =>
    ul({ class: 'tier-legend', hidden: hiddenLegend }, [
      legendEntry(TIERS.subject, { label: subjectLabel }),
      legendEntry(TIERS.changed, {
        hidden: changedHidden,
        label: changedLabel,
      }),
      legendEntry(TIERS.occluded, {
        hidden: occludedHidden,
        label: occludedLabel,
      }),
      legendEntry(TIERS.picked, { label: pickedLabel }),
    ]),
);
