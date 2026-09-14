import { describe, expect, it } from 'vitest';
import {
  provideSendContextEventEnricher,
  provideSendContextEventFilter,
  provideSendContextEventSource,
  provideSendContextToAi,
  SEND_CONTEXT_REDACTOR,
  SEND_CONTEXT_RETENTION_POLICY,
  SEND_CONTEXT_VALUE_SERIALIZER,
} from '@craft-ts/component';
import { useSnippetHarness } from '../../snippet-harness';

useSnippetHarness();

// #region minimal
export const minimalAiContextProviders = [provideSendContextToAi()];
// #endregion minimal

// #region configuration
export const aiContextProviders = provideSendContextToAi({
  endpoint: 'https://agent.example.com/hooks/context',
});
// #endregion configuration

// #region session-customization
export const customizedAiContextProviders = [
  provideSendContextToAi(),
  {
    provide: SEND_CONTEXT_RETENTION_POLICY,
    useValue: { maxEvents: 250, maxBytes: 1024 * 1024 },
  },
  {
    provide: SEND_CONTEXT_REDACTOR,
    useValue: (value: unknown) =>
      typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value).map(([key, entry]) =>
              /tenantId|email/i.test(key) ? [key, '[REDACTED]'] : [key, entry],
            ),
          )
        : value,
  },
  {
    provide: SEND_CONTEXT_VALUE_SERIALIZER,
    useValue: (value: unknown) =>
      value instanceof Date ? value.toISOString() : value,
  },
  provideSendContextEventEnricher((event) => ({
    ...event,
    source: 'checkout',
  })),
  provideSendContextEventFilter(
    (event) => event.name !== 'healthcheck' || event.kind !== 'custom',
  ),
  provideSendContextEventSource((session) => {
    session.capture('custom', 'emitted', {
      name: 'checkout.context-ready',
    });
    return () => undefined;
  }),
];
// #endregion session-customization

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

describe('guide/ai/send-context-webhook.md #session-customization', () => {
  it('keeps the DI customization setup valid', () => {
    expect(customizedAiContextProviders).toEqual(expect.any(Array));
  });
});
