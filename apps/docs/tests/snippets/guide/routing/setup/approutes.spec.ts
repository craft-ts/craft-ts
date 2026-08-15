// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region approutes
import {
  craftRoutes,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

export const { appRoutes } = craftRoutes('app', [
  /* routes */
]);

type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
type _CanRunApp = CanRun<_CheckAppDI>;
// #endregion approutes

describe('guide/routing/setup.md #approutes', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
