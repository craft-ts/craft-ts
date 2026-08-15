import { afterEach, describe, expect, it, vi } from 'vitest';
import { craftFetchTransport } from './craft-http';

describe('craftFetchTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a JSON 200 to a body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
    const result = await craftFetchTransport({ url: '/x', method: 'GET' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });

  it('preserves an HTTP error status with a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('Not found', {
            status: 404,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    );

    const result = await craftFetchTransport({
      url: '/missing',
      method: 'GET',
    });

    expect(result).toEqual({
      status: 404,
      body: 'Not found',
    });
  });
});
