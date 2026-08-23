import { describe, expect, it } from 'vitest';
import {
  createHttpServer,
  createSecurityMiddleware,
  contentSecurityPolicy,
} from '../src/lib/http-server';
import {
  createCraftLambdaFetch,
  lambdaEventToRequest,
} from '../src/lib/lambda-adapter';

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function mutation(
  path = '/transfer',
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://app.test${path}`, {
    method: 'POST',
    headers: { cookie: 'sid=1', ...headers },
    body: '{}',
  });
}

describe('HTTP security guards', () => {
  it('rejects a cross-origin mutation on a csrf route', async () => {
    let called = false;
    const server = createHttpServer({
      logger: silentLogger,
      routes: [
        {
          method: 'POST',
          path: '/transfer',
          csrf: true,
          handler: () => {
            called = true;
            return new Response('ok');
          },
        },
      ],
    });

    const foreign = await server.handle(
      mutation('/transfer', { origin: 'https://evil.test' }),
    );
    expect(foreign.status).toBe(403);
    expect(called).toBe(false);

    const crossSite = await server.handle(
      mutation('/transfer', { 'sec-fetch-site': 'cross-site' }),
    );
    expect(crossSite.status).toBe(403);

    const sameOrigin = await server.handle(
      mutation('/transfer', { origin: 'https://app.test' }),
    );
    expect(sameOrigin.status).toBe(200);
    expect(called).toBe(true);
  });

  it('rejects foreign mutations before any route opts in', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      routes: [
        { method: 'POST', path: '/plain', handler: () => new Response('ok') },
      ],
    });
    const response = await server.handle(
      mutation('/plain', { origin: 'https://evil.test' }),
    );
    expect(response.status).toBe(403);
  });

  it('refuses an untrusted Host so the request origin cannot be forged', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      trustedHosts: ['app.test'],
      routes: [
        { method: 'GET', path: '/', handler: () => new Response('ok') },
      ],
    });
    const spoofed = await server.handle(new Request('https://evil.test/'));
    expect(spoofed.status).toBe(400);
    const legitimate = await server.handle(new Request('https://app.test/'));
    expect(legitimate.status).toBe(200);
  });

  it('runs the entry guards before resolving the session', async () => {
    const order: string[] = [];
    const server = createHttpServer({
      logger: silentLogger,
      user: () => {
        order.push('user');
        return { id: 'ada' };
      },
      routes: [
        {
          method: 'POST',
          path: '/plain',
          handler: () => new Response('ok'),
        },
      ],
    });
    const response = await server.handle(
      mutation('/plain', { origin: 'https://evil.test' }),
    );
    expect(response.status).toBe(403);
    expect(order).toEqual([]);
  });

  it('turns a failing session resolver into a clean error response', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      user: () => {
        throw new Error('session store unreachable');
      },
      routes: [{ method: 'GET', path: '/', handler: () => new Response('ok') }],
    });
    const response = await server.handle(new Request('https://app.test/'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'HTTP_INTERNAL_ERROR', message: 'Internal Server Error.' },
    });
  });

  it('answers an invalid percent-encoded path with a 400', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      routes: [
        { method: 'GET', path: '/files/:name', handler: () => new Response('ok') },
      ],
    });
    const response = await server.handle(new Request('https://app.test/files/%zz'));
    expect(response.status).toBe(400);
  });

  it('binds the CSP to a per-request nonce instead of unsafe-inline', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      middleware: [createSecurityMiddleware()],
      routes: [{ method: 'GET', path: '/', handler: () => new Response('ok') }],
    });
    const response = await server.handle(new Request('https://app.test/'));
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/_-]+'/);
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).toContain("form-action 'self'");
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('keeps unsafe-inline only when no nonce is used', () => {
    expect(contentSecurityPolicy()).toContain("style-src 'self' 'unsafe-inline'");
    expect(contentSecurityPolicy('abc')).toContain("'nonce-abc'");
  });

  it('sheds load instead of accepting more work than it can finish', async () => {
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createHttpServer({
      logger: silentLogger,
      maxConcurrentRequests: 1,
      routes: [
        {
          method: 'GET',
          path: '/slow',
          handler: async () => {
            await started;
            return new Response('ok');
          },
        },
      ],
    });
    const first = server.handle(new Request('https://app.test/slow'));
    const second = await server.handle(new Request('https://app.test/slow'));
    expect(second.status).toBe(503);
    expect(second.headers.get('retry-after')).toBe('1');
    release?.();
    expect((await first).status).toBe(200);
    const third = await server.handle(new Request('https://app.test/slow'));
    expect(third.status).toBe(200);
  });

  it('does not let a Lambda event forge its own origin', async () => {
    const spoofed = lambdaEventToRequest({
      requestContext: { http: { method: 'POST', path: '/transfer' } },
      headers: { host: 'evil.test', origin: 'https://evil.test' },
      body: '{}',
    });
    expect(new URL(spoofed.url).origin).not.toBe('https://evil.test');

    const handler = createCraftLambdaFetch(
      { handle: async () => new Response('ok') },
      { trustedHosts: ['app.test'] },
    );
    const rejected = await handler({
      requestContext: { http: { method: 'GET', path: '/' } },
      headers: { host: 'evil.test' },
    });
    expect(rejected.statusCode).toBe(400);

    const accepted = await handler({
      requestContext: { http: { method: 'GET', path: '/' } },
      headers: { host: 'app.test' },
    });
    expect(accepted.statusCode).toBe(200);
  });

  it('keeps Set-Cookie headers separate in the Lambda response', async () => {
    const handler = createCraftLambdaFetch({
      handle: async () => {
        const headers = new Headers();
        headers.append('set-cookie', 'a=1; Path=/');
        headers.append('set-cookie', 'b=2; Path=/');
        return new Response('ok', { headers });
      },
    });
    const response = await handler({
      requestContext: { http: { method: 'GET', path: '/' } },
      headers: {},
    });
    expect(response.cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
