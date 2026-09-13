import { describe, expect, it } from 'vitest';
import { provideSendContextToAi } from '@craft-ts/component';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region configuration
export const aiContextProviders = provideSendContextToAi({
  endpoint: 'https://agent.example.com/hooks/context',
});
// #endregion configuration

describe('guide/ai/send-context-webhook.md #configuration', () => {
  it('keeps the documented webhook configuration valid', () => {
    expect(aiContextProviders).toEqual(expect.any(Array));
  });
});
