// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region editor
import { button, craftComponent, div } from '@craft-ng/component';
import { setupCraftComponentTemplateTest } from '@craft-ng/component/testing';

const Editor = craftComponent(
  'Editor',
  {},
  () => ({}),
  () =>
    div([
      button(
        'save',
        { type: 'button',
          class: 'save',
          'data-testid': 'save',
        },
        'Save',
      ),
    ]),
);

it('finds the save button', async () => {
  const test = await setupCraftComponentTemplateTest.byRegister(Editor, {
    context: {},
    register: {},
  });

  const saveButton = test.locator('button', {
    class: 'save',
    'data-testid': 'save',
  });

  expect(saveButton?.textContent).toBe('Save');
  saveButton?.click();
  test.destroy();
});
// #endregion editor

describe('guide/testing/components.md #editor', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
