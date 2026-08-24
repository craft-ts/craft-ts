// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card
import { craftComponent, div, h2 } from '@craft-ts/component';

const Card = craftComponent(
  'Card',
  {
    host: {
      class: 'card card--default',
      attrs: { role: 'article' },
    },
  },
  () => ({}),
  () => div([h2('A card')]),
);

Card({
  class: 'card--featured',
  attrs: { 'data-testid': 'featured-card' },
});
// #endregion card

describe('guide/components/customization.md #card', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
