import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseBatch } from './log-entry.js';
import type { LogStore } from './log-store.js';
import type {
  DebugSessionStore,
  PortableDebugSession,
  StoredEnvironmentProfile,
} from './debug-session-store.js';
import { isDebugSessionTestMetadata } from './debug-session-store.js';
import { PORTABLE_DEBUG_SESSION_VERSION } from './debug-session-store.js';
import {
  compareSessionTraces,
  isSessionHistory,
  normalizeSessionTrace,
  SESSION_HISTORY_FILE,
  type PortableSessionForTrace,
  type SessionHistory,
} from '@craft-ts/session-trace';
import type { ThumbnailService } from './thumbnails/thumbnail-service.js';
import type { ThumbnailManifest } from './thumbnails/thumbnail-store.js';

export type LogHttpServerOptions = {
  readonly store: LogStore;
  readonly sessionStore?: DebugSessionStore;
  /** Explicit roots from which read-only Playwright histories may be served. */
  readonly e2eSessionRoots?: readonly string[];
  /** Prepares and serves the thumbnails of archived sessions. */
  readonly thumbnails?: ThumbnailService;
  readonly host?: string;
  readonly port?: number;
  /** Reject bodies larger than this, in bytes. */
  readonly maxBodySize?: number;
  /** Exact browser origins allowed to access local log and session data. */
  readonly allowedOrigins?: readonly string[];
  /** Called after every accepted batch; used for console echo. */
  readonly onIngest?: (count: number) => void;
};

const DEFAULT_MAX_BODY_SIZE = 2 * 1024 * 1024;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4204',
  'http://localhost:4210',
  'http://localhost:4301',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:4204',
  'http://127.0.0.1:4210',
  'http://127.0.0.1:4301',
] as const;
const NO_CORS_HEADERS = {} as const;

