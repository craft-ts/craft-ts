import { article, craftComponent, span, type Input } from '@craft-ts/component';
import { tokenCard } from './css-vars.style';

export type CssVarsTokenCardTone = 'blue' | 'pink' | 'green';

/** A reusable card shared by the CSS variable examples. */
export const TokenCard = craftComponent(
  'TokenCard',
  {},
  (input: {
    readonly label: Input<string>;
    readonly tone: Input<CssVarsTokenCardTone | null>;
  }) =>
    article({ class: tokenCard.root, 'data-tokenCard': input.tone }, [
      span({ class: tokenCard.label }, input.label),
      span(
        { class: tokenCard.contract },
        'ink, bg, radius: typed, each with an initial value',
      ),
    ]),
);
