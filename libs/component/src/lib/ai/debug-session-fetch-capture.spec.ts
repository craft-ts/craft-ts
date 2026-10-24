import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { connectDebugSessionFetchCapture } from './debug-session-fetch-capture';

describe('debug session browser fetch capture', () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('captures app fetch results and ignores Vite development probes', async () => {
    window.fetch = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const session = createSendContextSession();
    session.startRecord('fetch capture');
    const disconnect = connectDebugSessionFetchCapture(session);

    try {
      await window.fetch('http://localhost:4201/__demo/typecheck');
      await window.fetch('http://localhost:4201/api/search');
    } finally {
      disconnect();
    }

    const events = JSON.parse(session.exportSessionJson()).events as Array<{
      kind: string;
      phase: string;
      payload?: { source?: string; url?: string };
    }>;
    expect(
      events
        .filter((event) => event.kind === 'http')
        .map((event) => event.phase),
    ).toEqual(['started', 'succeeded']);
    expect(events[0]?.payload).toMatchObject({
      source: 'browser-fetch',
      url: 'http://localhost:4201/api/search',
    });
  });

  it('captures binary response bytes for Blob and ArrayBuffer consumers', async () => {
    window.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([0, 1, 2, 254, 255]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
    );
    const session = createSendContextSession();
    session.startRecord('binary fetch capture');
    const disconnect = connectDebugSessionFetchCapture(session);

    try {
      const response = await window.fetch('http://localhost:4201/api/file');
      expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
        0, 1, 2, 254, 255,
      ]);
    } finally {
      disconnect();
    }

    const events = JSON.parse(session.exportSessionJson()).events as Array<{
      kind: string;
      phase: string;
      response?: { body?: { encoding?: string; data?: string } };
    }>;
    expect(
      events.find((event) => event.phase === 'succeeded')?.response,
    ).toMatchObject({
      body: { encoding: 'base64', data: 'AAEC/v8=' },
    });
  });
});
