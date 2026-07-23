import {
  effect,
  InjectionToken,
  type EffectRef,
  type Injector,
} from '@angular/core';
import {
  functionRegistry,
  type FunctionRegistry,
  type FunctionRegistryEntry,
  type FunctionRegistryLog,
} from './function-registry';
import type { PrimitiveResourceRuntimeKind } from '@craft-ng/core';

export const FUNCTION_REGISTRY_BRIDGE_URL = new InjectionToken<string>(
  'FUNCTION_REGISTRY_BRIDGE_URL',
  { factory: () => 'ws://127.0.0.1:3333' },
);

const FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY =
  'ng-craft.function-registry.client-id';

export const FUNCTION_REGISTRY_CLIENT_ID = new InjectionToken<string>(
  'FUNCTION_REGISTRY_CLIENT_ID',
  {
    factory: () =>
      createFunctionRegistryClientId(globalThis.sessionStorage, () =>
        globalThis.crypto.randomUUID(),
      ),
  },
);

export type RegistryMethod =
  | 'registry/list'
  | 'registry/get'
  | 'registry/call'
  | 'registry/resource/get'
  | 'registry/resource/set'
  | 'registry/resource/update'
  | 'registry/resource/patch'
  | 'registry/override'
  | 'registry/restore'
  | 'registry/logs';

export type RegistryBridgeRequest = Readonly<{
  type: 'request';
  callId: string;
  method: RegistryMethod;
  params?: Readonly<Record<string, unknown>>;
}>;

type RegistryBridgeResponse = Readonly<{
  type: 'response';
  callId: string;
  result?: unknown;
  error?: Readonly<{ message: string }>;
}>;

type RegistrySnapshot = Readonly<{
  type: 'registry/snapshot';
  clientId: string;
  pageUrl?: string;
  pageTitle?: string;
  entries: readonly FunctionRegistryEntry[];
  logs: readonly FunctionRegistryLog[];
}>;

export type RegistryBridgeSocket = Pick<
  WebSocket,
  | 'readyState'
  | 'send'
  | 'close'
  | 'onopen'
  | 'onclose'
  | 'onerror'
  | 'onmessage'
>;

type JsonSender = { send(data: string): void };

const SOCKET_OPEN = 1;

export function startFunctionRegistryBridge({
  injector,
  url,
  clientId,
  registry = functionRegistry,
  createSocket = (socketUrl) => new WebSocket(socketUrl),
  reconnectDelayMs = 1_000,
  getPageInfo = () => ({
    pageUrl: globalThis.location.href,
    pageTitle: globalThis.document.title,
  }),
}: {
  injector: Injector;
  url: string;
  clientId: string;
  registry?: FunctionRegistry;
  createSocket?: (url: string) => RegistryBridgeSocket;
  reconnectDelayMs?: number;
  getPageInfo?: () => Readonly<{ pageUrl?: string; pageTitle?: string }>;
}): () => void {
  let socket: RegistryBridgeSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const snapshotEffect: EffectRef = effect(
    () => {
      const snapshot = createSnapshot(registry, clientId, getPageInfo());
      if (socket?.readyState === SOCKET_OPEN) {
        sendJson(socket, snapshot);
      }
    },
    { injector },
  );

  const connect = (): void => {
    if (stopped) {
      return;
    }

    try {
      socket = createSocket(url);
    } catch (error) {
      registry.logBridge(`Connection failed: ${errorMessage(error)}`);
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      return;
    }

    const currentSocket = socket;
    currentSocket.onopen = () => {
      registry.logBridge(`Connected to ${url}`);
      const pageInfo = getPageInfo();
      sendJson(currentSocket, {
        type: 'hello',
        role: 'registry-app',
        clientId,
        ...pageInfo,
      });
      sendJson(currentSocket, createSnapshot(registry, clientId, pageInfo));
    };
    currentSocket.onmessage = (event) => {
      void respondToBridgeMessage(currentSocket, event.data, registry);
    };
    currentSocket.onerror = () => {
      registry.logBridge(`WebSocket error for ${url}`);
    };
    currentSocket.onclose = () => {
      if (socket === currentSocket) {
        socket = undefined;
      }
      if (!stopped) {
        registry.logBridge(`Disconnected from ${url}; reconnecting`);
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      }
    };
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
    }
    snapshotEffect.destroy();
    socket?.close();
    socket = undefined;
  };
}

export async function respondToBridgeMessage(
  socket: JsonSender,
  rawMessage: unknown,
  registry: FunctionRegistry = functionRegistry,
): Promise<void> {
  let request: RegistryBridgeRequest;
  try {
    request = parseRequest(rawMessage);
  } catch (error) {
    registry.logBridge(`Ignored invalid request: ${errorMessage(error)}`);
    return;
  }

  try {
    const result = await handleFunctionRegistryRequest(request, registry);
    sendJson(socket, { type: 'response', callId: request.callId, result });
  } catch (error) {
    sendJson(socket, {
      type: 'response',
      callId: request.callId,
      error: { message: errorMessage(error) },
    });
  }
}

