// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region example-1
import { abstract, craftService } from '@craft-ng/core';

type CounterContract = {
  (): number;
  increment(): void;
};

const { CounterRequirement } = craftService(
  { name: 'Counter', scope: 'abstract' },
  abstract<CounterContract>(),
);
// #endregion example-1

describe('guide/app/abstract-services.md #example-1', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
