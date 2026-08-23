import { describe, expect, it } from 'vitest';
import { createCraftLambdaFetch, lambdaEventToRequest } from './lambda-adapter';
import { createHttpServer } from './http-server';

describe('Lambda HTTP adapter', () => {
  it('converts a Function URL event to a Web request and response', async () => {
    const application = createHttpServer({
      routes: [
        {
          method: 'POST',
          path: '/echo',
          handler: async (request) => Response.json(await request.json()),
        },
      ],
    });
    const fetchHandler = createCraftLambdaFetch(application);

    await expect(
      fetchHandler({
        version: '2.0',
        rawPath: '/echo',
        rawQueryString: 'source=lambda',
        headers: {
          host: 'fn.example.test',
          'content-type': 'application/json',
        },
        requestContext: { http: { method: 'POST' } },
        body: JSON.stringify({ ok: true }),
      }),
    ).resolves.toMatchObject({
      statusCode: 200,
      isBase64Encoded: false,
      body: '{"ok":true}',
    });
  });

  it('decodes base64 bodies and preserves cookies', async () => {
    const request = lambdaEventToRequest({
      rawPath: '/private',
      headers: { host: 'fn.example.test' },
      cookies: ['session=abc', 'theme=dark'],
      body: btoa('hello'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'POST' } },
    });

    expect(request.headers.get('cookie')).toBe('session=abc; theme=dark');
    await expect(request.text()).resolves.toBe('hello');
  });
});
