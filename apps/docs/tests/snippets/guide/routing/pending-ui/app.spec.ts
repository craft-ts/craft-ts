// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region app
import { CraftRouterOutlet, craftComponent, main } from '@craft-ts/component';

export const App = craftComponent(
  'App',
  {},
  () => ({}),
  () => main({ class: 'content' }, CraftRouterOutlet()),
);
// #endregion app

describe('guide/routing/pending-ui.md #app', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
