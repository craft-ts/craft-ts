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
import type {
  AttestationDevtoolModel,
  RemovalReviewCard,
  TemplateReviewCard,
} from '@craft-ts/dev-tools/attestation-review';
import {
  reviewIterationPaths,
  writeReviewIterationHandoff,
  type ReviewIterationOptions,
  type ReviewIterationResult,
} from './handoff.js';

export type AttestationReviewCard =
  | ReviewCard
  | TemplateReviewCard
  | RemovalReviewCard;

export interface ReviewFinding {
  readonly path: string;
  readonly note: string;
}

export interface ReviewDecisionRequest {
  readonly shape: string;
  readonly id?: string;
  readonly revision?: string;
  readonly verdict: string;
  readonly note?: string;
  readonly retirementReason?: 'superseded' | 'defect' | 'derivation';
  /** Nodes the reviewer pointed at. Checked against the card's attested set. */
  readonly findings?: readonly ReviewFinding[];
  /** Set when the verdict was reached on the screenshot, not a faithful replay. */
  readonly degraded?: boolean;
}

export interface ReviewSessionDecision {
  readonly card: AttestationReviewCard;
  readonly decision: ReviewDecisionRequest;
}

export interface ReviewDecisionReopenRequest {
  readonly shape: string;
  readonly id?: string;
}

export interface ReviewApiQueue {
  readonly items: number;
  readonly decisions: number;
  readonly cards: readonly AttestationReviewCard[];
  readonly visualAssets: AttestationDevtoolModel['visualAssets'];
  readonly visualTests: AttestationDevtoolModel['visualTests'];
  readonly templateObligations: AttestationDevtoolModel['templateObligations'];
  readonly diagnostics: AttestationDevtoolModel['diagnostics'];
  /** Decisions accepted during this review session, in acceptance order. */
  readonly history: readonly ReviewSessionDecision[];
  /** Present only when this server knows how to rebuild its source reports. */
  readonly regeneration?: {
    readonly previousDecisions: number;
  };
  /** Present when this session can export rejected cards for a code iteration. */
  readonly iteration?: {
    readonly feedbackPath: string;
    readonly feedbackJsonPath: string;
    readonly promptPath: string;
  };
}

export type ReviewIterationHandoffResponse = ReviewIterationResult;

export interface ReviewCloseResponse {
  readonly closed: true;
  readonly rejectedCards: number;
  readonly promptPath: string;
}

export interface ReviewRegenerationResult {
  readonly cards: readonly AttestationReviewCard[];
  readonly model: Omit<AttestationDevtoolModel, 'cards'>;
  readonly previousDecisions: number;
}

export interface ReviewServerOptions {
  readonly port?: number;
  readonly items?: readonly ReviewItem[];
  /** Pre-built mixed cards for the unified DevTool. */
  readonly cards?: readonly AttestationReviewCard[];
  readonly model?: Omit<AttestationDevtoolModel, 'cards'>;
  /** Re-derives cards from the authoritative ledger before reads/decisions. */
  readonly refreshCards?: () => Promise<readonly AttestationReviewCard[]>;
  /** Re-runs configured producers, then re-derives the complete review model. */
  readonly regenerate?: () => Promise<ReviewRegenerationResult>;
  /** Number shown in the confirmation before the first regeneration. */
  readonly previousDecisions?: number;
  /** Called once per decision, expanded over its cluster by the caller. */
  readonly onDecision?: (
    decision: ReviewDecisionRequest,
  ) =>
    | void
    | readonly AttestationReviewCard[]
    | Promise<void | readonly AttestationReviewCard[]>;
  /** Reverses a session decision in the authoritative store. */
  readonly onReopen?: (
    entry: ReviewSessionDecision,
  ) =>
    | void
    | readonly AttestationReviewCard[]
    | Promise<void | readonly AttestationReviewCard[]>;
  /** Serves a stored screenshot by hash. */
  readonly imageFor?: (hash: string) => Promise<Uint8Array | undefined>;
  /**
   * Serves a stored frozen document by hash.
   *
   * Same origin as the review application on purpose: the snapshot carries no
   * script of its own, so every interactive thing a reviewer does — dimming the
   * decor, selecting a node — is done by the parent frame reaching into the
   * iframe. A cross-origin frame would make all of that impossible and push the
   * work back into the snapshot, where it would stop being inert.
   */
  readonly snapshotFor?: (hash: string) => Promise<string | undefined>;
  /** Serves the attested digest by evidence hash, so the replay can be checked. */
  readonly digestFor?: (hash: string) => Promise<string | undefined>;
  /** Override used by package tests and embedders. */
  readonly appRoot?: string;
  /** Project paths used to generate the human-to-Codex iteration handoff. */
  readonly iteration?: ReviewIterationOptions;
  /** Called when the browser explicitly ends the review session. */
  readonly onClose?: (handoff?: ReviewIterationResult) => void | Promise<void>;
}

