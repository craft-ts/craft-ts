import { describe, expect, it } from 'vitest';
import { provideSendContextToAi } from '@craft-ts/component';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region minimal
export const minimalAiContextProviders = [provideSendContextToAi({ recording: true })];
// #endregion minimal

// #region configuration
export const aiContextProviders = provideSendContextToAi({
  recording: true,
  endpoint: 'https://agent.example.com/hooks/context',
});
// #endregion configuration

// #region endpoint-configuration
export const customizedAiContextProviders = provideSendContextToAi({
  recording: true,
  endpoint: '/internal/ai/context',
});
// #endregion endpoint-configuration

describe('guide/ai/send-context-webhook.md #configuration', () => {
  it('keeps the documented webhook configuration valid', () => {
    expect(aiContextProviders).toEqual(expect.any(Array));
  });
});

describe('guide/ai/send-context-webhook.md #minimal', () => {
  it('keeps the minimal provider setup valid', () => {
    expect(minimalAiContextProviders).toEqual(expect.any(Array));
  });
});

describe('guide/ai/send-context-webhook.md #endpoint-configuration', () => {
  it('keeps the endpoint configuration valid', () => {
    expect(customizedAiContextProviders).toEqual(expect.any(Array));
  });
});
