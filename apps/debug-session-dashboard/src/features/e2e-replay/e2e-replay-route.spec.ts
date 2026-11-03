import { expect, inject, it, vi } from 'vitest';
import { openDashboard } from '../../../test/dashboard-page';

/**
 * The page the comparison frames load: it reads the reference from the
 * archive, then replays it inside the frame. jsdom draws no frame; what it
 * shows is the page answering for that source.
 */
it('reads the e2e reference it is given from the archive', async () => {
  const fetched = vi.spyOn(globalThis, 'fetch');
  const source = `${inject('archiveUrl')}${inject('e2eReferenceSource')}`;
  const { element } = await openDashboard(
    `/e2e-replay?source=${encodeURIComponent(source)}`,
  );
  await vi.waitFor(async () => {
    const call = fetched.mock.calls.findIndex(([input]) => String(input instanceof Request ? input.url : input) === source);
    expect(call).toBeGreaterThanOrEqual(0);
    const response = await fetched.mock.results[call]!.value as Response;
    expect(response.status).toBe(200);
  });
  expect(element.textContent).toContain('Replay E2E');
});
