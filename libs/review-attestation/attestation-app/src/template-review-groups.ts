import type {
  TemplateCondition,
  TemplateReviewCard,
} from '@craft-ts/dev-tools/attestation-review';
import {
  reviewVisualStatusOf,
  type ReviewVisualStatus,
} from './card-presentation';

export type TemplateReviewGroupStatus = ReviewVisualStatus | 'mixed';

export interface TemplateReviewGroup {
  readonly key: string;
  readonly component: string;
  readonly direction: TemplateReviewCard['direction'];
  readonly conditions: readonly TemplateCondition[];
  readonly cards: readonly TemplateReviewCard[];
  readonly reviewStatus: TemplateReviewGroupStatus;
}

export const templateReviewGroupStatusOf = (
  group: Pick<TemplateReviewGroup, 'cards'>,
): TemplateReviewGroupStatus => {
  const statuses = new Set(
    group.cards.map((card) => reviewVisualStatusOf(card.previousDecision)),
  );
  return statuses.size === 1 ? [...statuses][0] : 'mixed';
};

const conditionsKey = (conditions: readonly TemplateCondition[]): string =>
  conditions
    .map(
      (condition) =>
        `${condition.kind}:${condition.name}:${condition.expectation}`,
    )
    .sort()
    .join('|');

export const templateReviewGroupKey = (card: TemplateReviewCard): string =>
  [card.component, card.direction, conditionsKey(card.conditions ?? [])].join(
    '::',
  );

export const groupTemplateReviewCards = (
  cards: readonly TemplateReviewCard[],
): readonly TemplateReviewGroup[] => {
  const groups = new Map<string, TemplateReviewCard[]>();
  for (const card of cards) {
    const key = templateReviewGroupKey(card);
    const current = groups.get(key);
    if (current) current.push(card);
    else groups.set(key, [card]);
  }

  return [...groups.entries()]
    .flatMap(([key, members]) => {
      const cards = [...members].sort((left, right) =>
        left.subject.localeCompare(right.subject),
      );
      const first = cards[0];
      return first
        ? [
            {
              key,
              component: first.component,
              direction: first.direction,
              conditions: first.conditions ?? [],
              cards,
              reviewStatus: templateReviewGroupStatusOf({ cards }),
            } satisfies TemplateReviewGroup,
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.component.localeCompare(right.component) ||
        left.direction.localeCompare(right.direction) ||
        left.key.localeCompare(right.key),
    );
};

/** A former acceptance is not a current acceptance after evidence/context changed. */
export const pendingTemplateCards = (group: Pick<TemplateReviewGroup, 'cards'>) =>
  group.cards.filter((card) => card.state !== 'removed');
