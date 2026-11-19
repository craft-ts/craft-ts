// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card
import { article, craftComponent, div, type Input } from '@craft-ts/component';
import { craftService, state } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { card, meter, meterVars, panel } from './card.style';

const Card = craftComponent(
  'Card',
  {},
  (props: { readonly progress: Input<number> }) =>
    article({ class: card.root }, [
      'Card',
      div({
        class: meter.fill,
        style: function* () {
          return assign(meterVars.value, unit.pct(yield* props.progress()));
        },
      }),
    ]),
);

const { PageView, providePageView } = craftService(
  { name: 'pageView', providedIn: 'toProvide' },
  function* () {
    yield* state('alertProgress', 20);
    yield* state('panelProgress', 80);
  },
);

const Page = craftComponent('Page', { providers: [providePageView()] }, () => [
  // Per instance: a variant sets the variables it changes.
  Card({
    progress: function* () {
      return yield* (yield* PageView()).alertProgress();
    },
    'data-cardLook': 'alert',
  }),
  // Forwarded: the panel's variable becomes the card's ink.
  div(
    {
      class: panel.root,
    },
    [
      Card({
        progress: function* () {
          return yield* (yield* PageView()).panelProgress();
        },
      }),
    ],
  ),
]);
// #endregion card

describe('guide/components/css-variables.md #card', () => {
  it('sets a variant per instance and writes the runtime value', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(Page, host, CraftTestBed.inject(Injector));
    CraftTestBed.tick();

    const cards = host.querySelectorAll('article');
    expect(cards[0]?.getAttribute('data-cardLook')).toBe('alert');
    expect(cards[1]?.hasAttribute('data-cardLook')).toBe(false);
    const fill = cards[1]?.querySelector('div') as HTMLElement;
    expect(fill.style.getPropertyValue('--cardMeter-value')).toBe('80%');
  });
});
