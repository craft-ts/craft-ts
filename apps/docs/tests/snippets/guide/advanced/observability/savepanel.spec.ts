// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region savepanel
import { craftComponent, button } from '@craft-ts/component';
import { provideCraftDomEventHook } from '@craft-ts/core';

export const SavePanel = craftComponent(
  'SavePanel',
  {
    providers: [
      provideCraftDomEventHook((interaction, next) => {
        console.debug(interaction.interactionName, interaction.event);
        return next();
      }),
    ],
  },
  () => ({}),
  () => button('save', { type: 'button', click: save }, 'Save'),
);
// #endregion savepanel

describe('guide/advanced/observability.md #savepanel', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
