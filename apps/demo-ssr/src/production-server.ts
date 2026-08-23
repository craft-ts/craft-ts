import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile } from 'node:fs/promises';
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentSecurityPolicy,
  createCorsMiddleware,
  createCspNonce,
  createCsrfMiddleware,
  createHttpServer as createHttpApplication,
  createRateLimitMiddleware,
  createSecurityMiddleware,
  type ServerRoute,
} from '@craft-ts/core';
import {
  authenticatedUserFromRequest,
  handleServerFunctionRequest,
  renderDeferredApi,
  renderPage,
  type RenderAssets,
} from './server';
import { createDemoApplication } from '../../demo-with-server-function/src/server/server';

type ViteManifestEntry = Readonly<{
  file: string;
  css?: readonly string[];
}>;

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const clientDirectory = resolve(serverDirectory, '..');
const manifestPath = join(clientDirectory, '.vite/manifest.json');
const host = process.env.HOST ?? '0.0.0.0';
const port = readPositiveInteger(process.env.PORT, 4300, 'PORT');
const shutdownTimeoutMs = readPositiveInteger(
  process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  10_000,
  'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
);
const corsOrigins = configuredCorsOrigins();
/**
 * Hôtes servis par ce processus. L'origine d'une requête est déduite de son
 * en-tête `Host` : sans cette liste, un client pourrait se déclarer
 * same-origin et passer les contrôles CSRF.
 */
const trustedHosts = configuredTrustedHosts();
const rateLimitMax = readPositiveInteger(
  process.env.RATE_LIMIT_MAX,
  120,
  'RATE_LIMIT_MAX',
);
const rateLimitWindowMs = readPositiveInteger(
  process.env.RATE_LIMIT_WINDOW_MS,
  60_000,
  'RATE_LIMIT_WINDOW_MS',
);

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const assets = await loadRenderAssets();
let ready = false;
let shuttingDown = false;
const apiRoutes: readonly ServerRoute[] = [
  {
    method: 'GET',
    path: '/health',
    cache: 'no-store',
    handler: () => Response.json({ status: 'ok' }),
  },
  {
    method: 'GET',
    path: '/ready',
    cache: 'no-store',
    handler: () =>
      Response.json(
        { status: ready ? 'ok' : 'not_ready' },
        { status: ready ? 200 : 503 },
      ),
  },
  {
    method: 'GET',
    path: '/api/deferred',
    csrf: false,
    cache: 'no-store',
    handler: async () => Response.json(await renderDeferredApi()),
  },
];
const apiApplication = createHttpApplication({
  routes: apiRoutes,
  trustedHosts,
  middleware: [
    ...(rateLimitMax > 0
      ? [
          createRateLimitMiddleware({
            limit: rateLimitMax,
            windowMs: rateLimitWindowMs,
            // Le quota est par appelant : l'adresse vient de l'en-tête posé
            // par le proxy de confiance, jamais d'un en-tête arbitraire.
            key: (request) =>
              request.headers.get('x-real-ip') ??
              request.headers.get('cf-connecting-ip') ??
              'unknown',
            skip: (request) => {
              const pathname = new URL(request.url).pathname;
              return pathname === '/health' || pathname === '/ready';
            },
          }),
        ]
      : []),
    createCsrfMiddleware({ allowedOrigins: corsOrigins }),
    createCorsMiddleware(corsOrigins),
    createSecurityMiddleware({
      allowedOrigins: corsOrigins,
      forceHttps: process.env.FORCE_HTTPS === 'true',
    }),
  ],
  maxBodyBytes: 1_048_576,
  timeoutMs: 15_000,
});

const server = createServer((request, response) => {
  const startedAt = Date.now();
  const requestId = requestIdFromNode(request);
  const cspNonce = createCspNonce();
  response.setHeader('x-request-id', requestId);
  applySecurityHeaders(request, response, cspNonce);
  response.once('finish', () => {
    if (
      isApiPath(
        new URL(
          request.url ?? '/',
          `http://${request.headers.host ?? 'localhost'}`,
        ).pathname,
      )
    ) {
      return;
    }
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'http.request.completed',
        requestId,
        method: request.method ?? 'GET',
        path: new URL(
          request.url ?? '/',
          `http://${request.headers.host ?? 'localhost'}`,
        ).pathname,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
  });
  if (shuttingDown) {
    sendJson(response, 503, { status: 'shutting_down' });
    return;
  }
  void handleRequest(request, response, cspNonce).catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
    }
    response.end('Internal Server Error');
  });
});

