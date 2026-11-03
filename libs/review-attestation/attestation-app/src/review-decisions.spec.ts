import { CraftTestBed } from '@craft-ts/core';
import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';
import { reviewAppTemplateCard } from './review-app.happy-path';

it('accepts a template change for its group, then reopens it from the session history', async () => {
  const { click, queue, model } = mountReviewApp('decisions');
  await click('SelectTemplateObligation');
  await click('AcceptTemplateGroup');
  await vi.waitFor(async () =>
    expect((await queue()).history.map((entry) => [entry.card.id, entry.decision.verdict])).toEqual([
      [reviewAppTemplateCard.id, 'ok'],
    ]),
  );

  // The history panel reopens what was decided this session.
  model.chooseDevtoolView('review');
  CraftTestBed.tick();
  await click('ReopenReviewDecision');
  await vi.waitFor(async () => expect((await queue()).history).toEqual([]));
});
