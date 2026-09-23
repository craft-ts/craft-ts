import { describe, expect, it } from 'vitest';
import {
  componentLabelOf,
  componentOf,
  reviewVisualStatusOf,
  scenarioOf,
} from './card-presentation';

describe('review visual status', () => {
  it('marks cards without a previous decision as pending', () => {
    expect(reviewVisualStatusOf(undefined)).toBe('pending');
  });

  it('marks every handled verdict as reviewed except an explicit rejection', () => {
    expect(
      reviewVisualStatusOf({ verdict: 'ok', by: 'Ada', at: '2026-09-20' }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'ok-with-note',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'known-issue',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('reviewed');
    expect(
      reviewVisualStatusOf({
        verdict: 'rejected',
        by: 'Ada',
        at: '2026-09-20',
      }),
    ).toBe('rejected');
  });
});

describe('attestation subject labels', () => {
  it('turns generated application scenarios into a readable hierarchy', () => {
    expect(
      scenarioOf(
        'visual:component:fixture.ts:ReviewApp#app--review%2Dapp--review--application--desktop',
      ),
    ).toBe('Review app · Review · Application · Desktop');
  });

  it('turns template graph targets into their meaningful primitive name', () => {
    expect(
      scenarioOf(
        'template:component:fixture.ts:ReviewApp#command:primitive:fixture.ts#ReviewApp/craftComponent(ReviewApp)/craftGen()/selectVisualTest/craftMethod:selectVisualTest/0',
      ),
    ).toBe('Select visual test');
  });

  it('keeps ordinary scenario names readable', () => {
    expect(scenarioOf('visual:component:fixture.ts:Card#dark-mode')).toBe(
      'Dark mode',
    );
    expect(componentOf('visual:component:fixture.ts:Card#dark-mode')).toBe(
      'Card',
    );
    expect(componentLabelOf('component:fixture.ts:Card')).toBe('Card');
  });
});
