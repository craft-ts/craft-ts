import { craftComponent, span, type Input } from '@craft-ts/component';
import type { CalloutTone } from '../callout/callout.ts';
import { badgeUi } from './badge.style.ts';

export type BadgeTone = CalloutTone;

export interface BadgeInput {
  readonly tone: Input<BadgeTone>;
  readonly label: Input<string>;
}

/** A status word on a tinted ground: `BETA`, `NEW`, `DEPRECATED`. */
export const DocBadge = craftComponent('DocBadge', {}, (input: BadgeInput) =>
  span({ class: badgeUi.root, 'data-tone': input.tone }, [span(input.label)]),
);
