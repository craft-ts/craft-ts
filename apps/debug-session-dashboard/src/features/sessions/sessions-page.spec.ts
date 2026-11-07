import { CraftTestBed } from '@craft-ts/core';
import { expect, inject, it, vi } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

it('opens an archived session from the list, then asks an agent to resume there', async () => {
  const fetched = vi.spyOn(globalThis, 'fetch');
  const { element, shown, visible, click } = await openDashboard();
  await shown('saved-session', '85 événements');
  await shown('resume-count', '1 point de reprise');
  await shown('recipe-count', '1 recette');

  const row = await vi.waitFor(() => {
    const found = visible('saved-session').find((node) =>
      node.textContent?.includes('localhost:4205/catalogue'),
    );
    expect(found).toBeDefined();
    return found!;
  });
  row.click();
  CraftTestBed.tick();
  await shown('detail-page');
  // The resume point saved on this session is listed with it.
  await vi.waitFor(
    () =>
      expect(element.querySelector('[data-lab="resume-checkpoints"]')?.textContent).toContain(
        'revoir le panier',
      ),
    { timeout: 5_000 },
  );

  await click('resume-here');
  // What the agent should find there, in the developer's words.
  const intent = await vi.waitFor(() => {
    const field = element.querySelector<HTMLTextAreaElement>('textarea[data-craft-name="resumeIntent"]');
    expect(field).not.toBeNull();
    return field!;
  });
  intent.value = 'Voir le panier avant la commande';
  intent.dispatchEvent(new Event('input', { bubbles: true }));
  CraftTestBed.tick();
  const confirm = await vi.waitFor(() => {
    const [button] = visible('confirm-resume') as HTMLButtonElement[];
    expect(button?.disabled).toBe(false);
    return button!;
  });
  confirm.click();
  CraftTestBed.tick();
  const sessionId = inject('archivedSessionId');
  await vi.waitFor(async () => {
    const response = await fetch(`${inject('archiveUrl')}/sessions/resume-requests`);
    const body = (await response.json()) as { requests: { sessionId: string }[] };
    expect(body.requests.map((request) => request.sessionId)).toContain(sessionId);
  });
  // The thread beside the replay now follows that very request: its polling
  // reads it once the archive has stored it.
  await vi.waitFor(
    async () => {
      const statuses = await Promise.all(
        fetched.mock.calls.flatMap(([input], index) =>
          /\/sessions\/resume-requests\/(?!latest)[^/?]+$/.test(
            String(input instanceof Request ? input.url : input),
          )
            ? [
                (fetched.mock.results[index]!.value as Promise<Response>).then(
                  (response) => response.status,
                ),
              ]
            : [],
        ),
      );
      expect(statuses).toContain(200);
    },
    { timeout: 15_000 },
  );
});
