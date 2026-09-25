// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region component
import { craftComponent, div, h2 } from '@craft-ts/component';
import { state } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { card, cardVars } from './card.style';

const UploadCard = craftComponent(
  'UploadCard',
  {},
  function* () {
    const progress = yield* state('progress', 40);
    // The variant's point, or null for none: the attribute is then removed.
    const tone = yield* state('tone', 'danger' as 'danger' | null);
    return { progress, tone };
  },
  ({ progress, tone }) =>
    // One constant class per element; the variant is an attribute.
    div({ class: card.root, 'data-cardTone': tone }, [
      h2({ class: card.title }, 'Upload'),
      div({
        class: card.bar,
        // The only thing `style:` accepts: a typed variable, written by assign.
        style: function* () {
          return assign(cardVars.progress, unit.pct(yield* progress()));
        },
      }),
    ]),
);
// #endregion component

describe('guide/components/styles.md', () => {
  it('binds sheet classes, a data-* variant and a typed variable', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(UploadCard, host, TestBed.inject(Injector));
    TestBed.tick();

    const root = host.firstElementChild as HTMLElement;
    expect(root.className).toBe(card.root);
    expect(root.getAttribute('data-cardTone')).toBe('danger');
    const bar = root.querySelector('div') as HTMLElement;
    expect(bar.style.getPropertyValue('--card-progress')).toBe('40%');
  });
});
