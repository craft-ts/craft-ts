import { randomUUID } from 'node:crypto';
import {
  WebSocket,
  WebSocketServer,
  type RawData,
  type ServerOptions,
} from 'ws';
import type {
  RegistryEntry,
  RegistryLog,
  RegistryMethod,
  RegistryRequest,
  RegistryResponse,
  RegistrySnapshot,
} from './protocol.js';

type PendingCall = Readonly<{
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}>;

export class RegistryBridgeBroker {
  readonly #server: WebSocketServer;
  readonly #pending = new Map<string, PendingCall>();
  readonly #requestTimeoutMs: number;
  #appSocket: WebSocket | undefined;
  #snapshot: RegistrySnapshot = {
    type: 'registry/snapshot',
    entries: [],
    logs: [],
  };

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

  get snapshot(): Readonly<{
    entries: readonly RegistryEntry[];
    logs: readonly RegistryLog[];
  }> {
    return this.#snapshot;
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

  request(
    method: RegistryMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const socket = this.#appSocket;
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new Error('Registry app is not connected to the WebSocket bridge'),
      );
    }

    const callId = randomUUID();
    const message: RegistryRequest = {
      type: 'request',
      callId,
      method,
      ...(params === undefined ? {} : { params }),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(callId);
        reject(
          new Error(`${method} timed out after ${this.#requestTimeoutMs}ms`),
        );
      }, this.#requestTimeoutMs);
      this.#pending.set(callId, { resolve, reject, timeout });
      socket.send(JSON.stringify(message), (error) => {
        // ws uses null at runtime even though its callback type says undefined.
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
    this.#appSocket?.close();
    for (const client of this.#server.clients) {
      client.close();
    }
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }

  #handleConnection(socket: WebSocket): void {
    socket.on('message', (rawData) => this.#handleMessage(socket, rawData));
    socket.on('close', () => {
      if (this.#appSocket === socket) {
        this.#appSocket = undefined;
        this.#snapshot = { type: 'registry/snapshot', entries: [], logs: [] };
        this.#rejectPending('Registry app disconnected');
      }
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
    if (record['type'] === 'hello' && record['role'] === 'registry-app') {
      this.#appSocket?.close();
      this.#appSocket = socket;
      return;
    }
    if (socket !== this.#appSocket) {
      return;
    }
    if (isSnapshot(record)) {
      this.#snapshot = record;
      return;
    }
    if (isResponse(record)) {
      const pending = this.#pending.get(record.callId);
      if (pending === undefined) {
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

  #rejectPending(message: string): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.#pending.clear();
  }
}

function isSnapshot(
  value: Record<string, unknown>,
): value is RegistrySnapshot & Record<string, unknown> {
  return (
    value['type'] === 'registry/snapshot' &&
    Array.isArray(value['entries']) &&
    Array.isArray(value['logs'])
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
