/**
 * The mini design system, assembled.
 *
 * Everything on this page goes through `@craft-ts/style`: no `styles` block, no
 * class string built at render time, no CSS shipped by a component. The whole
 * stylesheet was emitted at build time from the two `*.style.ts` files next to
 * this one, deduplicated with every other sheet in the app.
 *
 * Four things are worth opening the devtools for:
 *
 * 1. **The classes are atomic.** A card carries a dozen short class names, and
 *    every other card in the app carries the same ones. The stylesheet grows
 *    with the vocabulary, not with the number of components.
 * 2. **Variants are attributes.** Change the tone and watch `data-tone` change
 *    while the class list stays put. That is what makes the set of visual
 *    states enumerable — wave 2 turns it into a scenario matrix.
 * 3. **Dark mode is one rule.** `dsTheme.root` writes the theme variables, and
 *    `when(scheme.dark, …)` rewrites them once. No component below it mentions
 *    dark mode. Flip the OS setting and the page follows.
 * 4. **What moves at runtime is a variable.** The meter's width comes from a
 *    signal through a registered `<percentage>` property, because a width that
 *    depends on state cannot be a class.
 */
import {
  craftComponent,
  div,
  p,
  section,
  span,
  heading,
} from '@craft-ts/component';
import { craftComputed, state } from '@craft-ts/core';
import { card, stack } from './components.style';
import { dsTheme } from './foundation.style';
import {
  DsAlert,
  DsButton,
  DsGhostButton,
  DsMeter,
  type Size,
  type Tone,
} from './ds-components';

const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] satisfies Tone[];
const SIZES = ['sm', 'md', 'lg'] satisfies Size[];
const initialShowcase = (): { tone: Tone; size: Size; progress: number } => ({
  tone: 'info',
  size: 'md',
  progress: 40,
});

/**
 * A constant, as an input.
 *
 * Inputs are yieldables, not values — that is what lets a component read one
 * without knowing whether it came from a signal or from a literal. A constant
 * is just the boring case.
 */
const constant = <Value>(value: Value) =>
  function* () {
    return value;
  };

export const designSystemDemo = craftComponent(
  'designSystemDemo',
  { host: { class: 'design-system-host' } },
  () =>
    state(
      'showcase',
      initialShowcase(),
      ({ state: showcase, update }) => ({
        tone: craftComputed('tone', function* () {
          return (yield* showcase()).tone;
        }),
        size: craftComputed('size', function* () {
          return (yield* showcase()).size;
        }),
        progress: craftComputed('progress', function* () {
          return (yield* showcase()).progress;
        }),
        pickTone: (tone: Tone) => update((current) => ({ ...current, tone })),
        pickSize: (size: Size) => update((current) => ({ ...current, size })),
        nudge: () =>
          update((current) => ({
            ...current,
            progress: current.progress >= 100 ? 0 : current.progress + 10,
          })),
      }),
    ),
  (showcase) =>
    // One class on the wrapper, and the whole subtree is themed. Remove it and
    // every colour below falls back to the `@property` initial value — which
    // is a defined behaviour, not an unstyled page.
    div({ class: dsTheme.root }, [
      section({ class: stack.column }, [
        heading('A mini design system'),
        p(
          'Tokens, axes and sheets from @craft-ts/style. No component on this page ships CSS.',
        ),

        // ── tone ─────────────────────────────────────────────────────────
        div({ class: card.root }, [
          heading({ class: card.title }, 'Tone is an axis, not a class name'),
          p(
            { class: card.body },
            'The buttons below share one class. What changes is the data-tone attribute — which is also what a visual test will drive.',
          ),
          // A static list needs no `each`: the five tones are known at build
          // time, so five component nodes is the honest shape.
          div(
            { class: stack.wrap },
            TONES.map((tone) =>
              DsButton({
                label: constant(tone),
                tone: constant(tone),
                size: showcase.size,
                press: function* () { yield* showcase.pickTone(tone); },
              }),
            ),
          ),
          div({ class: card.footer }, [
            span({ class: card.body }, function* () {
              return `selected: ${yield* showcase.tone()}`;
            }),
          ]),
        ]),

        // ── size ─────────────────────────────────────────────────────────
        div({ class: card.root }, [
          heading({ class: card.title }, 'Density is a second axis'),
          p(
            { class: card.body },
            'Size writes the padding variables the base rule already reads. Three rules, not three copies of the button.',
          ),
          div(
            { class: stack.wrap },
            SIZES.map((size) =>
              DsButton({
                label: constant(size),
                tone: showcase.tone,
                size: constant(size),
                press: function* () { yield* showcase.pickSize(size); },
              }),
            ),
          ),
        ]),

        // ── alert ────────────────────────────────────────────────────────
        div({ class: card.root }, [
          heading({ class: card.title }, 'One variable, five variants'),
          p(
            { class: card.body },
            'The alert border reads --ds-alert-accent. Each tone writes it once; the rule that reads it is never repeated.',
          ),
          DsAlert({
            message: constant(
              'This banner takes its accent from the selected tone.',
            ),
            tone: showcase.tone,
          }),
        ]),

        // ── meter ────────────────────────────────────────────────────────
        div({ class: card.root }, [
          heading({ class: card.title }, 'What moves at runtime is a variable'),
          p({ class: card.body }, [
            'The fill width comes from a signal, so it cannot be a class. It goes through ',
            span('--ds-meter-value'),
            ', a registered percentage custom property.',
          ]),
          DsMeter({ value: showcase.progress, caption: constant('Upload') }),
          div({ class: card.footer }, [
            DsGhostButton({
              label: constant('Advance'),
              press: showcase.nudge,
            }),
          ]),
        ]),
      ]),
    ]),
);

export default designSystemDemo;
