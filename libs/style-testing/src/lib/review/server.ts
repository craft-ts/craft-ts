/**
 * Local HTTP boundary for the CraftTS review application.
 *
 * The browser owns interaction state. Node owns the queue, evidence bytes and
 * ledger writes: the application can be replaced without moving authority over
 * attestations into a browser tab.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReviewQueue, type ReviewCard, type ReviewItem } from './queue.js';

export interface ReviewDecisionRequest {
  readonly shape: string;
  readonly verdict: string;
  readonly note?: string;
}

export interface ReviewApiQueue {
  readonly items: number;
  readonly decisions: number;
  readonly cards: readonly ReviewCard[];
}

export interface ReviewServerOptions {
  readonly port?: number;
  readonly items?: readonly ReviewItem[];
  /** Called once per decision, expanded over its cluster by the caller. */
  readonly onDecision?: (
    decision: ReviewDecisionRequest,
  ) => void | Promise<void>;
  /** Serves a stored screenshot by hash. */
  readonly imageFor?: (hash: string) => Promise<Uint8Array | undefined>;
  /** Override used by package tests and embedders. */
  readonly appRoot?: string;
}

export interface RunningReviewServer {
  readonly url: string;
  readonly server: Server;
  close(): Promise<void>;
}

const MAX_DECISION_BYTES = 64 * 1024;

const reviewAppRoot = (): string => {
  const candidate = new URL('../../../review-app/', import.meta.url);
  return candidate.protocol === 'file:'
    ? fileURLToPath(candidate)
    : resolve(process.cwd(), 'libs/style-testing/review-app');
};

const queueValue = (cards: readonly ReviewCard[]): ReviewApiQueue => ({
  items: cards.reduce((total, card) => total + card.cluster.length, 0),
  decisions: cards.length,
  cards,
});

const writeJson = (
  response: import('node:http').ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
};

const readJson = async (request: IncomingMessage): Promise<unknown> =>
  await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DECISION_BYTES) {
        reject(new Error('review: decision body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('review: decision body is not valid JSON.'));
      }
    });
    request.on('error', reject);
  });

const isDecision = (value: unknown): value is ReviewDecisionRequest => {
  if (typeof value !== 'object' || value === null) return false;
  const decision = value as Partial<ReviewDecisionRequest>;
  return (
    typeof decision.shape === 'string' &&
    decision.shape.length > 0 &&
    typeof decision.verdict === 'string' &&
    (decision.note === undefined || typeof decision.note === 'string')
  );
};

export async function startReviewServer(
  options: ReviewServerOptions = {},
): Promise<RunningReviewServer> {
  const initial = buildReviewQueue(options.items ?? []);
  let cards = [...initial.cards];
  const port = options.port ?? 4320;
  const appRoot = options.appRoot ?? reviewAppRoot();
  const workspaceAliases = {
    '@craft-ts/core': resolve(appRoot, '../../core/src/index.ts'),
    '@craft-ts/component': resolve(appRoot, '../../component/src/index.ts'),
    '@craft-ts/style': resolve(appRoot, '../../style/src/index.ts'),
  };
  const aliases = Object.fromEntries(
    Object.entries(workspaceAliases).filter(([, path]) => existsSync(path)),
  );
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: appRoot,
    appType: 'spa',
    server: { middlewareMode: true, hmr: false },
    resolve: { alias: aliases, tsconfigPaths: true },
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/api/review') {
      writeJson(response, 200, queueValue(cards));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/decisions') {
      void (async () => {
        try {
          if (
            !request.headers['content-type']
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            throw new Error('review: decisions require application/json.');
          }
          const decision = await readJson(request);
          if (!isDecision(decision)) {
            throw new Error('review: expected a shape and a verdict.');
          }
          if (
            decision.verdict === 'rejected' &&
            (decision.note === undefined || decision.note.trim().length === 0)
          ) {
            throw new Error('review: rejected decisions require a reason.');
          }
          const card = cards.find(
            (candidate) => candidate.shape === decision.shape,
          );
          if (!card) {
            throw new Error('review: that diff cluster no longer exists.');
          }
          await options.onDecision?.(decision);
          cards = cards.filter(
            (candidate) => candidate.shape !== decision.shape,
          );
          writeJson(response, 200, queueValue(cards));
        } catch (error) {
          writeJson(response, 400, {
            error: error instanceof Error ? error.message : 'bad request',
          });
        }
      })();
      return;
    }

    const evidencePrefix = '/api/evidence/';
    if (request.method === 'GET' && url.pathname.startsWith(evidencePrefix)) {
      void (async () => {
        const hash = decodeURIComponent(
          url.pathname.slice(evidencePrefix.length),
        );
        if (!/^[a-f0-9]{32}$/.test(hash)) {
          response.writeHead(400).end();
          return;
        }
        const bytes = await options.imageFor?.(hash);
        if (!bytes) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=31536000, immutable',
        });
        response.end(Buffer.from(bytes));
      })();
      return;
    }

    vite.middlewares(request, response, (error: unknown) => {
      if (error) {
        response.writeHead(500, {
          'content-type': 'text/plain; charset=utf-8',
        });
        response.end(
          error instanceof Error ? error.message : 'review app error',
        );
        return;
      }
      response.writeHead(404).end();
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await vite.close();
    throw error;
  }
  const address = server.address();
  const listeningPort =
    typeof address === 'object' && address !== null ? address.port : port;
  return {
    url: `http://127.0.0.1:${listeningPort}`,
    server,
    close: async () => {
      await vite.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
