import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';

it('folds and unfolds the proposed trees, then applies the accepted layout', async () => {
  const written: string[] = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: async (value: string) => void written.push(value) },
  });
  const { click, element, queue, shows } = mountReviewApp('folderLayout');
  await click('ShowFolderLayout');
  await shows('order-page.ts');
  // Folder rows: a file row has nothing to fold.
  const rows = () =>
    [...element.querySelectorAll('[data-craft-name="ToggleFolder"][aria-expanded]')].filter(
      (row) => row.closest('[hidden]') === null,
    );
  const expanded = () => rows().map((row) => row.getAttribute('aria-expanded'));
  await vi.waitFor(() => expect(expanded().every((value) => value === 'true')).toBe(true));

  await click('CollapseAllFolders');
  await vi.waitFor(() => expect(expanded()).toContain('false'));
  await click('ExpandAllFolders');
  await vi.waitFor(() => expect(expanded().every((value) => value === 'true')).toBe(true));
  await click('ToggleFolder');
  await vi.waitFor(() => expect(expanded()[0]).toBe('false'));
  // A file's other place opens the folders that hold it.
  await click('CollapseAllFolders', 1);
  await click('LocateInOtherTree');
  await vi.waitFor(() => expect(expanded().filter((value) => value === 'true').length).toBeGreaterThan(0));

  // Accepted, the proposal can be applied: copy its commands, then run them.
  await click('AcceptReviewCard');
  await click('CopyFolderLayoutGitCommands');
  await vi.waitFor(() => expect(written).toEqual([expect.stringContaining('npx craft-ts organize --apply')]));
  await click('RunFolderLayoutGitCommands');
  await vi.waitFor(async () => expect((await queue()).folderLayoutApply?.applied).toBe(true));
});
