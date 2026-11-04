import { describe, expect, it, vi } from 'vitest';
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
  it.each<Record<string, string>>([
    { cookie: 'sid=1' },
    { cookie: 'sid=1', 'sec-fetch-site': 'cross-site' },
    { cookie: 'sid=1', 'sec-fetch-site': 'same-site' },
  ])(
    'rejects unsafe cookie mutations before resolving identity: %j',
    async (headers) => {
      const user = vi.fn(() => ({ id: 'ada' }));
      const handler = vi.fn(() => new Response('mutated'));
      const server = createHttpServer({ logger: silentLogger, user, handler });

      const response = await server.handle(mutation('/plain', headers));

      expect(response.status).toBe(403);
      expect(user).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each<Record<string, string>>([
    {},
    { origin: 'https://app.test', cookie: 'sid=1' },
    { 'sec-fetch-site': 'same-origin', cookie: 'sid=1' },
  ])(
    'accepts a trusted mutation or a client without cookies: %j',
    async (headers) => {
      const server = createHttpServer({
        logger: silentLogger,
        handler: () => new Response('ok'),
      });
      const response = await server.handle(
        new Request('https://app.test/plain', {
          method: 'POST',
          headers,
        }),
      );
      expect(response.status).toBe(200);
    },
  );

  it('accepts an explicitly allowed cross-origin mutation on a csrf route', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      allowedOrigins: ['https://client.test'],
      routes: [
        {
          method: 'POST',
          path: '/transfer',
          csrf: true,
          handler: () => new Response('ok'),
        },
      ],
    });
    const response = await server.handle(
      mutation('/transfer', {
        origin: 'https://client.test',
        'sec-fetch-site': 'cross-site',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://client.test',
    );
  });

  it('keeps csrf off as an explicit opt-out', async () => {
    const server = createHttpServer({
      logger: silentLogger,
      csrf: 'off',
      handler: () => new Response('ok'),
    });
    expect(
      (
        await server.handle(
          mutation('/plain', { 'sec-fetch-site': 'cross-site' }),
        )
      ).status,
    ).toBe(200);
  });

  it.each([undefined, '1'])(
    'bounds the actual streaming body despite Content-Length: %s',
    async (contentLength) => {
      const user = vi.fn(() => ({ id: 'ada' }));
      const handler = vi.fn(() => new Response('ok'));
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('abc'));
        },
        cancel,
      });
      const server = createHttpServer({
        logger: silentLogger,
        maxBodyBytes: 4,
        user,
        handler,
      });
      const response = await server.handle(
        new Request('https://app.test/upload', {
          method: 'POST',
          body,
          ...(contentLength === undefined
            ? {}
            : { headers: { 'content-length': contentLength } }),
          duplex: 'half',
        } as RequestInit),
      );

      expect(response.status).toBe(413);
      expect(user).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    },
  );

  it('counts UTF-8 bytes and preserves an accepted body for downstream readers', async () => {
    const handler = vi.fn(
      async (request: Request) => new Response(await request.text()),
    );
    const server = createHttpServer({
      logger: silentLogger,
      maxBodyBytes: 4,
      handler,
    });
    const accepted = await server.handle(
      new Request('https://app.test/upload', { method: 'POST', body: 'éé' }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe('éé');
    const rejected = await server.handle(
      new Request('https://app.test/upload', { method: 'POST', body: 'ééé' }),
    );
    expect(rejected.status).toBe(413);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled upload and cancels it before resolving identity', async () => {
    const user = vi.fn(() => ({ id: 'ada' }));
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const server = createHttpServer({
      logger: silentLogger,
      timeoutMs: 5,
      user,
      handler: () => new Response('ok'),
    });
    const response = await server.handle(
      new Request('https://app.test/upload', {
        method: 'POST',
        body,
        duplex: 'half',
      } as RequestInit),
    );
    expect(response.status).toBe(504);
    expect(user).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it.each(['resolve', 'reject'])(
    'keeps timed-out work in its concurrency slot until it settles: %s',
    async (settlement) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve, reject) => {
        release = () =>
          settlement === 'resolve'
            ? resolve()
            : reject(new Error('late failure'));
      });
      const server = createHttpServer({
        logger: silentLogger,
        timeoutMs: 5,
        maxConcurrentRequests: 1,
        handler: async () => {
          await pending;
          return new Response('late');
        },
      });
      try {
        expect(
          (await server.handle(new Request('https://app.test/slow'))).status,
        ).toBe(504);
        expect(
          (await server.handle(new Request('https://app.test/slow'))).status,
        ).toBe(503);
      } finally {
        release();
      }
      await vi.waitFor(async () => {
        expect(
          (await server.handle(new Request('https://app.test/slow'))).status,
        ).toBe(settlement === 'resolve' ? 200 : 500);
      });
    },
  );

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
      routes: [{ method: 'GET', path: '/', handler: () => new Response('ok') }],
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
        {
          method: 'GET',
          path: '/files/:name',
          handler: () => new Response('ok'),
        },
      ],
    });
    const response = await server.handle(
      new Request('https://app.test/files/%zz'),
    );
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
    expect(response.headers.get('cross-origin-opener-policy')).toBe(
      'same-origin',
    );
  });

  it('keeps unsafe-inline only when no nonce is used', () => {
    expect(contentSecurityPolicy()).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
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
