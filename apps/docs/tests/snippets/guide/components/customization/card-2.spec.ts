// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card-2
import {
  craftComponent,
  div,
  h2,
  strong,
} from '@craft-ts/component';

const Card = craftComponent(
  'Card',
  {
    styles: `
      :scope { padding: 1rem; }
      .title { color: navy; }
      .title strong { font-weight: 700; }
    `,
  },
  () => ({}),
  () => div([h2({ class: 'title' }, [strong('Card')])]),
);
// #endregion card-2

describe('guide/components/customization.md #card-2', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
