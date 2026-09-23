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
  type Input,
} from '@craft-ts/component';
import { craftComputed, craftMethod, state } from '@craft-ts/core';
import type {
  BypassInventoryItem,
  StyleAdoption,
} from '@craft-ts/dev-tools/attestation-review';
import { bypassesView } from './bypasses-view.style';
import type { Messages } from './messages';

const ALL_RULES = '*all*';

const locationOf = (item: BypassInventoryItem): string =>
  `${item.filePath}:${item.line}`;

/** The silenced code for a directive; the excused target for a waiver. */
const excerptText = (item: BypassInventoryItem): string => {
  const excerpt = item.excerpt;
  if (!excerpt) return `${item.rule} → ${item.target ?? '*'}`;
  return excerpt.lines
    .map(
      (line, index) =>
        `${String(excerpt.startLine + index).padStart(4)}  ${line}`,
    )
    .join('\n');
};

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
  function* (
    bypasses: Input<readonly BypassInventoryItem[]>,
    adoption: Input<StyleAdoption | undefined>,
    t: Input<Messages>,
  ) {
    const ruleFilter = yield* state(
      'bypassRuleFilter',
      ALL_RULES,
      ({ set }) => ({
        choose: (rule: string) => set(rule),
      }),
    );
    const chooseRule = craftMethod(
      'chooseBypassRule',
      function* (rule: string) {
        yield* ruleFilter.choose(rule);
      },
    );
    const rules = craftComputed('bypassRules', function* () {
      const counts = new Map<string, number>();
      for (const item of yield* bypasses()) {
        counts.set(item.rule, (counts.get(item.rule) ?? 0) + 1);
      }
      const current = yield* ruleFilter();
      return [
        {
          rule: ALL_RULES,
          count: (yield* bypasses()).length,
          active: current === ALL_RULES,
        },
        ...[...counts]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([rule, count]) => ({ rule, count, active: current === rule })),
      ];
    });
    const shown = craftComputed('shownBypasses', function* () {
      const rule = yield* ruleFilter();
      return (yield* bypasses()).filter(
        (item) => rule === ALL_RULES || item.rule === rule,
      );
    });
    const adoptionKnown = craftComputed('adoptionKnown', function* () {
      return (yield* adoption()) !== undefined;
    });
    const adoptionRemaining = craftComputed('adoptionRemaining', function* () {
      return (yield* adoption())?.remaining ?? [];
    });
    return {
      t,
      rules,
      shown,
      chooseRule,
      adoption,
      adoptionKnown,
      adoptionRemaining,
    };
  },
  ({
    t,
    rules,
    shown,
    chooseRule,
    adoption,
    adoptionKnown,
    adoptionRemaining,
  }) =>
    section({ class: bypassesView.root }, [
      div({ class: bypassesView.adoption }, [
        strong({ class: bypassesView.heading }, function* () {
          return (yield* t()).adoptionTitle;
        }),
        ifNode(
          adoptionKnown,
          () => [
            p(function* () {
              const value = yield* adoption();
              return value
                ? (yield* t()).adoptionSummary(value.adopted, value.styling)
                : '';
            }),
            small({ class: bypassesView.meta }, function* () {
              const value = yield* adoption();
              return value
                ? (yield* t()).adoptionComposition(value.composition)
                : '';
            }),
            ul(
              { class: bypassesView.list },
              forNode(
                adoptionRemaining,
                { track: (entry) => entry.component },
                (entry) =>
                  li({ class: bypassesView.item }, [
                    strong(function* () {
                      return (yield* entry()).component;
                    }),
                    small({ class: bypassesView.meta }, function* () {
                      const value = yield* entry();
                      const messages = yield* t();
                      return value.waivedBy
                        ? messages.adoptionWaivedBy(value.waivedBy)
                        : messages.adoptionNotWaived;
                    }),
                  ]),
              ),
            ),
          ],
          () =>
            small({ class: bypassesView.meta }, function* () {
              return (yield* t()).adoptionUnavailable;
            }),
        ),
      ]),
      div(
        { class: bypassesView.filters },
        forNode(rules, { track: (entry) => entry.rule }, (entry) =>
          button(
            'ChooseBypassRule',
            {
              type: 'button',
              class: bypassesView.filter,
              'data-bypassFilter': function* () {
                return (yield* entry()).active ? 'active' : null;
              },
              'aria-pressed': function* () {
                return (yield* entry()).active ? 'true' : 'false';
              },
              *click() {
                yield* chooseRule((yield* entry()).rule);
              },
            },
            function* () {
              const value = yield* entry();
              const label =
                value.rule === ALL_RULES
                  ? (yield* t()).bypassAllRules
                  : value.rule;
              return `${label} (${value.count})`;
            },
          ),
        ),
      ),
      ul(
        { class: bypassesView.list },
        forNode(
          shown,
          {
            track: (item) => item.subject,
            empty: () =>
              li(function* () {
                return (yield* t()).noInventory;
              }),
          },
          (item) =>
            li({ class: bypassesView.item }, [
              strong(function* () {
                const value = yield* item();
                const messages = yield* t();
                return `${value.kind === 'eslint-disable' ? messages.bypassEslintDisable : messages.bypassWaiver} · ${value.rule}`;
              }),
              small({ class: bypassesView.meta }, function* () {
                const value = yield* item();
                const target = value.target
                  ? ` · ${(yield* t()).bypassWaivedTarget(value.target)}`
                  : '';
                return `${locationOf(value)} · ${value.state}${target}`;
              }),
              span(
                {
                  class: bypassesView.reason,
                  'data-bypassReason': function* () {
                    return (yield* item()).reason ? null : 'missing';
                  },
                },
                function* () {
                  return (yield* item()).reason ?? (yield* t()).bypassNoReason;
                },
              ),
              pre({ class: bypassesView.excerpt }, function* () {
                return excerptText(yield* item());
              }),
            ]),
        ),
      ),
    ]),
);

/**
 * A bypass card in the review queue: the rule, what it excuses, and the
 * reason — which is what the reviewer decides on.
 */
export const BypassCardEvidence = craftComponent(
  'BypassCardEvidence',
  {},
  (
    label: Input<string>,
    location: Input<string>,
    reason: Input<string | null>,
    code: Input<string>,
    previousReason: Input<string | null>,
    t: Input<Messages>,
  ) => ({ label, location, reason, code, previousReason, t }),
  ({ label, location, reason, code, previousReason, t }) =>
    section({ class: bypassesView.item }, [
      strong({ class: bypassesView.heading }, label),
      small({ class: bypassesView.meta }, location),
      span(
        {
          class: bypassesView.reason,
          'data-bypassReason': function* () {
            return (yield* reason()) ? null : 'missing';
          },
        },
        function* () {
          return (yield* reason()) ?? (yield* t()).bypassNoReason;
        },
      ),
      small({ class: bypassesView.meta }, function* () {
        const previous = yield* previousReason();
        return previous ? (yield* t()).bypassPreviousReason(previous) : '';
      }),
      pre({ class: bypassesView.excerpt }, code),
    ]),
);
