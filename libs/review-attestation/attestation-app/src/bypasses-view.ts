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
import {
  craftComputed,
  craftMethod,
  deepYieldable,
  state,
  craftUse,
} from '@craft-ts/core';
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
  function* ({
    bypasses,
    adoption,
    t,
  }: {
    readonly bypasses: Input<readonly BypassInventoryItem[]>;
    readonly adoption: Input<StyleAdoption | undefined>;
    readonly t: Input<Messages>;
  }) {
    // The filter owns what it filters: the rule list with its counts, and the
    // rows it lets through. Everything the template shows is derived here,
    // so the template reads fields and never decides between two texts.
    const ruleFilter = yield* state(
      'bypassRuleFilter',
      ALL_RULES,
      ({ set, state: current }) => ({
        choose: (rule: string) => set(rule),
        rules: craftUse(
          craftComputed('rules', function* () {
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
        ),
        shown: craftUse(
          craftComputed('shown', function* () {
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
        ),
      }),
    );
    const chooseRule = yield* craftMethod(
      'chooseRule',
      function* (rule: string) {
        yield* ruleFilter.choose(rule);
      },
    );
    const rulesSource = ruleFilter.rules;
    const shownSource = ruleFilter.shown;
    const rules = deepYieldable(rulesSource);
    const shown = deepYieldable(shownSource);
    const adoptionKnown = yield* craftComputed('adoptionKnown', function* () {
      return (yield* adoption()) !== undefined;
    });
    const adoptionSummary = yield* craftComputed(
      'adoptionSummary',
      function* () {
        const value = yield* adoption();
        return value
          ? (yield* t()).adoptionSummary(value.adopted, value.styling)
          : '';
      },
    );
    const adoptionComposition = yield* craftComputed(
      'adoptionComposition',
      function* () {
        const value = yield* adoption();
        return value ? (yield* t()).adoptionComposition(value.composition) : '';
      },
    );
    const adoptionRemaining = deepYieldable(
      yield* craftComputed('adoptionRemaining', function* () {
        const say = yield* t();
        return ((yield* adoption())?.remaining ?? []).map((entry) => ({
          component: entry.component,
          note: entry.waivedBy
            ? say.adoptionWaivedBy(entry.waivedBy)
            : say.adoptionNotWaived,
        }));
      }),
    );
    return section({ class: bypassesView.root }, [
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
                    strong(entry.component),
                    small({ class: bypassesView.meta }, entry.note),
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
              'data-bypassFilter': entry.filterState,
              'aria-pressed': entry.pressed,
              *click() {
                chooseRule(yield* entry.rule());
              },
            },
            entry.text,
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
              strong(item.heading),
              small({ class: bypassesView.meta }, item.meta),
              span(
                {
                  class: bypassesView.reason,
                  'data-bypassReason': item.reasonState,
                },
                item.reasonText,
              ),
              pre({ class: bypassesView.excerpt }, item.excerpt),
            ]),
        ),
      ),
    ]);
  },
);

/**
 * A bypass card in the review queue: the rule, what it excuses, and the
 * reason — which is what the reviewer decides on.
 */
export const BypassCardEvidence = craftComponent(
  'BypassCardEvidence',
  {},
  function* ({
    label,
    location,
    reason,
    code,
    previousReason,
    t,
  }: {
    readonly label: Input<string>;
    readonly location: Input<string>;
    readonly reason: Input<string | null>;
    readonly code: Input<string>;
    readonly previousReason: Input<string | null>;
    readonly t: Input<Messages>;
  }) {
    const reasonState = yield* craftComputed('reasonState', function* () {
      return (yield* reason()) ? null : 'missing';
    });
    const reasonText = yield* craftComputed('reasonText', function* () {
      return (yield* reason()) ?? (yield* t()).bypassNoReason;
    });
    const previousText = yield* craftComputed('previousText', function* () {
      const previous = yield* previousReason();
      return previous ? (yield* t()).bypassPreviousReason(previous) : '';
    });
    return section({ class: bypassesView.item }, [
      strong({ class: bypassesView.heading }, label),
      small({ class: bypassesView.meta }, location),
      span(
        { class: bypassesView.reason, 'data-bypassReason': reasonState },
        reasonText,
      ),
      small({ class: bypassesView.meta }, previousText),
      pre({ class: bypassesView.excerpt }, code),
    ]);
  },
);
