import {
  InjectionToken,
  type EffectRef,
  type ɵInjector as Injector,
} from '@craft-ng/core';
import { craftEffect } from '@craft-ng/core';
import {
  functionRegistry,
  type FunctionRegistry,
  type FunctionRegistryEntry,
  type FunctionRegistryLog,
} from './function-registry';
import type { PrimitiveResourceRuntimeKind } from '@craft-ng/core';
import {
  applyPageActions,
  captureDomStyles,
  collectPageControls,
  isGotoAction,
  toGotoUrl,
  type PageAction,
} from './page-actor';

declare global {
  var __CRAFT_FUNCTION_REGISTRY_BRIDGE_URL__: string | undefined;
}

export const FUNCTION_REGISTRY_BRIDGE_URL = new InjectionToken<string>(
  'FUNCTION_REGISTRY_BRIDGE_URL',
  {
    factory: () =>
      globalThis.__CRAFT_FUNCTION_REGISTRY_BRIDGE_URL__ ??
      'ws://127.0.0.1:3333',
  },
);

export const FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY =
  'ng-craft.function-registry.client-id';

export function persistAssignedClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  clientId: string,
): void {
  storage.setItem(FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY, clientId);
}

export function shouldSendGoodbye(
  event: Pick<PageTransitionEvent, 'persisted'>,
): boolean {
  return event.persisted === false;
}

export function nextReconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(10_000, 1000 * 2 ** attempt);
  return exp + Math.floor(random() * 250);
}

