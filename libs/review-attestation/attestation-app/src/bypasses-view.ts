import {
  button,
  craftComponent,
  div,
  forNode,
  ifNode,
  li,
  p,
  pre,
  section,
  small,
  span,
  strong,
  ul,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import type {
  BypassInventoryItem,
  StyleAdoption,
} from '@craft-ts/dev-tools/attestation-review';
import { BypassRuleFilter } from './bypass-rule-filter.service';
import {
  BypassCardEvidenceView,
  BypassesViewModel,
  provideBypassCardEvidenceView,
  provideBypassesViewModel,
} from './bypasses-view.service';
import { bypassesView } from './bypasses-view.style';
import type { Messages } from './messages';

/**
 * Every deliberate bypass of the design system and of the architecture rules,
 * with the reason it gives — and how far the design system has reached.
 *
 * Reading this view is what lets a reviewer attest that `@craft-ts/style` is
 * the way components are styled: the number says how many are on it, the list
 * says what is not, and each exception carries the reason somebody wrote.
 */
export const BypassesView = craftComponent(
  'BypassesView',
  {},
  (inputs: {
    readonly bypasses: Input<readonly BypassInventoryItem[]>;
    readonly adoption: Input<StyleAdoption | undefined>;
    readonly t: Input<Messages>;
  }) =>
    section({ class: bypassesView.root }, [
      div({ class: bypassesView.adoption }, [
        strong({ class: bypassesView.heading }, function* () {
          return (yield* inputs.t()).adoptionTitle;
        }),
        ifNode(
          'adoptionKnown',
          function* () {
            return yield* (yield* BypassesViewModel()).adoptionKnown();
          },
          () => [
            p(function* () {
              return yield* (yield* BypassesViewModel()).adoptionSummary();
            }),
            small({ class: bypassesView.meta }, function* () {
              return yield* (yield* BypassesViewModel()).adoptionComposition();
            }),
            ul(
              { class: bypassesView.list },
              forNode(
                function* () {
                  return yield* (yield* BypassesViewModel()).adoptionRemaining();
                },
                { track: (entry) => entry.component },
                (entry) =>
                  li({ class: bypassesView.item }, [
                    strong(function* () {
                      return (yield* entry()).component;
                    }),
                    small({ class: bypassesView.meta }, function* () {
                      return (yield* entry()).note;
                    }),
                  ]),
              ),
            ),
          ],
          () =>
            small({ class: bypassesView.meta }, function* () {
              return (yield* inputs.t()).adoptionUnavailable;
            }),
        ),
      ]),
      div(
        { class: bypassesView.filters },
        forNode(
          function* () {
            return yield* (yield* BypassesViewModel()).rules();
          },
          { track: (entry) => entry.rule },
          (entry) =>
            button(
              'ChooseBypassRule',
              {
                type: 'button',
                class: bypassesView.filter,
                'data-bypassFilter': function* () {
                  return (yield* entry()).filterState;
                },
                'aria-pressed': function* () {
                  return (yield* entry()).pressed;
                },
                *click() {
                  (yield* BypassRuleFilter()).chooseRule((yield* entry()).rule);
                },
              },
              function* () {
                return (yield* entry()).text;
              },
            ),
        ),
      ),
      ul(
        { class: bypassesView.list },
        forNode(
          function* () {
            return yield* (yield* BypassesViewModel()).shown();
          },
          {
            track: (item) => item.subject,
            empty: () =>
              li(function* () {
                return (yield* inputs.t()).noInventory;
              }),
          },
          (item) =>
            li({ class: bypassesView.item }, [
              strong(function* () {
                return (yield* item()).heading;
              }),
              small({ class: bypassesView.meta }, function* () {
                return (yield* item()).meta;
              }),
              span(
                {
                  class: bypassesView.reason,
                  'data-bypassReason': function* () {
                    return (yield* item()).reasonState;
                  },
                },
                function* () {
                  return (yield* item()).reasonText;
                },
              ),
              pre({ class: bypassesView.excerpt }, function* () {
                return (yield* item()).excerpt;
              }),
            ]),
        ),
      ),
    ]),
).pipe(withComponentProviders((inputs) => [provideBypassesViewModel(inputs)]));

/**
 * A bypass card in the review queue: the rule, what it excuses, and the
 * reason — which is what the reviewer decides on.
 */
export const BypassCardEvidence = craftComponent(
  'BypassCardEvidence',
  {},
  (inputs: {
    readonly label: Input<string>;
    readonly location: Input<string>;
    readonly reason: Input<string | null>;
    readonly code: Input<string>;
    readonly previousReason: Input<string | null>;
    readonly t: Input<Messages>;
  }) =>
    section({ class: bypassesView.item }, [
      strong({ class: bypassesView.heading }, inputs.label),
      small({ class: bypassesView.meta }, inputs.location),
      span(
        {
          class: bypassesView.reason,
          'data-bypassReason': function* () {
            return yield* (yield* BypassCardEvidenceView()).reasonState();
          },
        },
        function* () {
          return yield* (yield* BypassCardEvidenceView()).reasonText();
        },
      ),
      small({ class: bypassesView.meta }, function* () {
        return yield* (yield* BypassCardEvidenceView()).previousText();
      }),
      pre({ class: bypassesView.excerpt }, inputs.code),
    ]),
).pipe(
  withComponentProviders((inputs) => [provideBypassCardEvidenceView(inputs)]),
);
