import { describe, expect, it } from 'vitest';
import {
  createCorsMiddleware,
  createCsrfMiddleware,
  createHttpMetrics,
  createHttpServer,
  createRateLimitMiddleware,
  createSecurityMiddleware,
  matchServerRoute,
} from './http-server';

describe('HTTP server runtime', () => {
  it('matches methods, parameter segments and wildcard routes', () => {
    const route = {
      method: 'GET' as const,
      path: '/users/:id/*',
      handler: () => new Response('ok'),
    };

    expect(
      matchServerRoute(
        new Request('https://example.test/users/42/files/avatar.png'),
        [route],
      ),
    ).toMatchObject({ params: { id: '42', wildcard: 'files/avatar.png' } });
    expect(
      matchServerRoute(
        new Request('https://example.test/users/42', { method: 'POST' }),
        [route],
      ),
    ).toBeUndefined();
  });

  it('creates a request context and response correlation id', async () => {
    const logs: Record<string, unknown>[] = [];
    const server = createHttpServer({
      routes: [
        {
          method: 'GET',
          path: '/users/:id',
          handler: (_request, context) =>
            Response.json({
              id: context.params.id,
              requestId: context.requestId,
            }),
        },
      ],
      loggerSink: (entry) => logs.push({ ...entry }),
    });

    const response = await server.handle(
      new Request('https://example.test/users/ada', {
        headers: { 'x-request-id': 'test-request' },
      }),
    );

    expect(response.headers.get('x-request-id')).toBe('test-request');
    await expect(response.json()).resolves.toEqual({
      id: 'ada',
      requestId: 'test-request',
    });
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'http.request.completed',
          status: 200,
        }),
      ]),
    );
  });

  it('rejects oversized requests and handles unknown routes uniformly', async () => {
    const server = createHttpServer({
      maxBodyBytes: 4,
      routes: [
        { method: 'POST', path: '/submit', handler: () => new Response('ok') },
      ],
    });

    const tooLarge = await server.handle(
      new Request('https://example.test/submit', {
        method: 'POST',
        headers: { 'content-length': '5' },
      }),
    );
    expect(tooLarge.status).toBe(413);
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: { code: 'HTTP_BODY_TOO_LARGE' },
    });

    const missing = await server.handle(
      new Request('https://example.test/missing'),
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'HTTP_ROUTE_NOT_FOUND' },
    });
  });

  it('returns a timeout response when a handler exceeds the request budget', async () => {
    const server = createHttpServer({
      timeoutMs: 5,
      routes: [
        {
          method: 'GET',
          path: '/slow',
          handler: async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return new Response('late');
          },
        },
      ],
    });

    const response = await server.handle(
      new Request('https://example.test/slow'),
    );
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'HTTP_REQUEST_TIMEOUT' },
    });
  });

  it('enforces CSRF for cookie-backed mutations and handles CORS preflight', async () => {
    const server = createHttpServer({
      middleware: [
        createCsrfMiddleware({ allowedOrigins: ['https://app.example.test'] }),
        createCorsMiddleware(['https://app.example.test']),
        createSecurityMiddleware({
          allowedOrigins: ['https://app.example.test'],
        }),
      ],
      routes: [
        {
          method: 'POST',
          path: '/submit',
          csrf: true,
          handler: () => new Response('ok'),
        },
      ],
    });

    const rejected = await server.handle(
      new Request('https://api.example.test/submit', {
        method: 'POST',
        headers: { cookie: 'session=secret' },
      }),
    );
    expect(rejected.status).toBe(403);

    const preflight = await server.handle(
      new Request('https://api.example.test/submit', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.test' },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.test',
    );
  });

  it('records request metrics and rejects requests above the configured limit', async () => {
    const metrics = createHttpMetrics();
    const server = createHttpServer({
      metrics,
      middleware: [
        createRateLimitMiddleware({
          limit: 2,
          windowMs: 1_000,
          key: () => 'test-client',
          now: () => 1_000,
        }),
      ],
      routes: [
        { method: 'GET', path: '/limited', handler: () => new Response('ok') },
      ],
    });

    await expect(
      server.handle(new Request('https://example.test/limited')),
    ).resolves.toHaveProperty('status', 200);
    await expect(
      server.handle(new Request('https://example.test/limited')),
    ).resolves.toHaveProperty('status', 200);
    const rejected = await server.handle(
      new Request('https://example.test/limited'),
    );

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('retry-after')).toBe('1');
    expect(rejected.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(metrics.snapshot()).toMatchObject({
      requests: 3,
      errors: 1,
      statusCounts: { '200': 2, '429': 1 },
    });
  });
});
