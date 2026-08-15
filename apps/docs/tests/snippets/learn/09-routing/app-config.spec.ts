// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../snippet-harness';
import { appRoutes } from './app-routes';

useSnippetHarness();

// #region app-config
import { craftAppConfig } from '@craft-ng/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [provideRouter(appRoutes.toRoutes(), withComponentInputBinding())],
});
// #endregion app-config

describe('Learn 09 app config', () => {
  it('exposes Angular providers from the craft config', () => {
    expect(appConfig.providers.length).toBeGreaterThan(0);
  });
});
