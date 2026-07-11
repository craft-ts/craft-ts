import { randomUUID } from 'node:crypto';
import {
  WebSocket,
  WebSocketServer,
  type RawData,
  type ServerOptions,
} from 'ws';
import type {
  RegistryBrokerMethod,
  RegistryClient,
  RegistryRequest,
  RegistryResponse,
  RegistrySnapshot,
} from './protocol.js';

type PendingCall = Readonly<{
  clientId: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}>;

type ClientConnection = {
  socket: WebSocket;
  clientId: string;
  connectedAt: string;
  pageUrl?: string;
  pageTitle?: string;
  snapshot: RegistrySnapshot;
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
    return Array.from(this.#clients.values(), (client) => ({
      clientId: client.clientId,
      connectedAt: client.connectedAt,
      ...(client.pageUrl === undefined ? {} : { pageUrl: client.pageUrl }),
      ...(client.pageTitle === undefined
        ? {}
        : { pageTitle: client.pageTitle }),
      entryCount: client.snapshot.entries.length,
      logCount: client.snapshot.logs.length,
    }));
  }

  snapshot(clientId: string): RegistrySnapshot {
    return this.#requireClient(clientId).snapshot;
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

    const { clientId, forwardedParams } = splitTargetParams(params);
    const client = this.#resolveClient(clientId);
    const callId = randomUUID();
    const message: RegistryRequest = {
      type: 'request',
      callId,
      method,
      ...(forwardedParams === undefined ? {} : { params: forwardedParams }),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(callId);
        reject(
          new Error(`${method} timed out after ${this.#requestTimeoutMs}ms`),
        );
      }, this.#requestTimeoutMs);
      this.#pending.set(callId, {
        clientId: client.clientId,
        resolve,
        reject,
        timeout,
      });
      client.socket.send(JSON.stringify(message), (error) => {
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

  async close(): Promise<void> {
    this.#rejectPending('Registry bridge closed');
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

  #handleConnection(socket: WebSocket): void {
    socket.on('message', (rawData) => this.#handleMessage(socket, rawData));
    socket.on('close', () => {
      const clientId = this.#socketClientIds.get(socket);
      if (clientId === undefined) {
        return;
      }
      const client = this.#clients.get(clientId);
      if (client?.socket !== socket) {
        return;
      }
      this.#clients.delete(clientId);
      this.#rejectPending('Registry app disconnected', clientId);
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

  #registerClient(
    socket: WebSocket,
    hello: Readonly<{
      clientId: string;
      pageUrl?: string;
      pageTitle?: string;
    }>,
  ): void {
    const previous = this.#clients.get(hello.clientId);
    this.#socketClientIds.set(socket, hello.clientId);
    this.#clients.set(hello.clientId, {
      socket,
      clientId: hello.clientId,
      connectedAt: new Date().toISOString(),
      ...(hello.pageUrl === undefined ? {} : { pageUrl: hello.pageUrl }),
      ...(hello.pageTitle === undefined ? {} : { pageTitle: hello.pageTitle }),
      snapshot: emptySnapshot(hello.clientId, hello.pageUrl, hello.pageTitle),
    });
    if (previous !== undefined && previous.socket !== socket) {
      this.#rejectPending('Registry app reconnected', hello.clientId);
      previous.socket.close();
    }
  }

  #resolveClient(clientId: string | undefined): ClientConnection {
    if (clientId !== undefined) {
      return this.#requireClient(clientId);
    }
    const clients = [...this.#clients.values()];
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

  #requireClient(clientId: string): ClientConnection {
    const client = this.#clients.get(clientId);
    if (client === undefined || client.socket.readyState !== WebSocket.OPEN) {
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
}

function splitTargetParams(
  params?: Readonly<Record<string, unknown>>,
): Readonly<{
  clientId?: string;
  forwardedParams?: Readonly<Record<string, unknown>>;
}> {
  if (params === undefined) {
    return {};
  }
  const { clientId: rawClientId, ...forwardedParams } = params;
  if (rawClientId !== undefined && typeof rawClientId !== 'string') {
    throw new Error('params.clientId must be a string');
  }
  return {
    ...(rawClientId === undefined ? {} : { clientId: rawClientId }),
    ...(Object.keys(forwardedParams).length === 0 ? {} : { forwardedParams }),
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
