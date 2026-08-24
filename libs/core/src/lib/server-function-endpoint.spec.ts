import { describe, expect, it } from 'vitest';
import { createServerFunctionFetchTransport } from './server-function-client';

describe('server function endpoint transport', () => {
  it('resolves a Function URL from the server-function id and preserves the protocol', async () => {
    let requestedUrl = '';
    let requestedBody: unknown;
    const transport = createServerFunctionFetchTransport({
      endpoint: (id) => {
        requestedUrl = `https://lambda.example.test/${id}`;
        return requestedUrl;
      },
      fetch: async (input, init) => {
        requestedBody = JSON.parse(String(init?.body));
        return Response.json({ ok: true });
      },
    });

    await expect(
      transport({
        id: 'demo.products.list',
        input: {},
        context: { workspaceId: 'demo' },
        protocolVersion: 1,
      }),
    ).resolves.toEqual({ ok: true });
    expect(requestedUrl).toBe('https://lambda.example.test/demo.products.list');
    expect(requestedBody).toEqual({
      id: 'demo.products.list',
      input: {},
      context: { workspaceId: 'demo' },
      protocolVersion: 1,
    });
  });

  it('keeps typed HTTP failures when the remote endpoint rejects', async () => {
    const transport = createServerFunctionFetchTransport({
      endpoint: 'https://lambda.example.test/products',
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: 'denied' } }), {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(
      transport({ id: 'demo.products.list', input: {} }),
    ).resolves.toMatchObject({
      _tag: 'HttpError',
      payload: {
        status: 403,
        statusText: 'Forbidden',
      },
    });
  });
});
