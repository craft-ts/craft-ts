import { craftUse } from './craft-use';
import {
  abstract,
  craftService,
  SERVICE_RUNTIME_OVERRIDES,
  type ServiceRuntimeOverride,
} from './craft-service';
import type { ConsoleServiceApi } from './browser-boundaries';
import {
  DestroyRef,
  inject,
  provideAppInitializer,
  type Provider,
} from './host/craft-compat';

const DEFAULT_LOG_SERVER_URL = 'http://127.0.0.1:4319/logs';
const DEFAULT_MCP_BRIDGE_URL = 'ws://127.0.0.1:3333';
const LOG_LEVELS = ['debug', 'info', 'log', 'warn', 'error'] as const;
const CLIENT_ID_KEY = 'craft-ts.dev-tools.client-id';

type LogLevel = (typeof LOG_LEVELS)[number];
type ConsoleMetadata = Readonly<{
  from: readonly string[];
  tags: readonly unknown[];
  trace: string;
  correlationId: unknown;
  timestamp: string;
  route: string;
  browser?: unknown;
}>;

export type CraftDevToolsOptions = Readonly<{
  readonly logServerUrl?: string;
  readonly mcpBridgeUrl?: string;
}>;

const { CraftLogServerUrl, provideCraftLogServerUrl } = craftService(
  { name: 'CraftLogServerUrl', providedIn: 'abstract' },
  abstract<string>(),
);

/** Install the standard development logs and browser MCP surface. */
export function provideCraftDevTools(
  options: CraftDevToolsOptions = {},
): readonly Provider[] {
  return [
    provideCraftLogServerUrl(
      () => options.logServerUrl ?? DEFAULT_LOG_SERVER_URL,
    ),
    provideCraftLogForwarding(),
    provideCraftMcpPageBridge(options.mcpBridgeUrl ?? DEFAULT_MCP_BRIDGE_URL),
  ];
}

function provideCraftLogForwarding(): Provider {
  return {
    provide: SERVICE_RUNTIME_OVERRIDES,
    useFactory: (): ReadonlyMap<string, ServiceRuntimeOverride> => {
      if (!isBrowser()) return new Map();
      const endpoint = craftUse(CraftLogServerUrl());
      const destroyRef = inject(DestroyRef);
      const clientId = getClientId();
      const pending: Record<string, unknown>[] = [];
      const flush = (beacon = false): void => {
        if (pending.length === 0) return;
        const entries = pending.splice(0, pending.length);
        const body = JSON.stringify({ clientId, entries });
        try {
          if (beacon && typeof globalThis.navigator?.sendBeacon === 'function') {
            globalThis.navigator.sendBeacon(
              endpoint,
              new Blob([body], { type: 'application/json' }),
            );
          } else {
            void globalThis.fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
              keepalive: true,
            }).catch(() => undefined);
          }
        } catch {
          // Observability is best effort and must never break the application.
        }
      };
      const forward = (level: LogLevel, args: readonly unknown[]): void => {
        const metadata = isConsoleMetadata(args.at(-1)) ? args.at(-1) : undefined;
        const values = metadata === undefined ? args : args.slice(0, -1);
        pending.push({
          level,
          message: values.map(formatValue).join(' '),
          args: values.map(toJsonSafe),
          ...(metadata ?? {}),
        });
        while (pending.length > 1000) pending.shift();
        if (pending.length >= 50) flush();
      };
      const timer = globalThis.setInterval(() => flush(), 1000);
      const target = globalThis.console;
      const forwardingConsole = { ...target } as unknown as ConsoleServiceApi;
      for (const level of LOG_LEVELS) {
        forwardingConsole[level] = (...args: unknown[]) => {
          forward(level, args);
          target[level](...args);
        };
      }
      const onPageHide = () => flush(true);
      globalThis.addEventListener('pagehide', onPageHide);
      const stop = () => {
        globalThis.clearInterval(timer);
        globalThis.removeEventListener('pagehide', onPageHide);
        flush();
      };
      destroyRef.onDestroy(stop);
      return new Map([['ConsoleService', { kind: 'useValue', value: forwardingConsole }]]);
    },
  };
}