export const FUNCTION_REGISTRY_CLIENT_ID = new InjectionToken<string>(
  'FUNCTION_REGISTRY_CLIENT_ID',
  {
    factory: () =>
      createFunctionRegistryClientId(
        // This token is resolved while the root injector is bootstrapping;
        // using DI-backed browser boundaries here would re-enter this token.
        // eslint-disable-next-line craft-ng/prefer-browser-boundaries
        globalThis.sessionStorage,
        // eslint-disable-next-line craft-ng/prefer-browser-boundaries
        () => globalThis.crypto.randomUUID(),
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
  | 'registry/logs'
  | 'page';

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

type PageSurfaceMessage = Readonly<{
  type: 'page/surface';
  clientId: string;
  url: string;
  title?: string;
  controls: ReturnType<typeof collectPageControls>;
}>;

export function startFunctionRegistryBridge({
  injector,
  url,
  clientId: initialClientId,
  registry = functionRegistry,
  createSocket = (socketUrl) => new WebSocket(socketUrl),
  getPageInfo,
  navigate,
  // eslint-disable-next-line craft-ng/prefer-browser-boundaries
  getDocument = () => globalThis.document,
}: {
  injector: Injector;
  url: string;
  clientId: string;
  registry?: FunctionRegistry;
  createSocket?: (url: string) => RegistryBridgeSocket;
  reconnectDelayMs?: number;
  getPageInfo: () => Readonly<{ pageUrl?: string; pageTitle?: string }>;
  navigate?: (url: string) => Promise<void>;
  getDocument?: () => Document;
}): () => void {
  let clientId = initialClientId;
  let socket: RegistryBridgeSocket | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let publishScheduled = false;
  let attempt = 0;
  let handshakeComplete = false;

  const persistStorage = (): Pick<Storage, 'getItem' | 'setItem'> =>
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    globalThis.sessionStorage;

  const publishSurface = (): void => {
    if (socket?.readyState !== SOCKET_OPEN || !handshakeComplete) {
      return;
    }
    sendJson(socket, createPageSurface(clientId, getPageInfo(), getDocument()));
  };

  const scheduleSurface = (): void => {
    if (publishScheduled) {
      return;
    }
    publishScheduled = true;
    queueMicrotask(() => {
      publishScheduled = false;
      publishSurface();
    });
  };

  const snapshotEffect: EffectRef = craftEffect(
    'snapshotEffect',
    () => {
      const snapshot = createSnapshot(registry, clientId, getPageInfo());
      if (socket?.readyState === SOCKET_OPEN && handshakeComplete) {
        sendJson(socket, snapshot);
      }
    },
    { injector },
  );

  const observer = new MutationObserver(scheduleSurface);

  const scheduleReconnect = (): void => {
    if (stopped) {
      return;
    }
    attempt += 1;
    reconnectTimer = setTimeout(connect, nextReconnectDelayMs(attempt));
  };

  const connect = (): void => {
    if (stopped) {
      return;
    }

    try {
      socket = createSocket(url);
    } catch (error) {
      registry.logBridge(`Connection failed: ${errorMessage(error)}`);
      scheduleReconnect();
      return;
    }

    const currentSocket = socket;
    currentSocket.onopen = () => {
      attempt = 0;
      handshakeComplete = false;
      registry.logBridge(`Connected to ${url}`);
      sendJson(currentSocket, {
        type: 'hello',
        role: 'registry-app',
        clientId,
        ...getPageInfo(),
      });
    };
    currentSocket.onmessage = (event) => {
      if (acceptHelloOk(currentSocket, event.data)) {
        return;
      }
      void respondToBridgeMessage(
        currentSocket,
        event.data,
        registry,
        getDocument,
        getPageInfo,
        navigate,
      );
    };
    currentSocket.onerror = () => {
      registry.logBridge(`WebSocket error for ${url}`);
    };
    currentSocket.onclose = () => {
      handshakeComplete = false;
      if (socket === currentSocket) {
        socket = undefined;
      }
      if (!stopped) {
        setMcpPageBadgeText(getDocument(), 'MCP page: reconnecting');
        registry.logBridge(`Disconnected from ${url}; reconnecting`);
        scheduleReconnect();
      }
    };
  };

  const acceptHelloOk = (
    currentSocket: RegistryBridgeSocket,
    rawMessage: unknown,
  ): boolean => {
    const assignedId = readHelloOkClientId(rawMessage);
    if (assignedId === undefined) {
      return false;
    }
    persistAssignedClientId(persistStorage(), assignedId);
    clientId = assignedId;
    handshakeComplete = true;
    const pageInfo = getPageInfo();
    sendJson(currentSocket, createSnapshot(registry, clientId, pageInfo));
    sendJson(
      currentSocket,
      createPageSurface(clientId, pageInfo, getDocument()),
    );
    setMcpPageBadgeText(
      getDocument(),
      `MCP page: connected · ${clientId.slice(0, 8)}`,
    );
    return true;
  };

  const onPageHide = (event: PageTransitionEvent): void => {
    if (!shouldSendGoodbye(event) || socket?.readyState !== SOCKET_OPEN) {
      return;
    }
    sendJson(socket, { type: 'page/goodbye', clientId });
  };

  const pageDocument = getDocument();
  observer.observe(pageDocument.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  pageDocument.addEventListener('input', scheduleSurface, true);
  pageDocument.addEventListener('change', scheduleSurface, true);
  pageDocument.defaultView?.addEventListener('pagehide', onPageHide);

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
    }
    snapshotEffect.destroy();
    observer.disconnect();
    pageDocument.removeEventListener('input', scheduleSurface, true);
    pageDocument.removeEventListener('change', scheduleSurface, true);
    pageDocument.defaultView?.removeEventListener('pagehide', onPageHide);
    destroyMcpPageBadge(pageDocument);
    socket?.close();
    socket = undefined;
  };
}

export function respondToBridgeMessage(
  socket: JsonSender,
  rawMessage: unknown,
  registry: FunctionRegistry = functionRegistry,
  // eslint-disable-next-line craft-ng/prefer-browser-boundaries
  getDocument: () => Document = () => globalThis.document,
  getPageInfo: () => Readonly<{ pageUrl?: string; pageTitle?: string }> = () => ({
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    pageUrl: globalThis.location?.href,
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    pageTitle: globalThis.document?.title,
  }),
  navigate?: (url: string) => Promise<void>,
): Promise<void> {
  let request: RegistryBridgeRequest;
  try {
    request = parseRequest(rawMessage);
  } catch (error) {
    registry.logBridge(`Ignored invalid request: ${errorMessage(error)}`);
    return Promise.resolve();
  }

  return handleFunctionRegistryRequest(
    request,
    registry,
    getDocument,
    getPageInfo,
    navigate,
  )
    .then((result) => {
      sendJson(socket, { type: 'response', callId: request.callId, result });
    })
    .catch((error) => {
      sendJson(socket, {
        type: 'response',
        callId: request.callId,
        error: { message: errorMessage(error) },
      });
    });
}

export function handleFunctionRegistryRequest(
  request: RegistryBridgeRequest,
  registry: FunctionRegistry = functionRegistry,
  // eslint-disable-next-line craft-ng/prefer-browser-boundaries
  getDocument: () => Document = () => globalThis.document,
  getPageInfo: () => Readonly<{ pageUrl?: string; pageTitle?: string }> = () => ({
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    pageUrl: globalThis.location?.href,
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    pageTitle: globalThis.document?.title,
  }),
  navigate?: (url: string) => Promise<void>,
): Promise<unknown> {
  if (request.method === 'page') {
    return handlePageRequest(
      request.params ?? {},
      getDocument,
      getPageInfo,
      navigate,
    );
  }
  return Promise.resolve().then(() =>
    handleFunctionRegistryRequestSync(request, registry),
  );
}

function handleFunctionRegistryRequestSync(
  request: RegistryBridgeRequest,
  registry: FunctionRegistry,
): unknown {
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
    case 'page':
      throw new Error('page must be handled asynchronously');
  }
}

async function handlePageRequest(
  params: Readonly<Record<string, unknown>>,
  getDocument: () => Document,
  getPageInfo: () => Readonly<{ pageUrl?: string; pageTitle?: string }>,
  navigate?: (url: string) => Promise<void>,
): Promise<unknown> {
  const act = params['act'];
  const detail = params['detail'] === 'dom-styles' ? 'dom-styles' : 'controls';
  let error: string | undefined;
  if (act !== undefined) {
    if (!Array.isArray(act)) {
      throw new Error('params.act must be an array');
    }
    const actions = act as PageAction[];
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (action === undefined) {
        continue;
      }
      if (isGotoAction(action)) {
        if (navigate === undefined) {
          error = `goto "${action.goto}" is not available`;
          break;
        }
        try {
          await navigate(toGotoUrl(action.goto));
          await waitForPageUrl(getPageInfo, action.goto);
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
          break;
        }
        const next = actions
          .slice(index + 1)
          .find((item): item is Exclude<PageAction, { readonly goto: string }> =>
            !isGotoAction(item),
          );
        if (next !== undefined) {
          await waitForControlIds(getDocument(), [next.id]);
        }
        continue;
      }
      const applied = applyPageActions(getDocument(), [action]);
      if (applied.error !== undefined) {
        error = applied.error;
        break;
      }
    }
    if (error === undefined) {
      await waitForControlIds(
        getDocument(),
        actions.flatMap((action) => (isGotoAction(action) ? [] : [action.id])),
      );
    }
  }
  const pageDocument = getDocument();
  const pageInfo = getPageInfo();
  const url = pageInfo.pageUrl ?? pageDocument.defaultView?.location.href ?? '';
  const title = pageInfo.pageTitle ?? pageDocument.title;
  const controls = collectPageControls(pageDocument);
  if (detail === 'dom-styles') {
    const styles = params['styles'];
    const whitelist = Array.isArray(styles)
      ? styles.filter((value): value is string => typeof value === 'string')
      : undefined;
    return {
      url,
      ...(title === undefined || title.length === 0 ? {} : { title }),
      status: 'ready',
      controls,
      dom: captureDomStyles(pageDocument.documentElement, whitelist),
      ...(error === undefined ? {} : { error }),
    };
  }
  return {
    url,
    ...(title === undefined || title.length === 0 ? {} : { title }),
    status: 'ready',
    controls,
    ...(error === undefined ? {} : { error }),
  };
}

