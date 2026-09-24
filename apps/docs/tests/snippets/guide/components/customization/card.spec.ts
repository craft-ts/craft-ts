// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region card
import { craftComponent, div, h2 } from '@craft-ts/component';
import { cardSheet } from './card.style';

const Card = craftComponent(
  'Card',
  {
    host: {
      class: cardSheet.root,
      attrs: { role: 'article' },
    },
  },
  () => ({}),
  () => div([h2('A card')]),
);

const FeaturedCard = craftComponent(
  'FeaturedCard',
  {},
  () => ({}),
  () =>
    // `class` merges with the host's; `attrs` would replace the host's
    // `attrs` as a whole, so a single attribute is passed as a property.
    Card({ class: cardSheet.featured, 'data-testid': 'featured-card' }),
);
// #endregion card

describe('guide/components/customization.md #card', () => {
  it('merges the caller class with the host default', () => {
    const host = document.createElement('div');
    document.body.append(host);
    mountCraftComponent(FeaturedCard, host, TestBed.inject(Injector));
    TestBed.tick();

    const card = host.querySelector('[data-testid="featured-card"]');
    expect(card?.getAttribute('role')).toBe('article');
    for (const atom of `${cardSheet.root} ${cardSheet.featured}`.split(' ')) {
      expect(card?.classList.contains(atom)).toBe(true);
    }
  });
});
