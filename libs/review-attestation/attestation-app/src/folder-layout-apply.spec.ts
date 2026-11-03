import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';

it('keeps an accepted layout unapplied when its command is declined', async () => {
  const { click, control, queue } = mountReviewApp('folderLayoutDeclined');
  await click('ShowFolderLayout');
  await click('AcceptReviewCard');
  await control('RunFolderLayoutGitCommands');
  await click('CancelFolderLayoutApply');
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll('[data-craft-name="RunFolderLayoutGitCommands"]')].filter(
        (button) => button.closest('[hidden]') === null,
      ),
    ).toHaveLength(0),
  );
  expect((await queue()).folderLayoutApply?.applied).toBe(false);
});
