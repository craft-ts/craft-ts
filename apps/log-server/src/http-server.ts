import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseBatch } from './log-entry.js';
import type { LogStore } from './log-store.js';

export type LogHttpServerOptions = {
  readonly store: LogStore;
  readonly host?: string;
  readonly port?: number;
  /** Reject bodies larger than this, in bytes. */
  readonly maxBodySize?: number;
  /** Called after every accepted batch; used for console echo. */
  readonly onIngest?: (count: number) => void;
};

const DEFAULT_MAX_BODY_SIZE = 2 * 1024 * 1024;

// Dev-only server bound to the loopback interface: any local origin (the demo
// dev server, storybook, an e2e run) is allowed to post.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
} as const;

export function createLogHttpServer(options: LogHttpServerOptions): Server {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  return createServer((request, response) => {
    void handleRequest(request, response, options, maxBodySize).catch(
      (error: unknown) => {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LogHttpServerOptions,
  maxBodySize: number,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      status: 'ok',
      file: options.store.filePath,
      size: options.store.size(),
    });
    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/logs') {
    options.store.clear();
    sendJson(response, 200, { cleared: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/logs') {
    let body: string;
    try {
      body = await readBody(request, maxBodySize);
    } catch (error) {
      sendJson(response, 413, {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON body' });
      return;
    }

    const entries = parseBatch(payload);
    options.store.append(entries);
    options.onIngest?.(entries.length);
    sendJson(response, 202, { accepted: entries.length });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function readBody(
  request: IncomingMessage,
  maxBodySize: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    let overflowed = false;

    request.on('data', (chunk: Buffer) => {
      if (overflowed) return;

      size += chunk.length;
      if (size > maxBodySize) {
        overflowed = true;
        chunks.length = 0;
        // Keep draining instead of destroying the socket, otherwise the client
        // sees a connection reset instead of the 413.
        request.resume();
        reject(new Error(`Body exceeds ${maxBodySize} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.writableEnded) return;
  response.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
}