export async function handleFunctionRegistryRequest(
  request: RegistryBridgeRequest,
  registry: FunctionRegistry = functionRegistry,
): Promise<unknown> {
  const params = request.params ?? {};
  switch (request.method) {
    case 'registry/list':
      return registry.entries();
    case 'registry/get': {
      const key = requiredString(params, 'key');
      const entry = registry.get(key);
      if (entry === undefined) {
        throw new Error(`Registry entry "${key}" is not available`);
      }
      return entry;
    }
    case 'registry/call': {
      const key = requiredString(params, 'key');
      const args = params['args'];
      if (args !== undefined && !Array.isArray(args)) {
        throw new Error('registry/call params.args must be an array');
      }
      return registry.invoke(key, args);
    }
    case 'registry/resource/get': {
      const key = requiredString(params, 'key');
      const id = optionalString(params, 'id');
      const kind = optionalResourceKind(params, 'kind');
      return registry.resourceGet(key, id, kind);
    }
    case 'registry/resource/set': {
      const key = requiredString(params, 'key');
      const id = optionalString(params, 'id');
      const kind = optionalResourceKind(params, 'kind');
      if (!Object.prototype.hasOwnProperty.call(params, 'value')) {
        throw new Error('registry/resource/set params.value is required');
      }
      return registry.resourceSet(key, params['value'], id, kind);
    }
    case 'registry/resource/update': {
      const key = requiredString(params, 'key');
      const id = optionalString(params, 'id');
      const kind = optionalResourceKind(params, 'kind');
      const source = requiredString(params, 'source');
      if (source.length > 20_000) {
        throw new Error(
          'registry/resource/update params.source exceeds 20000 characters',
        );
      }
      return registry.resourceUpdate(key, source, id, kind);
    }
    case 'registry/resource/patch': {
      const key = requiredString(params, 'key');
      const id = optionalString(params, 'id');
      const kind = optionalResourceKind(params, 'kind');
      const source = requiredString(params, 'source');
      if (source.length > 20_000) {
        throw new Error(
          'registry/resource/patch params.source exceeds 20000 characters',
        );
      }
      return registry.resourcePatch(key, source, id, kind);
    }
    case 'registry/override': {
      const key = requiredString(params, 'key');
      const source = requiredString(params, 'source');
      if (source.length > 20_000) {
        throw new Error(
          'registry/override params.source exceeds 20000 characters',
        );
      }
      return registry.override(key, source);
    }
    case 'registry/restore':
      return registry.restore(requiredString(params, 'key'));
    case 'registry/logs': {
      const sinceId = params['sinceId'];
      if (sinceId !== undefined && typeof sinceId !== 'number') {
        throw new Error('registry/logs params.sinceId must be a number');
      }
      return registry
        .logs()
        .filter((entry) => sinceId === undefined || entry.id > sinceId);
    }
  }
}

function createSnapshot(
  registry: FunctionRegistry,
  clientId: string,
  pageInfo: Readonly<{ pageUrl?: string; pageTitle?: string }>,
): RegistrySnapshot {
  return {
    type: 'registry/snapshot',
    clientId,
    ...pageInfo,
    entries: registry.entries(),
    logs: registry.logs(),
  };
}

export function createFunctionRegistryClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  randomUUID: () => string,
): string {
  const existing = storage.getItem(FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY);
  if (existing !== null && existing.length > 0) {
    return existing;
  }
  const clientId = randomUUID();
  storage.setItem(FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY, clientId);
  return clientId;
}

function parseRequest(rawMessage: unknown): RegistryBridgeRequest {
  const parsed: unknown =
    typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('message must be an object');
  }
  const message = parsed as Record<string, unknown>;
  if (
    message['type'] !== 'request' ||
    typeof message['callId'] !== 'string' ||
    !isRegistryMethod(message['method'])
  ) {
    throw new Error('message must contain type, callId and a registry method');
  }
  const params = message['params'];
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    throw new Error('params must be an object');
  }
  return {
    type: 'request',
    callId: message['callId'],
    method: message['method'],
    ...(params === undefined
      ? {}
      : { params: params as Readonly<Record<string, unknown>> }),
  };
}

function isRegistryMethod(value: unknown): value is RegistryMethod {
  return (
    value === 'registry/list' ||
    value === 'registry/get' ||
    value === 'registry/call' ||
    value === 'registry/resource/get' ||
    value === 'registry/resource/set' ||
    value === 'registry/resource/update' ||
    value === 'registry/resource/patch' ||
    value === 'registry/override' ||
    value === 'registry/restore' ||
    value === 'registry/logs'
  );
}

function requiredString(
  params: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`params.${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  params: Readonly<Record<string, unknown>>,
  name: string,
): string | undefined {
  const value = params[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`params.${name} must be a non-empty string when provided`);
  }
  return value;
}

function optionalResourceKind(
  params: Readonly<Record<string, unknown>>,
  name: string,
): PrimitiveResourceRuntimeKind | undefined {
  const value = params[name];
  if (value === undefined) {
    return undefined;
  }
  if (
    value !== 'query' &&
    value !== 'asyncProcess' &&
    value !== 'mutation' &&
    value !== 'queryParams'
  ) {
    throw new Error(
      `params.${name} must be query, asyncProcess, mutation or queryParams when provided`,
    );
  }
  return value;
}

function sendJson(
  socket: JsonSender,
  message: RegistryBridgeResponse | RegistrySnapshot | object,
): void {
  try {
    socket.send(JSON.stringify(message));
  } catch (error) {
    if (
      'callId' in message &&
      typeof (message as { callId?: unknown }).callId === 'string'
    ) {
      socket.send(
        JSON.stringify({
          type: 'response',
          callId: (message as { callId: string }).callId,
          error: {
            message: `Response is not serializable: ${errorMessage(error)}`,
          },
        }),
      );
      return;
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
