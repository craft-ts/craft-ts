import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { connectDebugSessionXhrCapture } from './debug-session-xhr-capture';

describe('debug session XHR capture', () => {
  const prototype = XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const originalSetRequestHeader = prototype.setRequestHeader;

  afterEach(() => {
    prototype.open = originalOpen;
    prototype.send = originalSend;
    prototype.setRequestHeader = originalSetRequestHeader;
  });

  it('captures request and response with session-local redaction', async () => {
    prototype.open = vi.fn();
    prototype.setRequestHeader = vi.fn();
    prototype.send = vi.fn(function (this: XMLHttpRequest) {
      Object.defineProperties(this, {
        status: { configurable: true, value: 200 },
        statusText: { configurable: true, value: 'OK' },
        responseText: {
          configurable: true,
          value: JSON.stringify({
            token: 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op',
            cartId: '7e5a7f20-1f9d-4e80-9e6d-1086cfe2bf60',
          }),
        },
      });
      this.dispatchEvent(new ProgressEvent('loadend'));
    });

    const session = createSendContextSession();
    session.startRecord('xhr capture');
    const disconnect = connectDebugSessionXhrCapture(session);
    const xhr = new XMLHttpRequest();

    try {
      xhr.open('POST', 'https://api.example.test/carts');
      xhr.setRequestHeader('Authorization', 'Bearer short');
      xhr.send(
        JSON.stringify({
          token: 'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op',
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      disconnect();
    }

    const events = JSON.parse(session.exportSessionJson()).events as Array<{
      phase: string;
      payload?: {
        source?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      response?: { source?: string; body?: string };
      refs?: unknown[];
    }>;
    expect(events.map(({ phase }) => phase)).toEqual(['started', 'succeeded']);
    expect(events[0]?.payload).toMatchObject({ source: 'browser-xhr' });
    expect(events[0]?.payload?.headers?.['Authorization']).toMatch(
      /^craft-ref:/,
    );
    expect(events[0]?.payload?.body).not.toContain(
      'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op',
    );
    expect(events[1]?.response?.source).toBe('browser-xhr-response');
    expect(events[1]?.response?.body).not.toContain(
      'a8Df7Gh2Jk4Lp6Qw9Er1Ty3Ui5Op',
    );
    expect(events[0]?.refs?.length).toBeGreaterThan(0);
    expect(events[1]?.refs?.length).toBeGreaterThan(0);
  });
});
