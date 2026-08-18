// @vitest-environment jsdom
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { mountCraftComponent } from '@craft-ng/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region save-button
import { button, craftComponent } from '@craft-ng/component';

const SaveToolbar = craftComponent(
  'SaveToolbar',
  {},
  () => ({}),
  () => button('save', { type: 'button' }, 'Save'),
);
// #endregion save-button

describe('guide/ai/dev-page.md #save-button', () => {
  it('renders the local name as data-craft-name', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(SaveToolbar, host, TestBed.inject(Injector));
    TestBed.tick();
    expect(host.querySelector('[data-craft-name="save"]')).not.toBeNull();
  });
});
