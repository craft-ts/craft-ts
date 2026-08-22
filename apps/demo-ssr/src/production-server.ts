import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const port = Number(process.env.PORT ?? 4300);

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

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
    }
    response.end('Internal Server Error');
  });
});

server.listen(port, () => {
  console.log(`CraftTS SSR demo listening on http://localhost:${port}`);
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

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

  if (requestUrl.pathname === '/api/deferred') {
    const payload = await renderDeferredApi();
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
      'cache-control': 'no-store',
    });
    return;
  }

  if (await serveStaticFile(requestUrl.pathname, response)) {
    return;
  }

  const demo = createDemoApplication(authenticatedUserFromRequest(request));
  try {
    const result = await renderPage(requestUrl, assets, demo.application);
    send(response, result.status, 'text/html; charset=utf-8', result.html, {
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
  if (relativePath.startsWith('..') || relativePath.includes(`..${normalize('/')}`)) {
    response.statusCode = 400;
    response.end();
    return true;
  }

  try {
    const content = await readFile(requestedPath);
    send(response, 200, contentTypes[extname(requestedPath)] ?? 'application/octet-stream', content);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
}

async function loadRenderAssets(): Promise<RenderAssets> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, ViteManifestEntry>;
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