export function createLogHttpServer(options: LogHttpServerOptions): Server {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const allowedOrigins = new Set(
    (options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS).map(normalizeOrigin),
  );
  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      options,
      maxBodySize,
      allowedOrigins,
    ).catch((error: unknown) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  const sessionsSocket = new WebSocketServer({
    noServer: true,
    // History is batched, but a single recorded event can itself be large.
    maxPayload: 100 * 1024 * 1024,
  });
  server.on('close', () => {
    for (const client of sessionsSocket.clients) client.terminate();
    sessionsSocket.close();
    options.sessionStore?.close();
    void options.thumbnails?.close();
  });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (
      url.pathname !== '/sessions/ws' ||
      !options.sessionStore ||
      !isAllowedOrigin(request.headers.origin, allowedOrigins)
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sessionsSocket.handleUpgrade(request, socket, head, (webSocket) => {
      sessionsSocket.emit('connection', webSocket, request);
    });
  });
  sessionsSocket.on('connection', (webSocket) => {
    handleSessionSocket(webSocket, options.sessionStore!);
  });
  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LogHttpServerOptions,
  maxBodySize: number,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const isSessionRoute =
    url.pathname === '/sessions' || url.pathname.startsWith('/sessions/');
  const isE2eSessionRoute = url.pathname === '/e2e-sessions' || url.pathname.startsWith('/e2e-sessions/');

  const isLogsRoute = url.pathname === '/logs';
  if (
    (isSessionRoute || isE2eSessionRoute || isLogsRoute) &&
    request.headers.origin !== undefined &&
    !isAllowedOrigin(request.headers.origin, allowedOrigins)
  ) {
    sendJson(response, 403, { error: 'Origin is not allowed.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(
      204,
      isSessionRoute || isE2eSessionRoute
        ? sessionCorsHeaders(request.headers.origin, allowedOrigins)
        : isLogsRoute
          ? logsCorsHeaders(request.headers.origin, allowedOrigins)
          : NO_CORS_HEADERS,
    );
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

  if (request.method === 'GET' && isE2eSessionRoute) {
    handleE2eSessionRequest(url, response, options, sessionCorsHeaders(request.headers.origin, allowedOrigins));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/sessions') {
    options.thumbnails?.prune();
    sendJson(
      response,
      200,
      {
        sessions: options.sessionStore?.list({
          ...(url.searchParams.has('testId') ? { testId: url.searchParams.get('testId')! } : {}),
          ...(url.searchParams.has('runId') ? { runId: url.searchParams.get('runId')! } : {}),
        }) ?? [],
        retentionDays: options.sessionStore?.retentionDays ?? 30,
        storageBytes:
          (options.sessionStore?.storageBytes ?? 0) +
          (options.thumbnails?.storageBytes ?? 0),
      },
      sessionCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/sessions/prune') {
    if (!options.sessionStore) {
      sendJson(response, 404, { error: 'Session archive is unavailable.' });
      return;
    }
    const deleted = options.sessionStore.pruneExpired();
    options.thumbnails?.prune();
    sendJson(
      response,
      200,
      { deleted, retentionDays: options.sessionStore.retentionDays },
      sessionCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/sessions/delete-many') {
    const headers = sessionCorsHeaders(request.headers.origin, allowedOrigins);
    if (!options.sessionStore) {
      sendJson(
        response,
        404,
        { error: 'Session archive is unavailable.' },
        headers,
      );
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        await readBody(request, Math.min(maxBodySize, 64_000)),
      );
    } catch {
      sendJson(
        response,
        400,
        { error: 'Invalid session deletion payload.' },
        headers,
      );
      return;
    }
    const ids = isRecord(payload) ? payload['ids'] : undefined;
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      !ids.every(
        (id) =>
          typeof id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id,
          ),
      )
    ) {
      sendJson(
        response,
        400,
        { error: 'Invalid session deletion payload.' },
        headers,
      );
      return;
    }
    const deleted = options.sessionStore.deleteMany(ids);
    options.thumbnails?.prune();
    sendJson(response, 200, { deleted }, headers);
    return;
  }

  const thumbnailsMatch = /^\/sessions\/([0-9a-f-]{36})\/thumbnails$/i.exec(
    url.pathname,
  );
  if (thumbnailsMatch) {
    const id = thumbnailsMatch[1]!;
    const headers = sessionCorsHeaders(request.headers.origin, allowedOrigins);
    const service = options.thumbnails;
    if (request.method === 'GET') {
      sendJson(
        response,
        200,
        service?.get(id) ?? noThumbnails(id, service?.available ?? false),
        headers,
      );
      return;
    }
    if (request.method === 'POST') {
      const manifest = service?.start(id, {
        force: url.searchParams.get('force') === '1',
      });
      if (!manifest && service) {
        sendJson(response, 404, { error: 'Session not found.' }, headers);
        return;
      }
      sendJson(response, 202, manifest ?? noThumbnails(id, false), headers);
      return;
    }
    if (request.method === 'DELETE') {
      service?.remove(id);
      sendJson(response, 200, { deleted: true }, headers);
      return;
    }
  }

  const thumbnailImageMatch =
    /^\/sessions\/([0-9a-f-]{36})\/thumbnails\/(\d{3,5}\.webp)$/i.exec(
      url.pathname,
    );
  if (request.method === 'GET' && thumbnailImageMatch) {
    const image = options.thumbnails?.image(
      thumbnailImageMatch[1]!,
      thumbnailImageMatch[2]!,
    );
    if (!image) {
      sendJson(response, 404, { error: 'Thumbnail not found.' });
      return;
    }
    response.writeHead(200, {
      'content-type': 'image/webp',
      'content-length': image.byteLength,
      // Pictures are asked for with the manifest's key (`?k=`): under one key
      // a file never changes, and a new run has a new key.
      'cache-control': 'private, max-age=31536000, immutable',
    });
    response.end(image);
    return;
  }

  const sessionMatch = /^\/sessions\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (request.method === 'GET' && sessionMatch) {
    const session = options.sessionStore?.get(sessionMatch[1]!);
    if (!session) {
      sendJson(response, 404, { error: 'Session not found.' });
      return;
    }
    sendJson(
      response,
      200,
      session,
      sessionCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  const finishSessionMatch = /^\/sessions\/([0-9a-f-]{36})\/finish$/i.exec(
    url.pathname,
  );
  if (request.method === 'POST' && finishSessionMatch) {
    if (!options.sessionStore) {
      sendJson(response, 404, { error: 'Session archive is unavailable.' });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(
        await readBody(request, Math.min(maxBodySize, 256_000)),
      );
    } catch {
      sendJson(response, 400, { error: 'Invalid session finish payload.' });
      return;
    }
    if (
      !isRecord(payload) ||
      typeof payload['participantId'] !== 'string' ||
      payload['participantId'].length === 0 ||
      payload['participantId'].length > 200
    ) {
      sendJson(response, 400, { error: 'Invalid session finish payload.' });
      return;
    }
    const id = finishSessionMatch[1]!;
    if (!options.sessionStore.hasParticipant(id, payload['participantId'])) {
      sendJson(response, 404, { error: 'Session participant not found.' });
      return;
    }
    options.sessionStore.appendBatch(
      id,
      [],
      Array.isArray(payload['clips']) ? payload['clips'] : [],
      payload['truncated'] === true,
      payload['participantId'],
    );
    const status = options.sessionStore.finishParticipant(
      id,
      payload['participantId'],
      'completed',
    );
    if (status === undefined) {
      sendJson(response, 404, { error: 'Session participant not found.' });
      return;
    }
    sendJson(
      response,
      202,
      { accepted: true },
      sessionCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  const deleteSessionMatch = /^\/sessions\/([0-9a-f-]{36})$/i.exec(
    url.pathname,
  );
  if (request.method === 'DELETE' && deleteSessionMatch) {
    const deleted = options.sessionStore?.delete(deleteSessionMatch[1]!);
    if (deleted) options.thumbnails?.remove(deleteSessionMatch[1]!);
    sendJson(
      response,
      deleted ? 200 : 404,
      deleted ? { deleted: true } : { error: 'Session not found.' },
      sessionCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  if (request.method === 'DELETE' && url.pathname === '/logs') {
    options.store.clear();
    sendJson(
      response,
      200,
      { cleared: true },
      logsCorsHeaders(request.headers.origin, allowedOrigins),
    );
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
    sendJson(
      response,
      202,
      { accepted: entries.length },
      logsCorsHeaders(request.headers.origin, allowedOrigins),
    );
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function handleSessionSocket(
  socket: WebSocket,
  store: DebugSessionStore,
): void {
  let activeSessionId: string | undefined;
  let activeParticipantId: string | undefined;
  socket.on('message', (rawMessage) => {
    try {
      const message: unknown = JSON.parse(rawMessage.toString());
      if (!isRecord(message) || typeof message['type'] !== 'string') return;
      if (message['type'] === 'session:sync') {
        const id = message['id'];
        const session = message['session'];
        const createdAt = message['createdAt'];
        const participantId =
          typeof message['participantId'] === 'string'
            ? message['participantId']
            : 'default';
        const participant = isRecord(message['participant'])
          ? message['participant']
          : {};
        if (
          typeof id !== 'string' ||
          typeof createdAt !== 'string' ||
          !isPortableSession(session)
        ) {
          sendSocketError(socket, 'Invalid session sync message.');
          return;
        }
        const test = isDebugSessionTestMetadata(message['test']) ? message['test'] : undefined;
        activeSessionId = store.begin(id, test ? { ...session, test } : session, createdAt, participantId, {
          ...(typeof participant['title'] === 'string'
            ? { title: participant['title'] }
            : {}),
          ...(typeof participant['state'] === 'string' &&
          ['visible', 'hidden', 'blurred'].includes(participant['state'])
            ? {
                state: participant['state'] as 'visible' | 'hidden' | 'blurred',
              }
            : {}),
          ...(isEnvironmentProfile(participant['environment'])
            ? { environment: participant['environment'] }
            : {}),
        });
        activeParticipantId = participantId;
        socket.send(
          JSON.stringify({
            type: 'session:ready',
            id: activeSessionId,
            participantId,
          }),
        );
        return;
      }
      if (message['type'] === 'session:event') {
        const id = message['id'];
        if (typeof id !== 'string' || id !== activeSessionId) return;
        store.append(
          id,
          isRecord(message['event']) ? message['event'] : {},
          Array.isArray(message['clips']) ? message['clips'] : [],
          message['truncated'] === true,
          activeParticipantId,
        );
        socket.send(
          JSON.stringify({
            type: 'session:event-saved',
            id,
            sequence: isRecord(message['event'])
              ? message['event']['sequence']
              : undefined,
          }),
        );
        return;
      }
      if (message['type'] === 'session:events') {
        const id = message['id'];
        if (typeof id !== 'string' || id !== activeSessionId) return;
        const events = Array.isArray(message['events'])
          ? message['events'].filter(isRecord)
          : [];
        store.appendBatch(
          id,
          events,
          Array.isArray(message['clips']) ? message['clips'] : [],
          message['truncated'] === true,
          activeParticipantId,
        );
        socket.send(JSON.stringify({ type: 'session:events-saved', id }));
        return;
      }
      if (message['type'] === 'session:participant-state') {
        if (!activeSessionId || !activeParticipantId) return;
        const state = message['state'];
        if (state === 'visible' || state === 'hidden' || state === 'blurred')
          store.updateParticipantState(
            activeSessionId,
            activeParticipantId,
            state,
          );
        return;
      }
      if (message['type'] === 'session:finish') {
        const id = message['id'];
        if (
          typeof id !== 'string' ||
          id !== activeSessionId ||
          !activeParticipantId
        )
          return;
        const status = store.finishParticipant(
          id,
          activeParticipantId,
          'completed',
        );
        socket.send(JSON.stringify({ type: 'session:saved', id, status }));
        activeSessionId = undefined;
        activeParticipantId = undefined;
        socket.close(1000, 'session saved');
      }
    } catch (error) {
      sendSocketError(
        socket,
        error instanceof Error ? error.message : 'Invalid session message.',
      );
    }
  });
  socket.on('close', () => {
    if (activeSessionId && activeParticipantId)
      store.finishParticipant(
        activeSessionId,
        activeParticipantId,
        'interrupted',
      );
  });
  socket.on('error', () => {
    if (activeSessionId && activeParticipantId)
      store.finishParticipant(
        activeSessionId,
        activeParticipantId,
        'interrupted',
      );
  });
}

function isPortableSession(value: unknown): value is PortableDebugSession {
  return (
    isRecord(value) &&
    value['format'] === 'craft-debug-session' &&
    value['version'] === PORTABLE_DEBUG_SESSION_VERSION &&
    (value['replayVersion'] === undefined ||
      (Number.isSafeInteger(value['replayVersion']) &&
        (value['replayVersion'] as number) >= 1)) &&
    typeof value['startUrl'] === 'string' &&
    Array.isArray(value['events']) &&
    Array.isArray(value['clips']) &&
    (value['test'] === undefined || isDebugSessionTestMetadata(value['test'])) &&
    typeof value['truncated'] === 'boolean'
  );
}

function isEnvironmentProfile(
  value: unknown,
): value is StoredEnvironmentProfile {
  return (
    isRecord(value) &&
    (value['userAgent'] === undefined ||
      (typeof value['userAgent'] === 'string' &&
        value['userAgent'].length <= 2_000)) &&
    (value['engine'] === undefined ||
      ['chromium', 'gecko', 'webkit', 'unknown'].includes(
        String(value['engine']),
      ))
  );
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error(`Invalid allowed origin: ${origin}`);
  }
}

function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return false;
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function sessionCorsHeaders(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
  return {
    ...(origin && isAllowedOrigin(origin, allowedOrigins)
      ? { 'access-control-allow-origin': origin }
      : {}),
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

function logsCorsHeaders(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): Record<string, string> {
  return {
    ...(origin && isAllowedOrigin(origin, allowedOrigins)
      ? { 'access-control-allow-origin': origin }
      : {}),
    'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

/** The answer for a recording whose pictures were never asked for. */
function noThumbnails(
  sessionId: string,
  available: boolean,
): Omit<ThumbnailManifest, 'status' | 'updatedAt'> & {
  readonly status: ThumbnailManifest['status'] | 'none';
} {
  return {
    sessionId,
    key: '',
    status: available ? 'none' : 'unavailable',
    total: 0,
    done: 0,
    entries: [],
    ...(available
      ? {}
      : {
          error:
            'Aperçus indisponibles : aucun navigateur pilotable n’est configuré sur le serveur.',
        }),
  };
}

function sendSocketError(socket: WebSocket, message: string): void {
  if (socket.readyState === socket.OPEN)
    socket.send(JSON.stringify({ type: 'session:error', message }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function selectedE2eRoot(url: URL, roots: readonly string[]): { index: number; path: string } | undefined {
  const rawIndex = url.searchParams.get('root') ?? (roots.length === 1 ? '0' : undefined);
  if (rawIndex === undefined || !/^\d+$/.test(rawIndex)) return undefined;
  const index = Number(rawIndex);
  const path = roots[index];
  return path ? { index, path: resolve(path) } : undefined;
}

function listE2eHistories(root: string): Array<Pick<SessionHistory, 'id' | 'project' | 'keep' | 'runs'>> {
  if (!existsSync(root)) return [];
  const histories: Array<Pick<SessionHistory, 'id' | 'project' | 'keep' | 'runs'>> = [];
  for (const testEntry of readdirSync(root, { withFileTypes: true })) {
    if (!testEntry.isDirectory() || !validE2eTestId(testEntry.name)) continue;
    for (const projectEntry of readdirSync(join(root, testEntry.name), { withFileTypes: true })) {
      if (!projectEntry.isDirectory() || !validE2eProject(projectEntry.name)) continue;
      const history = readE2eHistory(root, testEntry.name, projectEntry.name);
      if (history) histories.push({ id: history.id, project: history.project, keep: history.keep, runs: history.runs });
    }
  }
  return histories;
}

function validE2eTestId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(value) && value.length <= 80;
}

/** One rule for every endpoint: a Playwright project name that is a safe directory name. */
function validE2eProject(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);
}

/** The history of one test and project, or undefined when its files are not trusted. */
function readE2eHistory(root: string, testId: string, project: string): SessionHistory | undefined {
  const directory = resolve(root, testId, project);
  if (!directory.startsWith(`${resolve(root)}/`) || !isPlainDirectory(directory)) return undefined;
  const path = join(directory, 'history.json');
  if (!isPlainFile(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isSessionHistory(value) && value.id === testId && value.project === project ? value : undefined;
  } catch { return undefined; }
}

function readE2eRunSession(root: string, history: SessionHistory, file: string): Buffer | undefined {
  if (!history.runs.some((run) => run.file === file)) return undefined;
  const directory = resolve(root, history.id, history.project);
  const path = resolve(directory, file);
  return path.startsWith(`${directory}/`) && isPlainFile(path) ? readFileSync(path) : undefined;
}

function isPlainDirectory(path: string): boolean { return existsSync(path) && !lstatSync(path).isSymbolicLink() && lstatSync(path).isDirectory(); }
function isPlainFile(path: string): boolean { return existsSync(path) && !lstatSync(path).isSymbolicLink() && lstatSync(path).isFile(); }

function handleE2eSessionRequest(
  url: URL,
  response: ServerResponse,
  options: LogHttpServerOptions,
  cors: Readonly<Record<string, string>>,
): void {
  const roots = options.e2eSessionRoots ?? [];
  const rootParam = url.searchParams.get('root');
  const candidates = rootParam === null
    ? roots.map((path, index) => ({ index, path: resolve(path) }))
    : [selectedE2eRoot(url, roots)].filter((value): value is { index: number; path: string } => value !== undefined);

  if (url.pathname === '/e2e-sessions') {
    if (candidates.length === 0) { sendJson(response, 404, { error: 'E2E session history root is unavailable.' }, cors); return; }
    const sessions = candidates.flatMap((root) => listE2eHistories(root.path).map((history) => ({ root: root.index, ...history })));
    sendJson(response, 200, { roots: candidates.map((root) => ({ index: root.index, name: basename(root.path) })), sessions }, cors);
    return;
  }

  if (url.pathname === '/e2e-sessions/compare') {
    const testId = url.searchParams.get('test') ?? '';
    const project = url.searchParams.get('project') ?? '';
    const sessionId = url.searchParams.get('run') ?? '';
    if (!validE2eTestId(testId) || !validE2eProject(project) || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      sendJson(response, 400, { error: 'Invalid E2E comparison request.' }, cors);
      return;
    }
    const selected = candidates.flatMap((root) => {
      const history = readE2eHistory(root.path, testId, project);
      return history ? [{ root, history }] : [];
    })[0];
    if (!selected || !options.sessionStore) { sendJson(response, 404, { error: 'E2E comparison history not found.' }, cors); return; }
    const observed = options.sessionStore.get(sessionId);
    if (!observed) { sendJson(response, 404, { error: 'Observed E2E session not found.' }, cors); return; }
    const baselines = selected.history.runs.flatMap((run) => {
      const compressed = readE2eRunSession(selected.root.path, selected.history, run.file);
      if (!compressed) return [];
      const source = `/e2e-sessions/${encodeURIComponent(testId)}/${encodeURIComponent(project)}/${encodeURIComponent(run.file)}?root=${selected.root.index}&decompress=1`;
      return [{ source, file: run.file, markers: run.markers ?? [], session: JSON.parse(gunzipSync(compressed).toString('utf8')) as unknown }];
    });
    // The same module as the fixture and the MCP: every reader shows the same findings.
    const comparison = compareSessionTraces(
      normalizeSessionTrace(asPortableSession(observed)),
      baselines.map((baseline) => normalizeSessionTrace(asPortableSession(baseline.session), { markers: baseline.markers })),
    );
    sendJson(response, 200, {
      testId,
      project,
      sessionId,
      observed,
      observedSource: `/sessions/${encodeURIComponent(sessionId)}`,
      baselines: baselines.map(({ source, session }) => ({ source, session })),
      comparison,
    }, cors);
    return;
  }

  const fileMatch = /^\/e2e-sessions\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  const [testId, project, file] = fileMatch?.slice(1).map(safeDecode) ?? [];
  const root = selectedE2eRoot(url, roots);
  const history = root && testId && project && validE2eTestId(testId) && validE2eProject(project) ? readE2eHistory(root.path, testId, project) : undefined;
  const compressed = root && history && file && SESSION_HISTORY_FILE.test(file) ? readE2eRunSession(root.path, history, file) : undefined;
  if (!compressed) { sendJson(response, 404, { error: 'E2E session history file not found.' }, cors); return; }
  const decompress = url.searchParams.get('decompress') === '1';
  response.writeHead(200, { ...cors, 'content-type': decompress ? 'application/json' : 'application/gzip', 'cache-control': 'no-store' });
  response.end(decompress ? gunzipSync(compressed) : compressed);
}

function safeDecode(value: string): string | undefined {
  try { return decodeURIComponent(value); } catch { return undefined; }
}

function asPortableSession(value: unknown): PortableSessionForTrace {
  const events = isRecord(value) && Array.isArray(value['events']) ? value['events'].filter(isRecord) : [];
  return { events };
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
  headers: Readonly<Record<string, string>> = NO_CORS_HEADERS,
): void {
  if (response.writableEnded) return;
  response.writeHead(status, {
    ...headers,
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
}
