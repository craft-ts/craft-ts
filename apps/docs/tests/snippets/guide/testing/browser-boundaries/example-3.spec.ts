// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-3
import { Console, craftService } from '@craft-ts/core';

const { BootLogger } = craftService(
  { name: 'BootLogger', providedIn: 'global' },
  function* () {
    yield* Console.log('boot');
    yield* Console.info('config loaded');

    return {
      ready: true,
    };
  },
);
// #endregion example-3

describe('guide/testing/browser-boundaries.md #example-3', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