server.on('error', (error) => {
  console.error('CraftTS SSR server error', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  ready = true;
  const address = server.address();
  const displayPort =
    typeof address === 'object' && address ? address.port : port;
  console.log(`CraftTS SSR demo listening on http://${host}:${displayPort}`);
});

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  cspNonce: string,
): Promise<void> {
  const host = request.headers.host ?? 'localhost';
  // L'hôte annoncé décide de l'origine de la requête : hors allowlist, la
  // réponse s'arrête ici plutôt que de laisser un client la choisir.
  if (trustedHosts.length > 0 && !trustedHosts.includes(host)) {
    sendJson(response, 400, { error: 'HTTP_HOST_NOT_ALLOWED' });
    return;
  }
  const requestUrl = new URL(request.url ?? '/', `http://${host}`);

  if (isApiPath(requestUrl.pathname)) {
    const webResponse = await apiApplication.handle(toWebRequest(request));
    await writeWebResponse(webResponse, response, request.method === 'HEAD');
    return;
  }

  if (requestUrl.pathname === '/__server-functions') {
    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.setHeader('allow', 'POST');
      response.end();
      return;
    }
    await handleServerFunctionRequest(
      request,
      response,
      authenticatedUserFromRequest(request),
    );
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('allow', 'GET, HEAD');
    response.end();
    return;
  }

  if (await serveStaticFile(requestUrl.pathname, response)) {
    return;
  }

  const demo = createDemoApplication(authenticatedUserFromRequest(request));
  try {
    const result = await renderPage(
      requestUrl,
      assets,
      demo.application,
      cspNonce,
    );
    send(response, result.status, 'text/html; charset=utf-8', result.html, {
      'cache-control': 'no-store',
      'x-demo-rendered-by': 'ssr',
    });
  } finally {
    demo.close();
  }
}

async function serveStaticFile(
  pathname: string,
  response: ServerResponse,
): Promise<boolean> {
  if (pathname === '/' || !pathname.startsWith('/assets/')) {
    return false;
  }

  const requestedPath = resolve(clientDirectory, `.${pathname}`);
  const relativePath = relative(clientDirectory, requestedPath);
  if (
    relativePath.startsWith('..') ||
    relativePath.includes(`..${normalize('/')}`)
  ) {
    response.statusCode = 400;
    response.end();
    return true;
  }

  try {
    const content = await readFile(requestedPath);
    send(
      response,
      200,
      contentTypes[extname(requestedPath)] ?? 'application/octet-stream',
      content,
      { 'cache-control': 'public, max-age=31536000, immutable' },
    );
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
}

async function loadRenderAssets(): Promise<RenderAssets> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
    string,
    ViteManifestEntry
  >;
  const entry = manifest['index.html'];
  if (!entry) {
    throw new Error(`Missing index.html entry in ${manifestPath}`);
  }

  const styleHref = entry.css?.[0];
  if (!styleHref) {
    throw new Error(`Missing CSS asset in ${manifestPath}`);
  }

  return {
    scriptSrc: `/${entry.file}`,
    styleHref: `/${styleHref}`,
  };
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Uint8Array,
  headers: Readonly<Record<string, string>> = {},
): void {
  response.statusCode = status;
  response.setHeader('content-type', contentType);
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
  if (response.req?.method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Readonly<Record<string, string>>,
): void {
  send(
    response,
    status,
    'application/json; charset=utf-8',
    JSON.stringify(body),
    { 'cache-control': 'no-store' },
  );
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === '/health' ||
    pathname === '/ready' ||
    pathname === '/api' ||
    pathname.startsWith('/api/')
  );
}

function configuredCorsOrigins(): readonly string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function configuredTrustedHosts(): readonly string[] {
  return (process.env.TRUSTED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

function requestIdFromNode(request: IncomingMessage): string {
  const candidate = request.headers['x-request-id'];
  if (
    typeof candidate === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
  ) {
    return candidate;
  }
  return (
    globalThis.crypto?.randomUUID?.() ?? `request-${Date.now().toString(36)}`
  );
}

function toWebRequest(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(
    `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`,
    {
      method,
      headers,
      ...(hasBody
        ? { body: request as unknown as BodyInit, duplex: 'half' }
        : {}),
    } as RequestInit,
  );
}

async function writeWebResponse(
  webResponse: Response,
  response: ServerResponse,
  head: boolean,
): Promise<void> {
  response.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) {
    response.setHeader(name, value);
  }
  if (head || webResponse.body === null) {
    response.end();
    return;
  }
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}

function applySecurityHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  nonce: string,
): void {
  // Le nonce est celui reporté sur les styles rendus par le SSR : la
  // politique n'a donc pas besoin de tolérer `'unsafe-inline'`.
  response.setHeader('content-security-policy', contentSecurityPolicy(nonce));
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'permissions-policy',
    'camera=(), geolocation=(), microphone=()',
  );

  // Forwarded headers are untrusted unless the deployment adapter has already
  // authenticated the proxy boundary. This demo opts into HSTS explicitly.
  const isHttps = process.env.FORCE_HTTPS === 'true';
  if (isHttps) {
    response.setHeader(
      'strict-transport-security',
      'max-age=31536000; includeSubDomains',
    );
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  console.log(`CraftTS SSR demo shutting down after ${signal}`);

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      server.closeIdleConnections?.();
      finish();
    }, shutdownTimeoutMs);
    server.close((error) => {
      if (error) console.error('CraftTS SSR graceful shutdown error', error);
      finish();
    });
  });
  process.exit(0);
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`${name} must be an integer between 0 and 65535.`);
  }
  return parsed;
}
