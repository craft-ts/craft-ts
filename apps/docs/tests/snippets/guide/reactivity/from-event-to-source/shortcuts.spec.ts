// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region shortcuts
import { craftComponent, p } from '@craft-ts/component';
import { fromEventToSource$ } from '@craft-ts/core';

interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const Shortcuts = craftComponent(
  'Shortcuts',
  {},
  function* () {
    const save = () => console.log('Save triggered');
    const undo = () => console.log('Undo triggered');

    const keydown$ = fromEventToSource$(document, 'keydown', {
      computedValue: (event: KeyboardEvent) => ({
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }),
    });

    keydown$.subscribe((shortcut) => {
      if (shortcut.ctrlKey && shortcut.key === 's') save();
      else if (shortcut.ctrlKey && shortcut.key === 'z') undo();
    });

    return {};
  },
  () => p('Try Ctrl+S or Ctrl+Z'),
);
// #endregion shortcuts

describe('guide/reactivity/from-event-to-source.md #shortcuts', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
