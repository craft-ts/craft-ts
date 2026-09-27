import { describe, expect, it } from 'vitest';
import { VirtualCraftTemporalRuntime } from '@craft-ts/core';
import { createForScheduler } from './for-scheduling';

describe('scheduleFor virtual clock integration', () => {
  it('holds queued frames until the Craft clock advances', async () => {
    const clock = new VirtualCraftTemporalRuntime(100);
    const scheduler = createForScheduler(
      { enabled: true, strategy: 'frame', frameBudgetMs: 4 },
      clock,
    );
    let ran = 0;
    scheduler.schedule(() => ran++);
    await clock.advanceBy(15);
    expect(ran).toBe(0);
    await clock.advanceBy(1);
    expect(ran).toBe(1);
    scheduler.destroy?.();
  });
});
