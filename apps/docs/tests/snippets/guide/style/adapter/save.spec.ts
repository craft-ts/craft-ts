// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region after
import { button, craftComponent } from '@craft-ts/component';
// ✓ the project's adapter, not '@acme/kit/style'
import { kitButton } from './kit.style';

export const Save = craftComponent('Save', {}, () =>
  button(
    'save',
    { type: 'button', class: kitButton.root, 'data-tone': 'danger' },
    'Save',
  ),
);
// #endregion after

describe('guide/routing/eslint-rules.md — external /style entries', () => {
  it('binds the class of the local adapter, and drives its axis by attribute', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(Save, host, CraftTestBed.inject(Injector));
    CraftTestBed.tick();

    const root = host.firstElementChild as HTMLElement;
    expect(root.className).toBe(kitButton.root);
    expect(root.getAttribute('data-tone')).toBe('danger');
  });
});
