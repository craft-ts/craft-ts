// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card
import { article, craftComponent } from '@craft-ts/component';

const Card = craftComponent(
  'Card',
  {
    styles: `
      :scope { --card-radius: 1rem; }
      .card {
        color: var(--card-ink);
        background: var(--card-bg, white);
        border-radius: var(--card-radius);
      }
    `,
  },
  () => ({}),
  () => article({ class: 'card' }, 'Card'),
);

Card({ cssVars: { '--card-ink': 'navy' } });
// #endregion card

describe('guide/components/css-variables.md #card', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