export interface RunningReviewServer {
  readonly url: string;
  readonly server: Server;
  close(): Promise<void>;
}

const MAX_DECISION_BYTES = 64 * 1024;
const REVIEW_VERDICTS = new Set([
  'ok',
  'ok-with-note',
  'known-issue',
  'rejected',
  'blocked',
  'retire',
]);
const SESSION_ACCEPTED_VERDICTS = new Set([
  'ok',
  'ok-with-note',
  'known-issue',
  'retire',
]);

const reviewAppRoot = (): string => {
  const candidate = new URL('../../../attestation-app/', import.meta.url);
  return candidate.protocol === 'file:'
    ? fileURLToPath(candidate)
    : resolve(process.cwd(), 'libs/style-testing/attestation-app');
};

const queueValue = (
  cards: readonly AttestationReviewCard[],
  model: ReviewServerOptions['model'],
  regeneration: { readonly previousDecisions: number } | undefined,
  iteration: ReviewServerOptions['iteration'],
  history: readonly ReviewSessionDecision[] = [],
): ReviewApiQueue => ({
  items: cards.reduce((total, card) => total + card.cluster.length, 0),
  decisions: cards.length,
  cards,
  visualAssets: model?.visualAssets ?? [],
  visualTests: model?.visualTests ?? [],
  templateObligations: model?.templateObligations ?? [],
  diagnostics: model?.diagnostics ?? [],
  history,
  ...(regeneration ? { regeneration } : {}),
  ...(iteration
    ? {
        iteration: reviewIterationPaths(iteration),
      }
    : {}),
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

const isFinding = (value: unknown): value is ReviewFinding =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ReviewFinding).path === 'string' &&
  (value as ReviewFinding).path.length > 0 &&
  typeof (value as ReviewFinding).note === 'string';

const isDecision = (value: unknown): value is ReviewDecisionRequest => {
  if (typeof value !== 'object' || value === null) return false;
  const decision = value as Partial<ReviewDecisionRequest>;
  return (
    typeof decision.shape === 'string' &&
    decision.shape.length > 0 &&
    (decision.id === undefined || typeof decision.id === 'string') &&
    (decision.revision === undefined ||
      typeof decision.revision === 'string') &&
    typeof decision.verdict === 'string' &&
    (decision.note === undefined || typeof decision.note === 'string') &&
    (decision.retirementReason === undefined ||
      ['superseded', 'defect', 'derivation'].includes(
        decision.retirementReason,
      )) &&
    (decision.degraded === undefined ||
      typeof decision.degraded === 'boolean') &&
    (decision.findings === undefined ||
      (Array.isArray(decision.findings) && decision.findings.every(isFinding)))
  );
};

const isReopenRequest = (
  value: unknown,
): value is ReviewDecisionReopenRequest => {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<ReviewDecisionReopenRequest>;
  return (
    typeof request.shape === 'string' &&
    request.shape.length > 0 &&
    (request.id === undefined || typeof request.id === 'string')
  );
};

/**
 * Findings that name a node the card does not attest.
 *
 * The reviewer is shown a whole page, so pointing at a neighbour is an easy
 * mistake. It is refused here rather than stored, because a remark filed
 * against the wrong subject is worse than no remark: it reads as coverage.
 */
export function findingsOutsideCard(
  card: AttestationReviewCard,
  findings: readonly ReviewFinding[],
): readonly string[] {
  if (card.kind !== 'visual') return findings.map((finding) => finding.path);
  const attested = new Set(card.members.flatMap((member) => member.attested));
  return findings
    .filter((finding) => !attested.has(finding.path))
    .map((finding) => finding.path)
    .sort();
}

export async function startReviewServer(
  options: ReviewServerOptions = {},
): Promise<RunningReviewServer> {
  const initial = buildReviewQueue(options.items ?? []);
  let cards: AttestationReviewCard[] = [...(options.cards ?? initial.cards)];
  let history: ReviewSessionDecision[] = [];
  let model = options.model;
  let previousDecisions = options.previousDecisions ?? 0;
  let regenerationRunning = false;
  let closing = false;
  const stopServer: { current?: () => Promise<void> } = {};
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
      void (async () => {
        try {
          if (options.refreshCards) cards = [...(await options.refreshCards())];
          writeJson(
            response,
            200,
            queueValue(
              cards,
              model,
              options.regenerate ? { previousDecisions } : undefined,
              options.iteration,
              history,
            ),
          );
        } catch (error) {
          writeJson(response, 500, {
            error:
              error instanceof Error ? error.message : 'review refresh failed',
          });
        }
      })();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/regenerate') {
      void (async () => {
        if (!options.regenerate) {
          writeJson(response, 404, {
            error: 'review: regeneration is not configured for this session.',
          });
          return;
        }
        if (
          !request.headers['content-type']
            ?.toLowerCase()
            .startsWith('application/json')
        ) {
          writeJson(response, 400, {
            error: 'review: regeneration requires application/json.',
          });
          return;
        }
        if (regenerationRunning) {
          writeJson(response, 409, {
            error: 'review: regeneration is already running.',
          });
          return;
        }

        regenerationRunning = true;
        try {
          const regenerated = await options.regenerate();
          cards = [...regenerated.cards];
          model = regenerated.model;
          previousDecisions = regenerated.previousDecisions;
          history = [];
          writeJson(
            response,
            200,
            queueValue(
              cards,
              model,
              { previousDecisions },
              options.iteration,
              history,
            ),
          );
        } catch (error) {
          writeJson(response, 500, {
            error:
              error instanceof Error
                ? error.message
                : 'review regeneration failed',
          });
        } finally {
          regenerationRunning = false;
        }
      })();
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
          if (!REVIEW_VERDICTS.has(decision.verdict)) {
            throw new Error(`review: unknown verdict '${decision.verdict}'.`);
          }
          if (
            decision.verdict === 'rejected' &&
            (decision.note === undefined || decision.note.trim().length === 0)
          ) {
            throw new Error('review: rejected decisions require a reason.');
          }
          if (
            decision.verdict === 'retire' &&
            (!decision.retirementReason || !decision.note?.trim())
          ) {
            throw new Error(
              'review: retired obligations require a reason and a comment.',
            );
          }
          if (decision.verdict === 'ok-with-note' && !decision.note?.trim()) {
            throw new Error(
              'review: Accept with note requires a non-empty comment.',
            );
          }
          if (options.refreshCards) cards = [...(await options.refreshCards())];
          const card = cards.find(
            (candidate) =>
              candidate.shape === decision.shape &&
              (decision.id === undefined || candidate.id === decision.id),
          );
          if (!card) {
            throw new Error('review: that diff cluster no longer exists.');
          }
          if (options.cards && decision.revision === undefined) {
            throw new Error('review: a card revision is required.');
          }
          if (
            decision.revision !== undefined &&
            decision.revision !== card.revision
          ) {
            writeJson(response, 409, {
              error: 'review: that card changed; reload it before deciding.',
            });
            return;
          }
          if (card.kind === 'removal' && decision.verdict !== 'retire') {
            throw new Error('review: a removed obligation requires Retire.');
          }
          if (card.kind !== 'removal' && decision.verdict === 'retire') {
            throw new Error(
              'review: Retire only applies to removed obligations.',
            );
          }
          const stray = findingsOutsideCard(card, decision.findings ?? []);
          if (stray.length > 0) {
            throw new Error(
              `review: ${stray.join(', ')} ${stray.length === 1 ? 'is' : 'are'} not attested by this subject. File the remark on the card that covers it.`,
            );
          }
          const refreshed = await options.onDecision?.(decision);
          if (refreshed) cards = [...refreshed];
          else if (
            decision.verdict !== 'rejected' &&
            decision.verdict !== 'blocked'
          ) {
            cards = cards.filter(
              (candidate) => candidate.shape !== decision.shape,
            );
          }
          if (SESSION_ACCEPTED_VERDICTS.has(decision.verdict)) {
            history = [...history, { card, decision }];
          }
          writeJson(
            response,
            200,
            queueValue(
              cards,
              model,
              options.regenerate ? { previousDecisions } : undefined,
              options.iteration,
              history,
            ),
          );
        } catch (error) {
          writeJson(response, 400, {
            error: error instanceof Error ? error.message : 'bad request',
          });
        }
      })();
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/decisions/reopen'
    ) {
      void (async () => {
        try {
          if (
            !request.headers['content-type']
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            throw new Error('review: reopening requires application/json.');
          }
          const requestBody = await readJson(request);
          if (!isReopenRequest(requestBody)) {
            throw new Error('review: expected a decision to reopen.');
          }
          const historyIndex = history.findIndex(
            ({ decision }) =>
              decision.shape === requestBody.shape &&
              (requestBody.id === undefined || decision.id === requestBody.id),
          );
          if (historyIndex < 0) {
            throw new Error('review: that session decision no longer exists.');
          }
          const entry = history[historyIndex];
          if (!entry) throw new Error('review: that session decision is invalid.');
          const reopened = await options.onReopen?.(entry);
          if (reopened !== undefined) cards = [...reopened];
          else cards = [entry.card, ...cards];
          history = history.filter((_, index) => index !== historyIndex);
          writeJson(
            response,
            200,
            queueValue(
              cards,
              model,
              options.regenerate ? { previousDecisions } : undefined,
              options.iteration,
              history,
            ),
          );
        } catch (error) {
          writeJson(response, 400, {
            error: error instanceof Error ? error.message : 'bad request',
          });
        }
      })();
      return;
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/api/iteration-handoff'
    ) {
      void (async () => {
        if (!options.iteration) {
          writeJson(response, 404, {
            error:
              'review: iteration handoff is not configured for this session.',
          });
          return;
        }
        try {
          if (options.refreshCards) cards = [...(await options.refreshCards())];
          const handoff = await writeReviewIterationHandoff(
            cards,
            options.iteration,
          );
          writeJson(response, 200, handoff);
        } catch (error) {
          writeJson(response, 500, {
            error:
              error instanceof Error
                ? error.message
                : 'review iteration handoff failed',
          });
        }
      })();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/close-review') {
      void (async () => {
        if (!options.iteration) {
          writeJson(response, 404, {
            error:
              'review: iteration handoff is not configured for this session.',
          });
          return;
        }
        if (closing) {
          writeJson(response, 409, {
            error: 'review: the review application is already closing.',
          });
          return;
        }
        closing = true;
        try {
          if (options.refreshCards) cards = [...(await options.refreshCards())];
          const handoff = await writeReviewIterationHandoff(
            cards,
            options.iteration,
          );
          writeJson(response, 200, {
            closed: true,
            rejectedCards: handoff.rejectedCards,
            promptPath: handoff.promptPath,
          } satisfies ReviewCloseResponse);
          // Let the response reach the browser before tearing down the server.
          await new Promise<void>((resolve) => setImmediate(resolve));
          await options.onClose?.(handoff);
          await stopServer.current?.();
        } catch (error) {
          closing = false;
          if (!response.headersSent) {
            writeJson(response, 500, {
              error:
                error instanceof Error ? error.message : 'review close failed',
            });
          }
        }
      })();
      return;
    }

    // An empty, same-origin document for the replay frame to rest on when a
    // card has no snapshot. `about:blank` is refused by the DOM security rules
    // and the refusal breaks the render; a relative path is allowed, cheap,
    // and visible in the network panel for what it is.
    if (request.method === 'GET' && url.pathname === '/api/blank') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
        'content-security-policy': "script-src 'none'; object-src 'none'",
      });
      response.end(
        '<!doctype html><meta charset="utf-8"><title>No frozen page</title>',
      );
      return;
    }

    const digestPrefix = '/api/digest/';
    if (request.method === 'GET' && url.pathname.startsWith(digestPrefix)) {
      void (async () => {
        const hash = decodeURIComponent(
          url.pathname.slice(digestPrefix.length),
        );
        if (!/^[a-f0-9]{32}$/.test(hash)) {
          response.writeHead(400).end();
          return;
        }
        const digest = await options.digestFor?.(hash);
        if (digest === undefined) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=31536000, immutable',
        });
        response.end(digest);
      })();
      return;
    }

    const snapshotPrefix = '/api/snapshot/';
    if (request.method === 'GET' && url.pathname.startsWith(snapshotPrefix)) {
      void (async () => {
        const hash = decodeURIComponent(
          url.pathname.slice(snapshotPrefix.length),
        );
        if (!/^[a-f0-9]{32}$/.test(hash)) {
          response.writeHead(400).end();
          return;
        }
        const html = await options.snapshotFor?.(hash);
        if (html === undefined) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=31536000, immutable',
          // The document has no script of its own; this makes sure the browser
          // will not run one if a snapshot ever grows one by accident.
          'content-security-policy': "script-src 'none'; object-src 'none'",
        });
        response.end(html);
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
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    await vite.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  stopServer.current = close;
  return {
    url: `http://127.0.0.1:${listeningPort}`,
    server,
    close,
  };
}
