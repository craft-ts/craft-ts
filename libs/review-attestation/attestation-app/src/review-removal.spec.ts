import { CraftTestBed } from '@craft-ts/core';
import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';
import { removedPromise } from '../test/review-scenarios';

it('retires a removed promise only with its reason, written or pasted', async () => {
  const { click, choose, control, writeNote, queue, element } = mountReviewApp('removal');
  await click('NextReviewCard');
  await click('PreviousReviewCard');
  // The queue lists both cards: the second is the removed promise.
  await click('SelectReviewCard', 1);

  // Rejected with no reason, the decision waits for one.
  await click('RejectReviewCard');
  const note = await control('ReviewNote');
  await vi.waitFor(() => expect(note.getAttribute('aria-invalid')).toBe('true'));
  await click('RetireObligation');
  expect((await queue()).history).toEqual([]);

  await choose('RetirementReason', 'defect');
  await writeNote('The save button left with the old form.');
  // A pasted reason lands as plain text where the caret is.
  const range = document.createRange();
  range.selectNodeContents(note);
  range.collapse(false);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
  const paste = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: { getData: () => ' See #42.' } as unknown as DataTransfer,
  });
  note.dispatchEvent(paste);
  CraftTestBed.tick();
  expect(paste.defaultPrevented).toBe(true);
  expect(note.textContent).toContain('See #42.');

  await click('RetireObligation');
  await vi.waitFor(async () =>
    expect((await queue()).history.map((entry) => [entry.card.id, entry.decision])).toEqual([
      [
        removedPromise.id,
        expect.objectContaining({
          verdict: 'retire',
          retirementReason: 'defect',
          note: expect.stringContaining('The save button left with the old form.'),
        }),
      ],
    ]),
  );
  expect(element).toBeDefined();
});
