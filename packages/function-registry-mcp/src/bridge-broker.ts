import { randomUUID } from 'node:crypto';
import {
  WebSocket,
  WebSocketServer,
  type RawData,
  type ServerOptions,
} from 'ws';
import type {
  HelloOk,
  PageSurface,
  RegistryBrokerMethod,
  RegistryClient,
  RegistryRequest,
  RegistryResponse,
  RegistrySnapshot,
} from './protocol.js';

const DEFAULT_PAGE_TIMEOUT_MS = 20_000;
const RELOADING_CARD_TTL_MS = 20_000;

type PendingCall = Readonly<{
  clientId: string;
  method: RegistryBrokerMethod;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}>;

type ReadyWaiter = Readonly<{
  resolve(): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}>;

type ClientStatus = 'reloading' | 'connecting' | 'ready';

type ClientConnection = {
  socket: WebSocket | undefined;
  clientId: string;
  connectedAt: string;
  pageUrl?: string;
  pageTitle?: string;
  snapshot: RegistrySnapshot;
  status: ClientStatus;
  generation: number;
  surfaceRev: number;
  surface: PageSurface | undefined;
  reloadingSince?: number;
  expireTimer?: ReturnType<typeof setTimeout>;
  readyWaiters: ReadyWaiter[];
};

export class RegistryBridgeBroker {
  readonly #server: WebSocketServer;
  readonly #pending = new Map<string, PendingCall>();
  readonly #clients = new Map<string, ClientConnection>();
  readonly #socketClientIds = new WeakMap<WebSocket, string>();
  readonly #requestTimeoutMs: number;

  constructor({
    host = '127.0.0.1',
    port = 3333,
    requestTimeoutMs = 10_000,
  }: {
    host?: string;
    port?: number;
    requestTimeoutMs?: number;
  } = {}) {
    const options: ServerOptions = { host, port };
    this.#server = new WebSocketServer(options);
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#server.on('connection', (socket) => this.#handleConnection(socket));
  }

