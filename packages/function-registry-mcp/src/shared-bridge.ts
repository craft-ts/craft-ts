import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryBrokerMethod } from './protocol.js';

/** How the bridge is held by this MCP server. */
export type BridgeRole = 'broker' | 'relay' | 'connecting';

export type SharedRegistryBridge = Readonly<{
  request(
    method: RegistryBrokerMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  role(): BridgeRole;
  address(): Readonly<{ host: string; port: number }>;
  close(): Promise<void>;
}>;

/** A relayed call waits as long as the tab may: a hand-off lasts minutes. */
const MIN_RELAY_TIMEOUT_MS = 60_000;
const RECONNECT_MS = 1_000;

/**
 * One bridge per port, whatever the number of AI sessions: the first registry
 * MCP server listens and holds the tabs; the next ones find the port taken
 * and relay their calls to it. When the one listening goes away, a relay
 * takes the port over, and the tabs reconnect to it on their own.
 */
export async function connectSharedRegistryBridge({
  host = '127.0.0.1',
  port = 3333,
  requestTimeoutMs,
}: {
  host?: string;
  port?: number;
  requestTimeoutMs?: number;
} = {}): Promise<SharedRegistryBridge> {
  let broker: RegistryBridgeBroker | undefined;
  let relay: RegistryBridgeRelay | undefined;
  let closed = false;

  const become = async (): Promise<void> => {
    while (!closed) {
      const candidate = new RegistryBridgeBroker({
        host,
        port,
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
      });
      try {
        await candidate.ready();
        broker = candidate;
        return;
      } catch (error) {
        await candidate.close().catch(() => undefined);
        if (!isAddressInUse(error)) throw error;
      }
      try {
        relay = await RegistryBridgeRelay.connect(`ws://${host}:${port}`);
        relay.onClose(() => {
          relay = undefined;
          if (!closed) setTimeout(() => void become().catch(() => undefined), RECONNECT_MS);
        });
        return;
      } catch {
        // The holder is going away: try to listen again.
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
      }
    }
  };
  await become();

  return {
    request(method, params) {
      if (broker) return broker.request(method, params);
      if (relay) return relay.request(method, params);
      return Promise.reject(
        new Error(`The registry bridge on port ${port} is reconnecting; try again in a second.`),
      );
    },
    role: () => (broker ? 'broker' : relay ? 'relay' : 'connecting'),
    address: () => ({ host, port }),
    async close() {
      closed = true;
      await broker?.close();
      relay?.close();
    },
  };
}

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'EADDRINUSE'
  );
}

type Pending = Readonly<{
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}>;

/** A registry MCP server that relays its calls to the one holding the port. */
export class RegistryBridgeRelay {
  readonly #socket: WebSocket;
  readonly #pending = new Map<string, Pending>();
  readonly #closeListeners: (() => void)[] = [];

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.on('message', (raw) => this.#answer(raw.toString()));
    socket.on('close', () => {
      for (const [callId, pending] of this.#pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('The registry bridge holder went away; try again.'));
        this.#pending.delete(callId);
      }
      for (const listener of this.#closeListeners) listener();
    });
  }

  static connect(url: string): Promise<RegistryBridgeRelay> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(new RegistryBridgeRelay(socket)));
      socket.once('error', reject);
    });
  }

  onClose(listener: () => void): void {
    this.#closeListeners.push(listener);
  }

  request(
    method: RegistryBrokerMethod,
    params?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const callId = randomUUID();
    const asked = params?.['timeoutMs'];
    const timeoutMs = Math.max(
      MIN_RELAY_TIMEOUT_MS,
      (typeof asked === 'number' ? asked : 0) + 5_000,
    );
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(callId);
        reject(new Error(`${method} timed out after ${timeoutMs}ms (relayed)`));
      }, timeoutMs);
      this.#pending.set(callId, { resolve, reject, timeout });
      this.#socket.send(
        JSON.stringify({
          type: 'relay/request',
          callId,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      );
    });
  }

  close(): void {
    this.#socket.close();
  }

  #answer(text: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message['type'] !== 'relay/response' || typeof message['callId'] !== 'string') return;
    const pending = this.#pending.get(message['callId']);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(message['callId']);
    const error = message['error'] as { message?: unknown } | undefined;
    if (error) pending.reject(new Error(String(error.message ?? 'relayed call failed')));
    else pending.resolve(message['result']);
  }
}
