// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card
import { article, craftComponent, div, type Input } from '@craft-ts/component';
import { state } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { card, meter, meterVars, panel } from './card.style';

const Card = craftComponent(
  'Card',
  {},
  (progress: Input<number>) => ({ progress }),
  ({ progress }) =>
    article({ class: card.root }, [
      'Card',
      div({
        class: meter.fill,
        style: function* () {
          return assign(meterVars.value, unit.pct(yield* progress()));
        },
      }),
    ]),
);

const Page = craftComponent(
  'Page',
  {},
  function* () {
    const alertProgress = yield* state('alertProgress', 20);
    const panelProgress = yield* state('panelProgress', 80);
    return { alertProgress, panelProgress };
  },
  ({ alertProgress, panelProgress }) => [
    // Per instance: a variant sets the variables it changes.
    Card({ progress: alertProgress, 'data-cardLook': 'alert' }),
    // Forwarded: the panel's variable becomes the card's ink.
    div({ class: panel.root }, [Card({ progress: panelProgress })]),
  ],
);
// #endregion card

describe('guide/components/css-variables.md #card', () => {
  it('sets a variant per instance and writes the runtime value', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(Page, host, TestBed.inject(Injector));
    TestBed.tick();

    const cards = host.querySelectorAll('article');
    expect(cards[0]?.getAttribute('data-cardLook')).toBe('alert');
    expect(cards[1]?.hasAttribute('data-cardLook')).toBe(false);
    const fill = cards[1]?.querySelector('div') as HTMLElement;
    expect(fill.style.getPropertyValue('--cardMeter-value')).toBe('80%');
  });
});