  get clients(): readonly RegistryClient[] {
    return Array.from(this.#clients.values(), (client) => {
      if (!isSocketOpen(client.socket)) {
        return undefined;
      }
      return {
        clientId: client.clientId,
        connectedAt: client.connectedAt,
        ...(client.pageUrl === undefined ? {} : { pageUrl: client.pageUrl }),
        ...(client.pageTitle === undefined
          ? {}
          : { pageTitle: client.pageTitle }),
        entryCount: client.snapshot.entries.length,
        logCount: client.snapshot.logs.length,
      };
    }).filter((client): client is RegistryClient => client !== undefined);
  }

  snapshot(clientId: string): RegistrySnapshot {
    return this.#requireRegistryClient(clientId).snapshot;
  }

  async ready(): Promise<void> {
    if (this.#server.address() !== null) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.#server.once('listening', resolve);
      this.#server.once('error', reject);
    });
  }

  address(): { host: string; port: number } {
    const address = this.#server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Registry bridge is not listening');
    }
    return { host: address.address, port: address.port };
  }

  async request(
    method: RegistryBrokerMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    if (method === 'registry/clients') {
      return this.clients;
    }
    if (method === 'page') {
      return this.#requestPage(params);
    }

    const { clientId, forwardedParams } = splitTargetParams(params);
    const client = this.#resolveRegistryClient(clientId);
    return this.#forward(client, method, forwardedParams, this.#requestTimeoutMs);
  }

  async close(): Promise<void> {
    this.#rejectPending('Registry bridge closed');
    for (const client of this.#clients.values()) {
      this.#rejectReadyWaiters(client, 'Registry bridge closed');
      if (client.expireTimer !== undefined) {
        clearTimeout(client.expireTimer);
      }
    }
    for (const client of this.#server.clients) {
      client.close();
    }
    this.#clients.clear();
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }

  async #requestPage(
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const timeoutMs = pageTimeoutMs(params);
    const { clientId, forwardedParams } = splitTargetParams(params, [
      'timeoutMs',
    ]);
    const client = this.#resolvePageClient(clientId);
    const deadline = Date.now() + timeoutMs;
    const clientIdForWait = client.clientId;

    while (true) {
      await this.#waitUntilPageReady(clientIdForWait, deadline);
      const current = this.#clients.get(clientIdForWait);
      if (current === undefined) {
        throw new Error('page client is not connected');
      }
      try {
        const result = await this.#forward(
          current,
          'page',
          forwardedParams,
          Math.max(1, deadline - Date.now()),
        );
        return this.#mergeForwardedPageResult(current, result);
      } catch (error) {
        if (!isDisconnectError(error) || Date.now() >= deadline) {
          throw error;
        }
      }
    }
  }

  #waitUntilPageReady(clientId: string, deadline: number): Promise<void> {
    const client = this.#clients.get(clientId);
    if (client !== undefined && client.status === 'ready' && client.surface !== undefined) {
      return Promise.resolve();
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0 || client === undefined) {
      return Promise.reject(
        new Error(
          client === undefined
            ? 'page client is not connected'
            : reloadingMessage(client),
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const current = this.#clients.get(clientId);
        if (current !== undefined) {
          current.readyWaiters = current.readyWaiters.filter(
            (waiter) => waiter.timeout !== timeout,
          );
        }
        reject(
          new Error(
            current === undefined
              ? 'page client is not connected'
              : reloadingMessage(current),
          ),
        );
      }, remaining);
      client.readyWaiters.push({ resolve, reject, timeout });
    });
  }

  #mergeForwardedPageResult(
    client: ClientConnection,
    result: unknown,
  ): unknown {
    if (typeof result !== 'object' || result === null) {
      return result;
    }
    const record = result as Record<string, unknown>;
    if (Array.isArray(record['controls']) && typeof record['url'] === 'string') {
      this.#acceptSurface(client, {
        type: 'page/surface',
        clientId: client.clientId,
        url: record['url'],
        ...(typeof record['title'] === 'string' ? { title: record['title'] } : {}),
        controls: record['controls'] as PageSurface['controls'],
      });
    }
    return {
      ...record,
      generation: client.generation,
      surfaceRev: client.surfaceRev,
    };
  }

  #forward(
    client: ClientConnection,
    method: RegistryBrokerMethod,
    forwardedParams: Readonly<Record<string, unknown>> | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!isSocketOpen(client.socket)) {
      return Promise.reject(new Error('Registry app disconnected'));
    }
    const socket = client.socket;
    const callId = randomUUID();
    const message: RegistryRequest = {
      type: 'request',
      callId,
      method: method === 'page' ? 'page' : method,
      ...(forwardedParams === undefined ? {} : { params: forwardedParams }),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(callId);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(callId, {
        clientId: client.clientId,
        method,
        resolve,
        reject,
        timeout,
      });
      socket.send(JSON.stringify(message), (error) => {
        if (error == null) {
          return;
        }
        const pending = this.#pending.get(callId);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.#pending.delete(callId);
          pending.reject(error);
        }
      });
    });
  }

  #handleConnection(socket: WebSocket): void {
    socket.on('message', (rawData) => this.#handleMessage(socket, rawData));
    socket.on('close', () => {
      const clientId = this.#socketClientIds.get(socket);
      if (clientId === undefined) {
        return;
      }
      const client = this.#clients.get(clientId);
      if (client === undefined) {
        return;
      }
      if (client.socket !== socket) {
        return;
      }
      client.socket = undefined;
      client.status = 'reloading';
      client.reloadingSince = Date.now();
      this.#rejectPending('Registry app disconnected', clientId);
      client.expireTimer = setTimeout(() => {
        const current = this.#clients.get(clientId);
        if (
          current !== undefined &&
          current.status === 'reloading' &&
          current.readyWaiters.length === 0
        ) {
          this.#clients.delete(clientId);
        }
      }, RELOADING_CARD_TTL_MS);
    });
  }

  #handleMessage(socket: WebSocket, rawData: RawData): void {
    let message: unknown;
    try {
      message = JSON.parse(rawData.toString());
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) {
      return;
    }
    const record = message as Record<string, unknown>;
    if (isHello(record)) {
      this.#registerClient(socket, record);
      return;
    }

    if (record['type'] === 'page/goodbye') {
      const mappedId = this.#socketClientIds.get(socket);
      if (mappedId === undefined) {
        return;
      }
      this.#dropClient(mappedId, 'page client is not connected');
      return;
    }

    const clientId = this.#socketClientIds.get(socket);
    if (clientId === undefined) {
      return;
    }
    const client = this.#clients.get(clientId);
    if (client?.socket !== socket) {
      return;
    }
    if (isSnapshot(record, clientId)) {
      client.snapshot = record;
      client.pageUrl = record.pageUrl ?? client.pageUrl;
      client.pageTitle = record.pageTitle ?? client.pageTitle;
      return;
    }
    if (isPageSurface(record, clientId)) {
      this.#acceptSurface(client, record);
      return;
    }
    if (isResponse(record)) {
      const pending = this.#pending.get(record.callId);
      if (pending === undefined || pending.clientId !== clientId) {
        return;
      }
      clearTimeout(pending.timeout);
      this.#pending.delete(record.callId);
      if (record.error !== undefined) {
        pending.reject(new Error(record.error.message));
      } else {
        pending.resolve(record.result);
      }
    }
  }

  #acceptSurface(client: ClientConnection, surface: PageSurface): void {
    client.surface = surface;
    client.surfaceRev += 1;
    client.status = 'ready';
    client.pageUrl = surface.url;
    if (surface.title !== undefined) {
      client.pageTitle = surface.title;
    }
    const waiters = client.readyWaiters;
    client.readyWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve();
    }
  }

  #registerClient(
    socket: WebSocket,
    hello: Readonly<{
      clientId: string;
      pageUrl?: string;
      pageTitle?: string;
    }>,
  ): void {
    let clientId = hello.clientId;
    const previous = this.#clients.get(clientId);
    const previousOpenOnOtherSocket =
      previous !== undefined &&
      isSocketOpen(previous.socket) &&
      previous.socket !== socket;

    if (previousOpenOnOtherSocket) {
      clientId = randomUUID();
    } else if (previous?.expireTimer !== undefined) {
      clearTimeout(previous.expireTimer);
    }

    const reused = previousOpenOnOtherSocket ? undefined : previous;
    this.#socketClientIds.set(socket, clientId);
    const generation = (reused?.generation ?? 0) + 1;
    const surfaceRev = reused?.surfaceRev ?? 0;
    const readyWaiters = reused?.readyWaiters ?? [];
    this.#clients.set(clientId, {
      socket,
      clientId,
      connectedAt: new Date().toISOString(),
      ...(hello.pageUrl === undefined ? {} : { pageUrl: hello.pageUrl }),
      ...(hello.pageTitle === undefined ? {} : { pageTitle: hello.pageTitle }),
      snapshot: emptySnapshot(clientId, hello.pageUrl, hello.pageTitle),
      status: 'connecting',
      generation,
      surfaceRev,
      surface: undefined,
      readyWaiters,
    });
    const helloOk: HelloOk = { type: 'hello/ok', clientId };
    socket.send(JSON.stringify(helloOk));
    if (
      !previousOpenOnOtherSocket &&
      previous !== undefined &&
      previous.socket !== socket
    ) {
      this.#rejectPending('Registry app reconnected', clientId);
      previous.socket?.close();
    }
  }

  #resolveRegistryClient(clientId: string | undefined): ClientConnection {
    if (clientId !== undefined) {
      return this.#requireRegistryClient(clientId);
    }
    const clients = [...this.#clients.values()].filter((client) =>
      isSocketOpen(client.socket),
    );
    if (clients.length === 0) {
      throw new Error('Registry app is not connected to the WebSocket bridge');
    }
    if (clients.length > 1) {
      throw new Error(
        `Multiple registry apps are connected; clientId is required. Available clients: ${clients
          .map((client) => client.clientId)
          .join(', ')}`,
      );
    }
    return clients[0] as ClientConnection;
  }

  #resolvePageClient(clientId: string | undefined): ClientConnection {
    if (clientId !== undefined) {
      const client = this.#clients.get(clientId);
      if (client === undefined) {
        throw new Error(`page client "${clientId}" is not connected`);
      }
      return client;
    }
    const cards = [...this.#clients.values()];
    const ready = cards.filter(
      (client) => client.status === 'ready' && isSocketOpen(client.socket),
    );
    if (ready.length === 1) {
      return ready[0] as ClientConnection;
    }
    if (ready.length > 1) {
      throw new Error(
        `Multiple ready page clients; clientId is required. Available clients: ${ready
          .slice()
          .sort((left, right) => left.clientId.localeCompare(right.clientId))
          .map((client) => `${client.clientId} ready ${client.pageUrl ?? ''}`)
          .join(', ')}`,
      );
    }
    if (cards.length === 0) {
      throw new Error('page client is not connected');
    }
    if (cards.length === 1) {
      return cards[0] as ClientConnection;
    }
    throw new Error(
      `No ready page client. Reloading: ${cards
        .slice()
        .sort((left, right) => left.clientId.localeCompare(right.clientId))
        .map(
          (client) =>
            `${client.clientId} (last url ${client.pageUrl ?? 'unknown'})`,
        )
        .join(', ')}`,
    );
  }

  #requireRegistryClient(clientId: string): ClientConnection {
    const client = this.#clients.get(clientId);
    if (client === undefined || !isSocketOpen(client.socket)) {
      throw new Error(`Registry client "${clientId}" is not connected`);
    }
    return client;
  }

  #rejectPending(message: string, clientId?: string): void {
    for (const [callId, pending] of this.#pending) {
      if (clientId !== undefined && pending.clientId !== clientId) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
      this.#pending.delete(callId);
    }
  }

  #rejectReadyWaiters(client: ClientConnection, message: string): void {
    const waiters = client.readyWaiters;
    client.readyWaiters = [];
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(message));
    }
  }

  #dropClient(clientId: string, waiterMessage: string): void {
    const client = this.#clients.get(clientId);
    if (client === undefined) {
      return;
    }
    if (client.expireTimer !== undefined) {
      clearTimeout(client.expireTimer);
    }
    this.#rejectReadyWaiters(client, waiterMessage);
    this.#rejectPending(waiterMessage, clientId);
    this.#clients.delete(clientId);
  }
}

