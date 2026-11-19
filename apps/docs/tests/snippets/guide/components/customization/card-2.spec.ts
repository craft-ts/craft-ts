// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card-2
import { craftComponent, div, h2, type Input } from '@craft-ts/component';
import { craftService, state } from '@craft-ts/core';
import { cardSheet } from './card.style';
import { titleSheet } from './card-2.style';

const CardTitle = craftComponent(
  'CardTitle',
  {},
  (props: { readonly text: Input<string> }) =>
    h2({ class: titleSheet.root }, props.text),
);

const { CardView, provideCardView } = craftService(
  { name: 'cardView', providedIn: 'toProvide' },
  function* () {
    yield* state('title', 'Card');
  },
);

const Card = craftComponent('Card', { providers: [provideCardView()] }, () =>
  div({ class: cardSheet.root, 'data-cardActive': 'true' }, [
    // The card sets `data-cardActive`; its sheet writes the inherited
    // variable; the title, a separate component, reads it.
    CardTitle({
      text: function* () {
        return yield* (yield* CardView()).title();
      },
    }),
  ]),
);
// #endregion card-2

describe('guide/components/customization.md #card-2', () => {
  it('lets a parent drive a child through an inherited variable only', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(Card, host, CraftTestBed.inject(Injector));
    CraftTestBed.tick();

    const card = host.firstElementChild;
    expect(card?.getAttribute('data-cardActive')).toBe('true');
    expect(card?.querySelector('h2')?.className).toBe(titleSheet.root);
  });
});