async function waitForControlIds(
  pageDocument: Document,
  ids: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const present = new Set(
      collectPageControls(pageDocument).map((control) => control.id),
    );
    if (ids.every((id) => present.has(id))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

async function waitForPageUrl(
  getPageInfo: () => Readonly<{ pageUrl?: string; pageTitle?: string }>,
  target: string,
): Promise<void> {
  const expected = toGotoUrl(target);
  const expectedPath =
    (expected.split('#')[0] ?? expected).split('?')[0] ?? expected;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const href = getPageInfo().pageUrl ?? '';
    if (pathnameOf(href) === expectedPath) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  throw new Error(`goto "${target}" was not matched`);
}

function pathnameOf(href: string): string {
  try {
    return new URL(href, 'http://localhost').pathname;
  } catch {
    return href;
  }
}

function readHelloOkClientId(rawMessage: unknown): string | undefined {
  try {
    const parsed: unknown =
      typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const message = parsed as Record<string, unknown>;
    if (
      message['type'] !== 'hello/ok' ||
      typeof message['clientId'] !== 'string'
    ) {
      return undefined;
    }
    return message['clientId'];
  } catch {
    return undefined;
  }
}

function ensureMcpPageBadge(pageDocument: Document): HTMLDivElement {
  const existing = pageDocument.getElementById('mcp-page-bridge-status');
  if (existing instanceof HTMLDivElement) {
    return existing;
  }
  const badge = pageDocument.createElement('div');
  badge.id = 'mcp-page-bridge-status';
  badge.setAttribute('aria-live', 'polite');
  badge.style.cssText =
    'position:fixed;bottom:8px;left:8px;pointer-events:none;z-index:2147483647;font:12px/1.4 system-ui,sans-serif;padding:4px 8px;background:#111;color:#fff;opacity:0.85;';
  pageDocument.body.append(badge);
  return badge;
}

function setMcpPageBadgeText(pageDocument: Document, text: string): void {
  ensureMcpPageBadge(pageDocument).textContent = text;
}

function destroyMcpPageBadge(pageDocument: Document): void {
  pageDocument.getElementById('mcp-page-bridge-status')?.remove();
}

function createPageSurface(
  clientId: string,
  pageInfo: Readonly<{ pageUrl?: string; pageTitle?: string }>,
  pageDocument: Document,
): PageSurfaceMessage {
  return {
    type: 'page/surface',
    clientId,
    url: pageInfo.pageUrl ?? '',
    ...(pageInfo.pageTitle === undefined ? {} : { title: pageInfo.pageTitle }),
    controls: collectPageControls(pageDocument),
  };
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
    value === 'registry/logs' ||
    value === 'page'
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
