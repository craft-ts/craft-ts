// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';
import { appRoutes } from './app-routes';

useSnippetHarness();

// #region craft-router
import { craftAppConfig, provideCraftRouter, withTransitionTimings } from '@craft-ng/core';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [
    provideCraftRouter(
      appRoutes.toRoutes(),
      withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
    ),
  ],
});
// #endregion craft-router

describe('Learn 09 provideCraftRouter', () => {
  it('registers non-blocking router providers', () => {
    expect(appConfig.providers.length).toBeGreaterThan(0);
  });
});
