import { describe, expect as vitestExpect, it } from 'vitest';
import { expect, lastAssertionPassedAt, resetAssertionClock } from './assertions.js';

describe('the timed expect', () => {
  it('times a passing assertion, sync or awaited, through .not and .resolves', async () => {
    resetAssertionClock();
    vitestExpect(lastAssertionPassedAt()).toBeUndefined();
    expect(1).not.toBe(2);
    const sync = lastAssertionPassedAt();
    vitestExpect(sync).toBeTypeOf('number');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(Promise.resolve(3)).resolves.toBe(3);
    vitestExpect(lastAssertionPassedAt()).toBeGreaterThan(sync!);
  });

  it('leaves the clock alone when an assertion fails', async () => {
    resetAssertionClock();
    vitestExpect(() => expect(1).toBe(2)).toThrow();
    await vitestExpect(expect(Promise.resolve(1)).resolves.toBe(2)).rejects.toThrow();
    vitestExpect(lastAssertionPassedAt()).toBeUndefined();
  });

  it('keeps timing what extend returns', () => {
    resetAssertionClock();
    const extended = expect.extend({
      toBeEven: (received: number) => ({ pass: received % 2 === 0, message: () => 'odd' }),
    });
    extended(4).toBeEven();
    vitestExpect(lastAssertionPassedAt()).toBeTypeOf('number');
  });
});
