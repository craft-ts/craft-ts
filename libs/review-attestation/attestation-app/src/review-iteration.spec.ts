import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';

it('regenerates the evidence after confirming, then hands the review to Codex and copies its prompt', async () => {
  const written: string[] = [];
  // The browser's clipboard, the only boundary here that is not the server.
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: async (value: string) => void written.push(value) },
  });
  const { click, control, queue, shows } = mountReviewApp('iteration');

  await click('OpenRegenerationDialog');
  await control('ConfirmRegeneration');
  await click('CancelRegeneration');
  await vi.waitFor(() =>
    expect(document.querySelector('[data-craft-name="RegenerationDialog"]')?.closest('[hidden]')).not.toBeNull(),
  );
  await click('OpenRegenerationDialog');
  await click('ConfirmRegeneration');
  // Regenerated: the server re-derived its model and counts no previous decision.
  await vi.waitFor(async () => expect((await queue()).cards).toHaveLength(2));

  await click('GenerateIterationHandoff');
  await click('CancelIteration');
  await click('GenerateIterationHandoff');
  await click('ConfirmIterationHandoff');
  await click('CopyIterationPrompt');
  await vi.waitFor(() => expect(written).toHaveLength(1));
  await shows('The prompt is ready for Codex.');
  await shows('Prompt copied to clipboard.');
  expect(written[0]).toContain('attestation-review');
});
