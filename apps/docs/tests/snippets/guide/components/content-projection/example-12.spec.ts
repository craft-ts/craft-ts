// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-12
import {
  ContentSlot,
  craftComponent,
  renderContent,
} from '@craft-ts/component';

craftComponent(
  'InvalidStyles',
  // @ts-expect-error "footer" is not a declared content slot.
  {
    contentStyles: { footer: ':scope { color: red; }' },
  },
  ({ body }: { readonly body: ContentSlot }) => renderContent('body', body),
);
// #endregion example-12

describe('guide/components/content-projection.md #example-12', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
