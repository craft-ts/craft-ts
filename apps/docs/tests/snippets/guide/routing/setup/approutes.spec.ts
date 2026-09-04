// @vitest-environment jsdom
import type { CraftRouter } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region approutes
import {
  craftRoutes,
  type CanRun,
  type RouteCheckedDI,
} from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  /* routes */
]);

type _CheckAppDI = RouteCheckedDI<
  {
    deps: Record<never, never>;
    provided: Record<never, never>;
    publicProperties: Record<never, never>;
  },
  never,
  CraftRouter,
  'app route'
>;
type _CanRunApp = CanRun<_CheckAppDI>;
// #endregion approutes

describe('guide/routing/setup.md #approutes', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