function provideCraftMcpPageBridge(url: string): Provider {
  return provideAppInitializer(() => {
    if (!isBrowser() || typeof globalThis.WebSocket === 'undefined') return;
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(startMcpPageBridge(url, getClientId()));
  });
}

function startMcpPageBridge(url: string, initialClientId: string): () => void {
  let socket: WebSocket | undefined;
  let clientId = initialClientId;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const pageInfo = () => ({
    pageUrl: globalThis.location.href,
    pageTitle: globalThis.document.title,
  });
  const controls = () => Array.from(
    globalThis.document.querySelectorAll<HTMLElement>('[data-craft-name]'),
  ).map((element, index) => ({
    id: element.dataset['craftName'] ?? '',
    role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
    name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
    enabled: !element.hasAttribute('disabled'),
    index,
  }));
  const publish = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const info = pageInfo();
    socket.send(JSON.stringify({
      type: 'page/surface', clientId, url: info.pageUrl, title: info.pageTitle,
      controls: controls(),
    }));
  };
  const snapshot = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const info = pageInfo();
    socket.send(JSON.stringify({
      type: 'registry/snapshot', clientId, pageUrl: info.pageUrl,
      pageTitle: info.pageTitle, entries: [], logs: [],
    }));
  };
  const onMessage = (event: MessageEvent): void => {
    let message: unknown;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (typeof message !== 'object' || message === null) return;
    const record = message as Record<string, unknown>;
    if (record['type'] === 'hello/ok' && typeof record['clientId'] === 'string') {
      clientId = record['clientId'];
      globalThis.sessionStorage.setItem(CLIENT_ID_KEY, clientId);
      snapshot();
      publish();
      return;
    }
    if (record['type'] !== 'request' || typeof record['callId'] !== 'string') return;
    const result = record['method'] === 'page'
      ? { ...pageInfo(), status: 'ready', controls: controls() }
      : undefined;
    socket?.send(JSON.stringify({
      type: 'response', callId: record['callId'],
      ...(result === undefined
        ? { error: { message: 'This app exposes only the page MCP surface.' } }
        : { result }),
    }));
  };
  const connect = () => {
    if (stopped) return;
    try { socket = new WebSocket(url); } catch {
      reconnectTimer = globalThis.setTimeout(connect, 1000);
      return;
    }
    socket.onopen = () => {
      socket?.send(JSON.stringify({ type: 'hello', role: 'registry-app', clientId, ...pageInfo() }));
      snapshot();
      publish();
    };
    socket.onmessage = onMessage;
    socket.onclose = () => {
      if (!stopped) reconnectTimer = globalThis.setTimeout(connect, 1000);
    };
  };
  const observer = new MutationObserver(publish);
  observer.observe(globalThis.document.documentElement, { childList: true, subtree: true, attributes: true });
  globalThis.document.addEventListener('input', publish, true);
  globalThis.document.addEventListener('change', publish, true);
  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) globalThis.clearTimeout(reconnectTimer);
    observer.disconnect();
    globalThis.document.removeEventListener('input', publish, true);
    globalThis.document.removeEventListener('change', publish, true);
    socket?.close();
  };
}

function getClientId(): string {
  const existing = globalThis.sessionStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = globalThis.crypto.randomUUID();
  globalThis.sessionStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

function isBrowser(): boolean {
  return typeof globalThis.document !== 'undefined';
}

function isConsoleMetadata(value: unknown): value is ConsoleMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate['from']) && Array.isArray(candidate['tags']) &&
    typeof candidate['trace'] === 'string' && typeof candidate['timestamp'] === 'string' &&
    typeof candidate['route'] === 'string';
}

function toJsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Depth limit]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    try { result[key] = toJsonSafe(item, depth + 1); } catch { result[key] = '[Circular]'; }
  }
  return result;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try { return JSON.stringify(toJsonSafe(value)); } catch { return String(value); }
}