function splitTargetParams(
  params: Readonly<Record<string, unknown>> | undefined,
  omitKeys: readonly string[] = [],
): Readonly<{
  clientId?: string;
  forwardedParams?: Readonly<Record<string, unknown>>;
}> {
  if (params === undefined) {
    return {};
  }
  const { clientId: rawClientId, ...rest } = params;
  if (rawClientId !== undefined && typeof rawClientId !== 'string') {
    throw new Error('params.clientId must be a string');
  }
  const forwardedEntries = Object.entries(rest).filter(
    ([key]) => !omitKeys.includes(key),
  );
  const forwardedParams = Object.fromEntries(forwardedEntries);
  return {
    ...(rawClientId === undefined ? {} : { clientId: rawClientId }),
    ...(forwardedEntries.length === 0 ? {} : { forwardedParams }),
  };
}

function emptySnapshot(
  clientId: string,
  pageUrl?: string,
  pageTitle?: string,
): RegistrySnapshot {
  return {
    type: 'registry/snapshot',
    clientId,
    ...(pageUrl === undefined ? {} : { pageUrl }),
    ...(pageTitle === undefined ? {} : { pageTitle }),
    entries: [],
    logs: [],
  };
}

function isHello(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  type: 'hello';
  role: 'registry-app';
  clientId: string;
  pageUrl?: string;
  pageTitle?: string;
} {
  return (
    value['type'] === 'hello' &&
    value['role'] === 'registry-app' &&
    typeof value['clientId'] === 'string' &&
    value['clientId'].length > 0 &&
    (value['pageUrl'] === undefined || typeof value['pageUrl'] === 'string') &&
    (value['pageTitle'] === undefined || typeof value['pageTitle'] === 'string')
  );
}

