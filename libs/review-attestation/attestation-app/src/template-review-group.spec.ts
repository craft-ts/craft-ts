import { CraftTestBed } from '@craft-ts/core';
import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';
import { orderTotal, profileName, profilePermissions } from '../test/review-scenarios';

it('decides a component’s template promises together: rejects, delegates, then accepts', async () => {
  const { click, control, queue, shows } = mountReviewApp('templates');
  const checked = async () =>
    [...document.querySelectorAll<HTMLInputElement>('[data-craft-name="SelectTemplateObligation"]')]
      .filter((box) => box.closest('[hidden]') === null)
      .map((box) => box.checked);
  // Groups come by component: Order, then Profile.
  await shows('Order displays Total.');
  await click('NextTemplateGroup');
  await shows('Profile displays Name.');

  // The whole group, then nothing.
  await click('SelectTemplateGroup');
  await vi.waitFor(async () => expect(await checked()).toEqual([true, true]));
  await click('SelectTemplateGroup');
  await vi.waitFor(async () => expect(await checked()).toEqual([false, false]));

  // What only a human may decide is rejected, with the reason why.
  await click('SelectHumanTemplateObligations');
  await vi.waitFor(async () => expect((await checked()).filter(Boolean)).toHaveLength(1));
  await click('RejectTemplateGroup');
  await click('CancelTemplateGroupReject');
  await click('RejectTemplateGroup');
  const note = await control<HTMLTextAreaElement>('TemplateGroupNote');
  note.value = 'Permissions are not part of the profile.';
  note.dispatchEvent(new Event('input', { bubbles: true }));
  CraftTestBed.tick();
  await click('SubmitTemplateGroupReject');
  // A rejection stays in the queue, now carrying its reason.
  await vi.waitFor(async () =>
    expect((await queue()).cards.find((card) => card.id === profilePermissions.id)?.previousDecision).toEqual(
      expect.objectContaining({ verdict: 'rejected', note: 'Permissions are not part of the profile.' }),
    ),
  );

  // The other one goes to the review agent.
  await click('SelectTemplateObligation');
  await click('DelegateTemplateGroup');
  await vi.waitFor(async () =>
    expect(
      ((await queue()) as { templateAgentResults?: { id: string; outcome: string }[] }).templateAgentResults,
    ).toEqual([expect.objectContaining({ id: profileName.id, outcome: 'accepted' })]),
  );

  // Back to the first group, accepted as it stands.
  await click('PreviousTemplateGroup');
  await shows('Order displays Total.');
  await click('SelectTemplateObligation');
  await click('AcceptTemplateGroup');
  await vi.waitFor(async () =>
    expect((await queue()).history.map((entry) => entry.card.id)).toContain(orderTotal.id),
  );
});
