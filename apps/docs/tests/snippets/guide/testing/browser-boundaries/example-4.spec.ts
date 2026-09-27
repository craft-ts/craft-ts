// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-4
import { ConsoleService, craftService, craftExpose } from '@craft-ts/core';

const { AuditTrail } = craftService(
  { name: 'AuditTrail', providedIn: 'global' },
  function* () {
    const consoleService = yield* ConsoleService(
      undefined,
      ({ log, error }) => ({
        log,
        error,
      }),
    );

    yield* craftExpose('trackUserAction', (action: string) =>
      consoleService.log('user action', action));
    yield* craftExpose('trackFailure', (error: unknown) =>
      consoleService.error('unexpected failure', error));
  },
);
// #endregion example-4

describe('guide/testing/browser-boundaries.md #example-4', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
