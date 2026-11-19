import { type Input } from '@craft-ts/component';
import {
  craftComputed,
  craftExpose,
  craftPrivate,
  craftService,
  deepYieldable,
} from '@craft-ts/core';
import type {
  BypassInventoryItem,
  StyleAdoption,
} from '@craft-ts/dev-tools/attestation-review';
import {
  ALL_BYPASS_RULES,
  BypassRuleFilter,
} from './bypass-rule-filter.service';
import type { Messages } from './messages';

export type BypassesViewInputs = Readonly<{
  bypasses: Input<readonly BypassInventoryItem[]>;
  adoption: Input<StyleAdoption | undefined>;
  t: Input<Messages>;
}>;

type RuleRow = Readonly<{
  rule: string;
  text: string;
  filterState: 'active' | null;
  pressed: 'true' | 'false';
}>;
type ShownRow = Readonly<{
  subject: string;
  heading: string;
  meta: string;
  reasonState: 'missing' | null;
  reasonText: string;
  excerpt: string;
}>;
type AdoptionRemainingRow = Readonly<{ component: string; note: string }>;

const locationOf = (item: BypassInventoryItem): string =>
  `${item.filePath}:${item.line}`;

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

export const { BypassesViewModel, provideBypassesViewModel } = craftService(
  { name: 'bypassesViewModel', providedIn: 'toProvide' },
  function* (provided: { readonly $provided: BypassesViewInputs }) {
    const inputs = provided.$provided;
    const { bypassRule: current } = yield* BypassRuleFilter();
    const rules = deepYieldable(
      yield* craftPrivate(
        craftComputed('rules', function* (): Generator<
          unknown,
          readonly RuleRow[],
          unknown
        > {
          const items = yield* inputs.bypasses();
          const active = yield* current();
          const say = yield* inputs.t();
          const named = [...new Set(items.map((item) => item.rule))].sort(
            (a, b) => a.localeCompare(b),
          );
          return [
            { rule: ALL_BYPASS_RULES, count: items.length },
            ...named.map((rule) => ({
              rule,
              count: items.filter((item) => item.rule === rule).length,
            })),
          ].map(({ rule, count }) => ({
            rule,
            text: `${rule === ALL_BYPASS_RULES ? say.bypassAllRules : rule} (${count})`,
            filterState: rule === active ? 'active' : null,
            pressed: rule === active ? 'true' : 'false',
          }));
        }),
      ),
    );
    const shown = deepYieldable(
      yield* craftPrivate(
        craftComputed('shown', function* (): Generator<
          unknown,
          readonly ShownRow[],
          unknown
        > {
          const rule = yield* current();
          const say = yield* inputs.t();
          return (yield* inputs.bypasses())
            .filter((item) => rule === ALL_BYPASS_RULES || item.rule === rule)
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
    );
    yield* craftComputed('adoptionKnown', function* () {
      return (yield* inputs.adoption()) !== undefined;
    });
    yield* craftComputed('adoptionSummary', function* () {
      const value = yield* inputs.adoption();
      return value
        ? (yield* inputs.t()).adoptionSummary(value.adopted, value.styling)
        : '';
    });
    yield* craftComputed('adoptionComposition', function* () {
      const value = yield* inputs.adoption();
      return value
        ? (yield* inputs.t()).adoptionComposition(value.composition)
        : '';
    });
    const adoptionRemaining = deepYieldable(
      yield* craftPrivate(
        craftComputed('adoptionRemaining', function* (): Generator<
          unknown,
          readonly AdoptionRemainingRow[],
          unknown
        > {
          const say = yield* inputs.t();
          return ((yield* inputs.adoption())?.remaining ?? []).map((entry) => ({
            component: entry.component,
            note: entry.waivedBy
              ? say.adoptionWaivedBy(entry.waivedBy)
              : say.adoptionNotWaived,
          }));
        }),
      ),
    );
    yield* craftExpose('rules', rules);
    yield* craftExpose('shown', shown);
    yield* craftExpose('adoptionRemaining', adoptionRemaining);
  },
);

export type BypassCardEvidenceInputs = Readonly<{
  reason: Input<string | null>;
  previousReason: Input<string | null>;
  t: Input<Messages>;
}>;

export const { BypassCardEvidenceView, provideBypassCardEvidenceView } =
  craftService(
    { name: 'bypassCardEvidenceView', providedIn: 'toProvide' },
    function* (provided: { readonly $provided: BypassCardEvidenceInputs }) {
      const inputs = provided.$provided;
      yield* craftComputed('reasonState', function* () {
        return (yield* inputs.reason()) ? null : 'missing';
      });
      yield* craftComputed('reasonText', function* () {
        return (yield* inputs.reason()) ?? (yield* inputs.t()).bypassNoReason;
      });
      yield* craftComputed('previousText', function* () {
        const previous = yield* inputs.previousReason();
        return previous
          ? (yield* inputs.t()).bypassPreviousReason(previous)
          : '';
      });
    },
  );
