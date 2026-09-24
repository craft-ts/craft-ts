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
    // The filter owns what it filters: the rule list with its counts, and the
    // rows it lets through. Everything the template shows is derived here,
    // so the template reads fields and never decides between two texts.
    const ruleFilter = yield* state(
      'bypassRuleFilter',
      ALL_RULES,
      ({ set, state: current }) => ({
        choose: (rule: string) => set(rule),
        rules: craftComputed('rules', function* () {
          const items = yield* bypasses();
          const active = yield* current();
          const say = yield* t();
          const named = [...new Set(items.map((item) => item.rule))].sort(
            (left, right) => left.localeCompare(right),
          );
          return [
            { rule: ALL_RULES, count: items.length },
            ...named.map((rule) => ({
              rule,
              count: items.filter((item) => item.rule === rule).length,
            })),
          ].map(({ rule, count }) => ({
            rule,
            text: `${rule === ALL_RULES ? say.bypassAllRules : rule} (${count})`,
            filterState: rule === active ? 'active' : null,
            pressed: rule === active ? 'true' : 'false',
          }));
        }),
        shown: craftComputed('shown', function* () {
          const rule = yield* current();
          const say = yield* t();
          return (yield* bypasses())
            .filter((item) => rule === ALL_RULES || item.rule === rule)
            .map((item) => ({
              subject: item.subject,
              heading: `${item.kind === 'eslint-disable' ? say.bypassEslintDisable : say.bypassWaiver} · ${item.rule}`,
              meta: `${locationOf(item)} · ${item.state}${item.target ? ` · ${say.bypassWaivedTarget(item.target)}` : ''}`,
              reasonState: item.reason ? null : 'missing',
              reasonText: item.reason ?? say.bypassNoReason,
              excerpt: excerptText(item),
            }));
        }),
      }),
    );
    const chooseRule = craftMethod('chooseRule', function* (rule: string) {
      yield* ruleFilter.choose(rule);
    });
    const rules = ruleFilter.rules;
    const shown = ruleFilter.shown;
    const adoptionKnown = craftComputed('adoptionKnown', function* () {
      return (yield* adoption()) !== undefined;
    });
    const adoptionSummary = craftComputed('adoptionSummary', function* () {
      const value = yield* adoption();
      return value
        ? (yield* t()).adoptionSummary(value.adopted, value.styling)
        : '';
    });
    const adoptionComposition = craftComputed(
      'adoptionComposition',
      function* () {
        const value = yield* adoption();
        return value ? (yield* t()).adoptionComposition(value.composition) : '';
      },
    );
    const adoptionRemaining = craftComputed('adoptionRemaining', function* () {
      const say = yield* t();
      return ((yield* adoption())?.remaining ?? []).map((entry) => ({
        component: entry.component,
        note: entry.waivedBy
          ? say.adoptionWaivedBy(entry.waivedBy)
          : say.adoptionNotWaived,
      }));
    });
    return {
      t,
      rules,
      shown,
      chooseRule,
      adoptionKnown,
      adoptionSummary,
      adoptionComposition,
      adoptionRemaining,
    };
  },
  ({
    t,
    rules,
    shown,
    chooseRule,
    adoptionKnown,
    adoptionSummary,
    adoptionComposition,
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
            p(adoptionSummary),
            small({ class: bypassesView.meta }, adoptionComposition),
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
                      return (yield* entry()).note;
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
                return (yield* entry()).filterState;
              },
              'aria-pressed': function* () {
                return (yield* entry()).pressed;
              },
              *click() {
                yield* chooseRule((yield* entry()).rule);
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
);

/**
 * A bypass card in the review queue: the rule, what it excuses, and the
 * reason — which is what the reviewer decides on.
 */
export const BypassCardEvidence = craftComponent(
  'BypassCardEvidence',
  {},
  function* (
    label: Input<string>,
    location: Input<string>,
    reason: Input<string | null>,
    code: Input<string>,
    previousReason: Input<string | null>,
    t: Input<Messages>,
  ) {
    const reasonState = craftComputed('reasonState', function* () {
      return (yield* reason()) ? null : 'missing';
    });
    const reasonText = craftComputed('reasonText', function* () {
      return (yield* reason()) ?? (yield* t()).bypassNoReason;
    });
    const previousText = craftComputed('previousText', function* () {
      const previous = yield* previousReason();
      return previous ? (yield* t()).bypassPreviousReason(previous) : '';
    });
    return { label, location, code, reasonState, reasonText, previousText };
  },
  ({ label, location, code, reasonState, reasonText, previousText }) =>
    section({ class: bypassesView.item }, [
      strong({ class: bypassesView.heading }, label),
      small({ class: bypassesView.meta }, location),
      span(
        { class: bypassesView.reason, 'data-bypassReason': reasonState },
        reasonText,
      ),
      small({ class: bypassesView.meta }, previousText),
      pre({ class: bypassesView.excerpt }, code),
    ]),
);
