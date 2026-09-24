// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region styledcard
import {
  content,
  craftComponent,
  div,
  p,
  renderContent,
  type ContentSlot,
} from '@craft-ts/component';
import { noteSheet, styledCard } from './styledcard.style';

const StyledCard = craftComponent(
  'StyledCard',
  {},
  (input: { readonly body: ContentSlot }) => input,
  ({ body }) => div({ class: styledCard.body }, renderContent('body', body)),
);

const Page = craftComponent(
  'Page',
  {},
  () => ({}),
  () =>
    StyledCard({
      body: content(() => p({ class: noteSheet.root }, 'Styled by its caller')),
    }),
);
// #endregion styledcard

describe('guide/components/content-projection.md #styledcard', () => {
  it('frames the slot and lets the caller style its own content', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(Page, host, TestBed.inject(Injector));
    TestBed.tick();

    const frame = host.firstElementChild;
    expect(frame?.className).toBe(styledCard.body);
    expect(frame?.querySelector('p')?.className).toBe(noteSheet.root);
  });
});
