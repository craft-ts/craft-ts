import { expect, it, vi } from 'vitest';
import { mountReviewApp } from '../test/review-app';
import { profileMobileCapture } from '../test/review-scenarios';

it('browses the inventory: the application captures, the visual tests and the bypasses', async () => {
  const { click, clickLabelled, choose, queue, shows, visibleText } = mountReviewApp('inventory');

  // The application overview points at the capture that changed.
  await click('ShowApplicationOverview');
  await click('NextApplicationCapture');
  await shows('the screenshot changed');
  await click('ShowApplicationOverview');
  await click('InspectApplicationCapture');
  await shows('the screenshot changed');
  await click('ShowApplicationOverview');
  await click('SelectApplicationCapture');
  await click('AcceptApplicationSelection');
  await vi.waitFor(async () =>
    expect((await queue()).history.map((entry) => [entry.card.id, entry.decision.verdict])).toEqual([
      [profileMobileCapture.id, 'ok'],
    ]),
  );

  // A visual test opens its own review.
  await click('ShowVisualTests');
  await click('SelectVisualTest');
  await click('OpenVisualReview');
  await shows('the screenshot changed');

  // One rule's bypasses only, then every filter cleared.
  await click('ShowBypasses');
  await shows('no-alert');
  await clickLabelled('ChooseBypassRule', 'no-console');
  await vi.waitFor(() => {
    expect(visibleText()).toContain('The boot banner.');
    expect(visibleText()).not.toContain('Kept until the dialog lands.');
  });
  // Every view narrows with the same filters, and clears them at once.
  await click('ShowVisualTests');
  await choose('TextFilter', 'ProfileCard');
  await vi.waitFor(() => expect(visibleText()).toContain('1 active filter'));
  await click('ClearFilters');
  await vi.waitFor(() => expect(visibleText()).toContain('0 active filters'));
});

it('speaks, looks and opens links as the reviewer chose', async () => {
  const { choose, shows } = mountReviewApp('inventory');
  await choose('ReviewLocale', 'fr');
  await shows('Langue');
  await choose('ReviewTheme', 'dark');
  await vi.waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  await choose('ReviewIde', 'cursor');
  await vi.waitFor(() =>
    expect(document.querySelector('a[data-testid="source-link"]')?.getAttribute('href') ?? '').toMatch(/^cursor:|^$/),
  );
});
