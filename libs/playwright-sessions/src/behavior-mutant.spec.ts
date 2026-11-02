import { describe, expect, it } from 'vitest';
import { readE2eBehaviorMutant, runsUnderMutant } from './behavior-mutant.js';

describe('e2e behaviour mutant', () => {
  const run = {
    keys: ['invocation:service:cart / method:add'],
    mode: 'skip' as const,
    tests: { chromium: ['shop.checkout'] },
    appliedFile: '/tmp/applied',
  };

  it('is read from CRAFT_BEHAVIOR_MUTANT, and absent outside a mutant run', () => {
    expect(readE2eBehaviorMutant({})).toBeUndefined();
    expect(readE2eBehaviorMutant({ CRAFT_BEHAVIOR_MUTANT: JSON.stringify(run) })).toEqual(run);
    expect(() => readE2eBehaviorMutant({ CRAFT_BEHAVIOR_MUTANT: '{"keys":[]}' })).toThrow('requis');
  });

  it('runs only the tests whose reference proves the obligation, in their project', () => {
    expect(runsUnderMutant(run, 'chromium', 'shop.checkout')).toBe(true);
    expect(runsUnderMutant(run, 'firefox', 'shop.checkout')).toBe(false);
    expect(runsUnderMutant(run, 'chromium', 'admin.edit-product')).toBe(false);
  });
});
