import { CraftTestBed } from '@craft-ts/core';
import { expect, inject, it, vi } from 'vitest';
import { archivedIds, openDashboard } from '../../../test/dashboard-page';

it('deletes a session, then cleans the old and the incompatible ones', async () => {
  // Each clean-up asks first; the developer agrees.
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { shown, visible, click } = await openDashboard();
  const disposableId = inject('disposableSessionId');
  const row = await vi.waitFor(() => {
    const found = visible('saved-session').find((node) =>
      node.textContent?.includes('localhost:4205/panier'),
    );
    expect(found).toBeDefined();
    return found!.closest('li')!;
  });
  row.querySelector<HTMLButtonElement>('[data-lab="delete-session"]')!.click();
  CraftTestBed.tick();
  await click('confirm-delete-session');
  await vi.waitFor(async () => expect(await archivedIds()).not.toContain(disposableId));

  // One session ages past the retention while the archive runs.
  const before = await archivedIds();
  const [cleanup] = await shown('cleanup-old-sessions', undefined, 10_000);
  cleanup!.click();
  CraftTestBed.tick();
  await vi.waitFor(async () => expect(await archivedIds()).toHaveLength(before.length - 1));
  expect(confirm).toHaveBeenCalledTimes(1);

  await click('delete-incompatible-sessions');
  // What is left can be replayed, and is recent.
  await vi.waitFor(async () =>
    expect(await archivedIds()).toEqual([inject('archivedSessionId')]),
  );
  expect(confirm).toHaveBeenCalledTimes(2);
});
