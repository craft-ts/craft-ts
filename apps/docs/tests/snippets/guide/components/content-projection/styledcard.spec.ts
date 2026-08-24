// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region styledcard
import {
  ContentSlot,
  craftComponent,
  input,
  renderContent,
} from '@craft-ts/component';

const StyledCard = craftComponent(
  'StyledCard',
  {
    contentStyles: {
      body: ':scope { display: block; color: #344054; }',
    },
  },
  (input: { readonly body: ContentSlot }) => input,
  ({ body }) => renderContent('body', body),
);
// #endregion styledcard

describe('guide/components/content-projection.md #styledcard', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