function isSnapshot(
  value: Record<string, unknown>,
  clientId: string,
): value is RegistrySnapshot & Record<string, unknown> {
  return (
    value['type'] === 'registry/snapshot' &&
    value['clientId'] === clientId &&
    Array.isArray(value['entries']) &&
    Array.isArray(value['logs']) &&
    (value['pageUrl'] === undefined || typeof value['pageUrl'] === 'string') &&
    (value['pageTitle'] === undefined || typeof value['pageTitle'] === 'string')
  );
}

function isPageSurface(
  value: Record<string, unknown>,
  clientId: string,
): value is PageSurface & Record<string, unknown> {
  return (
    value['type'] === 'page/surface' &&
    value['clientId'] === clientId &&
    typeof value['url'] === 'string' &&
    Array.isArray(value['controls']) &&
    (value['title'] === undefined || typeof value['title'] === 'string')
  );
}

function isResponse(
  value: Record<string, unknown>,
): value is RegistryResponse & Record<string, unknown> {
  if (value['type'] !== 'response' || typeof value['callId'] !== 'string') {
    return false;
  }
  const error = value['error'];
  return (
    error === undefined ||
    (typeof error === 'object' &&
      error !== null &&
      typeof (error as { message?: unknown }).message === 'string')
  );
}

function isSocketOpen(socket: WebSocket | undefined): socket is WebSocket {
  return socket !== undefined && socket.readyState === WebSocket.OPEN;
}

function pageTimeoutMs(params?: Readonly<Record<string, unknown>>): number {
  const timeoutMs = params?.['timeoutMs'];
  if (timeoutMs === undefined) {
    return DEFAULT_PAGE_TIMEOUT_MS;
  }
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('params.timeoutMs must be a non-negative number');
  }
  return timeoutMs;
}

function reloadingMessage(client: ClientConnection): string {
  const startedAt = client.reloadingSince ?? Date.now();
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const url = client.pageUrl ?? client.surface?.url ?? 'unknown';
  return `page reloading since ${seconds}s, last url ${url}, generation ${client.generation} → still ${client.generation}`;
}

function isDisconnectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message === 'Registry app disconnected' ||
    error.message === 'Registry app reconnected'
  );
}
