import { expect, inject, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';

it('closes the review session once the handoff is ready, and the server stops', async () => {
  const { click } = mountReviewApp('closing');
  await click('GenerateIterationHandoff');
  await click('ConfirmIterationHandoff');
  await click('CloseReview');
  // The review server ends with its session: nothing answers any more.
  const server = inject('reviewServers').closing;
  await vi.waitFor(async () => {
    await expect(fetch(`${server}/api/review`)).rejects.toThrow();
  });
});
