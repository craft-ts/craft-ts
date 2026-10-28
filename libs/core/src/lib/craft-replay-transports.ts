import {
  Injector,
  runInInjectionContext,
  type Provider,
} from './host/craft-compat';
import { ɵcraftValueService } from './craft-service';
import type { SendContextSession } from './send-context-to-ai.tokens';
import { ɵinjectCorrelationIdService } from './correlation-id';
import { isCraftReplaying } from './craft-replay';
import { ɵisCraftHttpTransportActive } from './craft-http-trace';

export type CraftReplayTransportKind =
  | 'websocket'
  | 'worker'
  | 'fetch'
  | 'xhr'
  | 'eventsource'
  | 'sendbeacon'
  | 'webtransport'
  | 'custom';

/** JSON-safe representation produced by an application-owned transport codec. */
export type CraftReplayTransportValue =
  | Readonly<{ codec: 'json'; value: unknown }>
  | Readonly<{ codec: 'text'; value: string }>
  | Readonly<{ codec: 'base64'; value: string }>;

export type CraftReplayTransportDefinition = Readonly<{
  id: string;
  kind: CraftReplayTransportKind;
  match: (url: string) => boolean;
  serialize?: (value: unknown) => CraftReplayTransportValue;
  deserialize?: (value: CraftReplayTransportValue) => unknown;
  redact?: (
    value: CraftReplayTransportValue,
  ) => CraftReplayTransportValue | undefined;
  maxMessageBytes?: number;
  /** Application-owned capture/replay hooks for custom transports. */
  record?: (context: CraftReplayTransportHookContext) => unknown;
  replay?: (context: CraftReplayTransportHookContext) => unknown;
}>;

export type CraftReplayTransportHookContext = Readonly<{
  id: string;
  url: string;
  direction: 'outgoing' | 'incoming' | 'lifecycle';
  messageType: string;
  data?: unknown;
  elapsedMs: number;
}>;

export type CraftWebSocketReplayOptions = Omit<
  CraftReplayTransportDefinition,
  'kind' | 'record' | 'replay'
> &
  Partial<Pick<CraftReplayTransportDefinition, 'record' | 'replay'>>;
export type CraftWorkerReplayOptions = Omit<
  CraftReplayTransportDefinition,
  'kind' | 'record' | 'replay'
> &
  Partial<Pick<CraftReplayTransportDefinition, 'record' | 'replay'>>;
export type CraftReplayAdapterOptions = Omit<
  CraftReplayTransportDefinition,
  'kind' | 'record' | 'replay'
> &
  Required<Pick<CraftReplayTransportDefinition, 'record' | 'replay'>>;

export function craftWebSocketReplay(
  options: CraftWebSocketReplayOptions,
): CraftReplayTransportDefinition {
  return defineTransport('websocket', options);
}

export function craftWorkerReplay(
  options: CraftWorkerReplayOptions,
): CraftReplayTransportDefinition {
  return defineTransport('worker', options);
}

export function craftFetchReplay(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('fetch', options);
}
export function craftXhrReplay(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('xhr', options);
}
export function craftEventSourceReplay(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('eventsource', options);
}
export function craftSendBeaconReplay(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('sendbeacon', options);
}
export function craftWebTransportReplay(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('webtransport', options);
}

/** Declares an application transport. Its hooks stay in application code. */
export function craftReplayAdapter(
  options: CraftReplayAdapterOptions,
): CraftReplayTransportDefinition {
  return defineTransport('custom', options);
}

function defineTransport(
  kind: CraftReplayTransportDefinition['kind'],
  options: CraftReplayTransportOptions,
): CraftReplayTransportDefinition {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(options.id)) {
    throw new Error(`Invalid replay transport id: ${options.id}`);
  }
  if (typeof options.match !== 'function')
    throw new Error(
      `Replay transport ${options.id} requires a match function.`,
    );
  if (
    options.maxMessageBytes !== undefined &&
    (!Number.isSafeInteger(options.maxMessageBytes) ||
      options.maxMessageBytes < 1 ||
      options.maxMessageBytes > 1_048_576)
  )
    throw new Error(
      `Replay transport ${options.id} maxMessageBytes must be between 1 and 1048576.`,
    );
  return Object.freeze({ kind, ...options });
}

type CraftReplayTransportOptions = Omit<CraftReplayTransportDefinition, 'kind'>;

const transportDefinitions = ɵcraftValueService(
  {
    name: 'CraftReplayTransportDefinitions',
    providedIn: 'toProvide',
    collection: true,
  },
  (inputs: { $provided?: CraftReplayTransportDefinition }) =>
    inputs.$provided ? [inputs.$provided] : [],
) as unknown as {
  provideCraftReplayTransportDefinitions: (
    value?: CraftReplayTransportDefinition,
  ) => unknown;
  CRAFT_REPLAY_TRANSPORT_DEFINITIONS_META_DATA: {
    inject(): readonly CraftReplayTransportDefinition[];
  };
};

/** Registers app-owned codecs and matching rules used by recording and replay. */
export function provideCraftReplayTransports(
  ...definitions: readonly CraftReplayTransportDefinition[]
): Provider[] {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id))
      throw new Error(`Duplicate replay transport id: ${definition.id}`);
    ids.add(definition.id);
  }
  return definitions.map(
    (definition) =>
      transportDefinitions.provideCraftReplayTransportDefinitions(
        definition,
      ) as Provider,
  );
}

/** @internal Read configured adapters from the active application injector. */
export function injectCraftReplayTransports(
  injector?: Injector,
): readonly CraftReplayTransportDefinition[] {
  try {
    const definitions = injector
      ? runInInjectionContext(injector, () =>
          transportDefinitions.CRAFT_REPLAY_TRANSPORT_DEFINITIONS_META_DATA.inject(),
        )
      : transportDefinitions.CRAFT_REPLAY_TRANSPORT_DEFINITIONS_META_DATA.inject();
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id))
        throw new Error(`Duplicate replay transport id: ${definition.id}`);
      ids.add(definition.id);
    }
    return definitions;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Duplicate replay transport id:')
    )
      throw error;
    return [];
  }
}

export interface CraftReplayTransportEvent {
  readonly transportId: string;
  readonly transport: CraftReplayTransportKind;
  readonly instanceId: string;
  readonly direction: 'outgoing' | 'incoming' | 'lifecycle';
  readonly messageType: string;
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly data?: CraftReplayTransportValue;
  readonly replayable: boolean;
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function isCraftReplayTransportEvent(
  value: unknown,
): value is CraftReplayTransportEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value['transportId'] === 'string' &&
    value['transportId'].length > 0 &&
    value['transportId'].length <= 128 &&
    [
      'websocket',
      'worker',
      'fetch',
      'xhr',
      'eventsource',
      'sendbeacon',
      'webtransport',
      'custom',
    ].includes(String(value['transport'])) &&
    typeof value['instanceId'] === 'string' &&
    value['instanceId'].length > 0 &&
    value['instanceId'].length <= 200 &&
    (value['direction'] === 'outgoing' ||
      value['direction'] === 'incoming' ||
      value['direction'] === 'lifecycle') &&
    typeof value['messageType'] === 'string' &&
    value['messageType'].length > 0 &&
    value['messageType'].length <= 64 &&
    Number.isSafeInteger(value['sequence']) &&
    (value['sequence'] as number) > 0 &&
    typeof value['elapsedMs'] === 'number' &&
    Number.isFinite(value['elapsedMs']) &&
    value['elapsedMs'] >= 0 &&
    typeof value['replayable'] === 'boolean' &&
    (value['reason'] === undefined ||
      (typeof value['reason'] === 'string' && value['reason'].length <= 300)) &&
    (value['metadata'] === undefined || isRecord(value['metadata'])) &&
    (value['data'] === undefined || isCraftReplayTransportValue(value['data']))
  );
}

export function isCraftReplayTransportValue(
  value: unknown,
): value is CraftReplayTransportValue {
  if (
    !isRecord(value) ||
    (typeof value['value'] !== 'string' && value['codec'] === 'text') ||
    (typeof value['value'] !== 'string' && value['codec'] === 'base64')
  )
    return false;
  return (
    value['codec'] === 'json' ||
    value['codec'] === 'text' ||
    value['codec'] === 'base64'
  );
}

/** @internal Installs capture-only wrappers and restores them when the session ends. */
export function connectCraftReplayTransportCapture(
  session: SendContextSession,
  definitions: readonly CraftReplayTransportDefinition[],
): () => void {
  const cleanups: Array<() => void> = [];
  const restoreGlobal = (
    name: 'WebSocket' | 'Worker',
    replacement: unknown,
  ) => {
    const target = globalThis as unknown as Record<string, unknown>;
    const native = target[name];
    if (typeof native !== 'function') return;
    target[name] = replacement;
    cleanups.push(() => {
      if (target[name] === replacement) target[name] = native;
    });
  };
  const sockets = definitions.filter((entry) => entry.kind === 'websocket');
  const workers = definitions.filter((entry) => entry.kind === 'worker');
  if (typeof globalThis.WebSocket === 'function') {
    const Native = globalThis.WebSocket;
    const Wrapped = new Proxy(Native, {
      construct(target, args, newTarget) {
        const url = String(args[0] ?? '');
        if (isCraftReplaying())
          return Reflect.construct(target, args, newTarget);
        const adapter = findMatching(sockets, url);
        if (!adapter)
          captureCoverageFailure(session, 'websocket', 'no-matching-adapter');
        const socket = Reflect.construct(target, args, newTarget) as WebSocket;
        if (adapter) observeSocket(session, adapter, url, socket);
        return socket;
      },
    });
    restoreGlobal('WebSocket', Wrapped);
  }
  if (typeof globalThis.Worker === 'function') {
    const Native = globalThis.Worker;
    const Wrapped = new Proxy(Native, {
      construct(target, args, newTarget) {
        const url = String(args[0] ?? '');
        if (isCraftReplaying())
          return Reflect.construct(target, args, newTarget);
        const adapter = findMatching(workers, url);
        if (!adapter)
          captureCoverageFailure(session, 'worker', 'no-matching-adapter');
        const worker = Reflect.construct(target, args, newTarget) as Worker;
        if (adapter)
          observeWorker(
            session,
            adapter,
            url,
            worker,
            args[1] as WorkerOptions | undefined,
          );
        return worker;
      },
    });
    restoreGlobal('Worker', Wrapped);
  }
  installCoverageCapture(session, definitions, cleanups);
  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
  };
}

/** Records an application-owned transport event after applying its app codec and redactor. */
export function captureCraftReplayTransportEvent(
  session: SendContextSession,
  adapter: CraftReplayTransportDefinition,
  context: Omit<CraftReplayTransportHookContext, 'elapsedMs'> & {
    elapsedMs?: number;
  },
): void {
  const elapsedMs = context.elapsedMs ?? session.elapsedTime();
  let sequences = customTransportSequences.get(session);
  if (!sequences) {
    sequences = new Map();
    customTransportSequences.set(session, sequences);
  }
  const sequence = (sequences.get(context.id) ?? 0) + 1;
  sequences.set(context.id, sequence);
  let data = context.data;
  try {
    if (adapter.record && context.data !== undefined)
      data = adapter.record({ ...context, elapsedMs });
  } catch {
    captureTransport(
      session,
      adapter,
      context.id,
      sequence,
      context.direction,
      context.messageType,
      undefined,
      { replayable: false, reason: 'record-hook-failed' },
    );
    return;
  }
  if (context.data !== undefined && data === undefined) {
    captureCoverageFailure(session, adapter.kind, 'record-hook-redacted-data');
    return;
  }
  captureTransport(
    session,
    adapter,
    context.id,
    sequence,
    context.direction,
    context.messageType,
    data,
  );
}

const customTransportSequences = new WeakMap<
  SendContextSession,
  Map<string, number>
>();

/** Browser APIs without a registered deterministic codec are explicitly marked. */
function installCoverageCapture(
  session: SendContextSession,
  definitions: readonly CraftReplayTransportDefinition[],
  cleanups: Array<() => void>,
): void {
  const report = (api: string, reason: string) =>
    captureCoverageFailure(session, api, reason);
  const replace = (object: object, key: string, wrapper: unknown) => {
    const target = object as Record<string, unknown>;
    const original = target[key];
    if (typeof original !== 'function') return;
    const ownDescriptor = Object.getOwnPropertyDescriptor(object, key);
    try {
      Object.defineProperty(object, key, {
        configurable: true,
        writable: true,
        value: wrapper,
      });
    } catch {
      return;
    }
    cleanups.push(() => {
      if (target[key] !== wrapper) return;
      if (ownDescriptor) Object.defineProperty(object, key, ownDescriptor);
      else delete target[key];
    });
    return original as (...args: unknown[]) => unknown;
  };
  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch === 'function')
    replace(
      globalThis,
      'fetch',
      async function (this: unknown, ...args: unknown[]) {
        if (isCraftReplaying() || ɵisCraftHttpTransportActive())
          return Reflect.apply(nativeFetch, this, args);
        let request: Request | undefined;
        try {
          request = new Request(
            args[0] as RequestInfo | URL,
            args[1] as RequestInit | undefined,
          );
        } catch {
          /* Let native fetch report invalid input. */
        }
        const adapter =
          request &&
          findMatching(
            definitions.filter((item) => item.kind === 'fetch'),
            request.url,
          );
        const hasRecorder = Boolean(
          (globalThis as unknown as Record<string, unknown>)[
            '__craftDebugSessionFetchCaptureInstalled'
          ],
        );
        if (!adapter && !hasRecorder) report('fetch', 'no-recorded-adapter');
        if (!adapter || !request)
          return Reflect.apply(
            nativeFetch,
            this,
            request ? [request.clone()] : args,
          );
        const id = randomTransportId();
        const body = await request
          .clone()
          .text()
          .catch(() => undefined);
        captureCraftReplayTransportEvent(session, adapter, {
          id,
          url: request.url,
          direction: 'outgoing',
          messageType: 'request',
          data: {
            method: request.method,
            ...(body === undefined ? {} : { body }),
          },
        });
        try {
          const response = (await Reflect.apply(nativeFetch, this, [
            request.clone(),
          ])) as Response;
          const clone = response.clone();
          const responseBody = await clone.text().catch(() => '');
          captureCraftReplayTransportEvent(session, adapter, {
            id,
            url: request.url,
            direction: 'incoming',
            messageType: 'response',
            data: {
              status: response.status,
              statusText: response.statusText,
              headers: [...response.headers],
              body: responseBody,
            },
          });
          return response;
        } catch (error) {
          captureCraftReplayTransportEvent(session, adapter, {
            id,
            url: request.url,
            direction: 'lifecycle',
            messageType: 'failure',
            data:
              error instanceof Error
                ? { name: error.name, message: error.message }
                : { name: 'Error' },
          });
          throw error;
        }
      },
    );
  const xhrPrototype = globalThis.XMLHttpRequest?.prototype;
  if (xhrPrototype) {
    const open = xhrPrototype.open;
    replace(
      xhrPrototype,
      'open',
      function (this: XMLHttpRequest, ...args: unknown[]) {
        const xhr = this as XMLHttpRequest & {
          __craftReplayUrl?: string;
          __craftReplayMethod?: string;
          __craftReplayAdapter?: CraftReplayTransportDefinition;
          __craftReplayId?: string;
        };
        xhr.__craftReplayUrl = String(args[1] ?? '');
        xhr.__craftReplayMethod = String(args[0] ?? 'GET');
        xhr.__craftReplayAdapter = findMatching(
          definitions.filter((item) => item.kind === 'xhr'),
          xhr.__craftReplayUrl,
        );
        xhr.__craftReplayId = randomTransportId();
        return Reflect.apply(open, this, args);
      },
    );
    const send = xhrPrototype.send;
    replace(
      xhrPrototype,
      'send',
      function (this: XMLHttpRequest, ...args: unknown[]) {
        if (isCraftReplaying()) return Reflect.apply(send, this, args);
        const xhr = this as XMLHttpRequest & {
          __craftReplayUrl?: string;
          __craftReplayMethod?: string;
          __craftReplayAdapter?: CraftReplayTransportDefinition;
          __craftReplayId?: string;
        };
        const adapter = xhr.__craftReplayAdapter;
        if (!adapter) {
          report('xhr', 'no-recorded-adapter');
          return Reflect.apply(send, this, args);
        }
        const id = xhr.__craftReplayId ?? randomTransportId();
        captureCraftReplayTransportEvent(session, adapter, {
          id,
          url: xhr.__craftReplayUrl ?? '',
          direction: 'outgoing',
          messageType: 'request',
          data: {
            method: xhr.__craftReplayMethod ?? 'GET',
            ...(args[0] === undefined ? {} : { body: args[0] }),
          },
        });
        const finish = (
          direction: 'incoming' | 'lifecycle',
          messageType: string,
          data?: unknown,
        ) =>
          captureCraftReplayTransportEvent(session, adapter, {
            id,
            url: xhr.__craftReplayUrl ?? '',
            direction,
            messageType,
            data,
          });
        xhr.addEventListener(
          'load',
          () =>
            finish('incoming', 'response', {
              status: xhr.status,
              statusText: xhr.statusText,
              body:
                typeof xhr.responseText === 'string'
                  ? xhr.responseText
                  : undefined,
            }),
          { once: true },
        );
        xhr.addEventListener('error', () => finish('lifecycle', 'failure'), {
          once: true,
        });
        return Reflect.apply(send, this, args);
      },
    );
  }
  const beacon = globalThis.navigator?.sendBeacon;
  if (typeof beacon === 'function')
    replace(
      globalThis.navigator,
      'sendBeacon',
      function (this: Navigator, ...args: unknown[]) {
        if (isCraftReplaying()) return false;
        const url = String(args[0] ?? '');
        const adapter = findMatching(
          definitions.filter((item) => item.kind === 'sendbeacon'),
          url,
        );
        if (!adapter) {
          report('sendBeacon', 'no-recorded-adapter');
          return Reflect.apply(beacon, this, args);
        }
        captureCraftReplayTransportEvent(session, adapter, {
          id: randomTransportId(),
          url,
          direction: 'outgoing',
          messageType: 'send',
          ...(args[1] === undefined ? {} : { data: args[1] }),
        });
        return Reflect.apply(beacon, this, args);
      },
    );
  for (const [api, key] of [
    ['EventSource', 'EventSource'],
    ['WebTransport', 'WebTransport'],
  ] as const) {
    const target = globalThis as unknown as Record<string, unknown>;
    const Native = target[key];
    if (typeof Native !== 'function') continue;
    const Wrapped = new Proxy(Native as new (...args: unknown[]) => object, {
      construct(original, args, newTarget) {
        if (isCraftReplaying())
          return Reflect.construct(original, args, newTarget);
        const url = String(args[0] ?? '');
        const kind = api === 'EventSource' ? 'eventsource' : 'webtransport';
        const adapter = findMatching(
          definitions.filter((item) => item.kind === kind),
          url,
        );
        if (!adapter) report(kind, 'no-recorded-adapter');
        const instance = Reflect.construct(
          original,
          args,
          newTarget,
        ) as EventTarget;
        if (adapter) {
          const id = randomTransportId();
          captureCraftReplayTransportEvent(session, adapter, {
            id,
            url,
            direction: 'lifecycle',
            messageType: 'created',
          });
          if (api === 'EventSource') {
            instance.addEventListener('message', (event) =>
              captureCraftReplayTransportEvent(session, adapter, {
                id,
                url,
                direction: 'incoming',
                messageType: 'message',
                data: (event as MessageEvent).data,
              }),
            );
            instance.addEventListener('error', () =>
              captureCraftReplayTransportEvent(session, adapter, {
                id,
                url,
                direction: 'lifecycle',
                messageType: 'error',
              }),
            );
          } else {
            captureCoverageFailure(
              session,
              'webtransport',
              'stream-io-requires-application-hook',
            );
          }
        }
        return instance;
      },
    });
    target[key] = Wrapped;
    cleanups.push(() => {
      if (target[key] === Wrapped) target[key] = Native;
    });
  }
}

function captureCoverageFailure(
  session: SendContextSession,
  api: string,
  reason: string,
): void {
  session.capture('transport', 'failed', {
    name: `network-coverage:${api}`,
    payload: { api, reason },
  });
}

function findMatching(
  definitions: readonly CraftReplayTransportDefinition[],
  url: string,
): CraftReplayTransportDefinition | undefined {
  return definitions.find((definition) => {
    try {
      return definition.match(url);
    } catch {
      return false;
    }
  });
}

function observeSocket(
  session: SendContextSession,
  adapter: CraftReplayTransportDefinition,
  rawUrl: string,
  socket: WebSocket,
): void {
  const id = randomTransportId();
  let sequence = 0;
  const record = (
    direction: CraftReplayTransportEvent['direction'],
    messageType: string,
    data?: unknown,
    metadata?: Record<string, unknown>,
  ) =>
    captureTransport(
      session,
      adapter,
      id,
      ++sequence,
      direction,
      messageType,
      data,
      metadata,
    );
  record('lifecycle', 'created', undefined, {
    url: redactTransportUrl(rawUrl),
  });
  socket.addEventListener('open', () => record('lifecycle', 'open'));
  socket.addEventListener('message', (event) => {
    void record('incoming', 'message', event.data);
  });
  socket.addEventListener('error', () => record('lifecycle', 'error'));
  socket.addEventListener('close', (event) =>
    record('lifecycle', 'close', undefined, {
      code: event.code,
      reason: redactText(event.reason),
      wasClean: event.wasClean,
    }),
  );
  const close = socket.close.bind(socket);
  socket.close = ((code?: number, reason?: string) => {
    record('lifecycle', 'close-request', undefined, {
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason: redactText(reason) }),
    });
    return close(code, reason);
  }) as WebSocket['close'];
  const send = socket.send.bind(socket);
  socket.send = ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    void record('outgoing', 'message', data);
    return (send as (value: unknown) => void)(data);
  }) as WebSocket['send'];
}

function observeWorker(
  session: SendContextSession,
  adapter: CraftReplayTransportDefinition,
  rawUrl: string,
  worker: Worker,
  options?: WorkerOptions,
): void {
  const id = randomTransportId();
  let sequence = 0;
  const record = (
    direction: CraftReplayTransportEvent['direction'],
    messageType: string,
    data?: unknown,
    metadata?: Record<string, unknown>,
  ) =>
    captureTransport(
      session,
      adapter,
      id,
      ++sequence,
      direction,
      messageType,
      data,
      metadata,
    );
  record('lifecycle', 'created', undefined, {
    url: redactTransportUrl(rawUrl),
    type: options?.type ?? 'classic',
  });
  worker.addEventListener('message', (event) => {
    void record('incoming', 'message', event.data);
  });
  worker.addEventListener('messageerror', () =>
    record('lifecycle', 'messageerror'),
  );
  worker.addEventListener('error', (event) =>
    record('lifecycle', 'error', undefined, {
      message: redactText(event.message),
    }),
  );
  const postMessage = worker.postMessage.bind(worker);
  worker.postMessage = ((message: unknown, transfer?: Transferable[]) => {
    void record(
      'outgoing',
      'message',
      message,
      transfer?.length
        ? { replayable: false, reason: 'transfer-detachment-unsupported' }
        : undefined,
    );
    return postMessage(message, transfer ?? []);
  }) as Worker['postMessage'];
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    record('lifecycle', 'terminate');
    terminate();
  };
}

function captureTransport(
  session: SendContextSession,
  adapter: CraftReplayTransportDefinition,
  instanceId: string,
  sequence: number,
  direction: CraftReplayTransportEvent['direction'],
  messageType: string,
  rawData?: unknown,
  metadata?: Record<string, unknown>,
): void {
  let data: CraftReplayTransportValue | undefined;
  let replayable = true;
  let reason: string | undefined;
  try {
    if (rawData !== undefined) {
      data = adapter.serialize
        ? adapter.serialize(rawData)
        : defaultTransportSerialize(rawData);
      if (!isCraftReplayTransportValue(data))
        throw new Error('Invalid transport codec value');
      data = adapter.redact ? adapter.redact(data) : data;
      if (data && !isCraftReplayTransportValue(data))
        throw new Error('Invalid redacted transport codec value');
      if (!data) {
        replayable = false;
        reason = 'redacted-by-adapter';
      } else if (byteLength(data) > (adapter.maxMessageBytes ?? 1_048_576)) {
        data = undefined;
        replayable = false;
        reason = 'message-too-large';
      }
    }
  } catch {
    replayable = false;
    reason = 'serialization-failed';
  }
  const metadataReplayable = metadata?.['replayable'] !== false;
  if (!metadataReplayable) {
    replayable = false;
    reason = String(metadata?.['reason'] ?? 'unsupported-transfer');
  }
  const {
    replayable: _ignoredReplayable,
    reason: _ignoredReason,
    ...safeMetadata
  } = metadata ?? {};
  let boundedMetadata = safeMetadata;
  if (byteLength({ codec: 'json', value: safeMetadata }) > 8_192) {
    boundedMetadata = {};
    replayable = false;
    reason = 'metadata-too-large';
  }
  const elapsedMs = session.elapsedTime();
  session.capture('transport', 'emitted', {
    name: 'transport-event',
    elapsedMs,
    ...(ɵinjectCorrelationIdService()?.lastCorrelationId()
      ? {
          correlationId:
            ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined,
        }
      : {}),
    payload: {
      transportId: adapter.id,
      transport: adapter.kind,
      instanceId,
      direction,
      messageType,
      sequence,
      elapsedMs,
      ...(data ? { data } : {}),
      replayable,
      ...(reason ? { reason } : {}),
      ...(Object.keys(boundedMetadata).length
        ? { metadata: boundedMetadata }
        : {}),
    } satisfies CraftReplayTransportEvent,
  });
  if (!replayable)
    captureCoverageFailure(
      session,
      adapter.kind,
      reason ?? 'unsupported-transport-data',
    );
}

function defaultTransportSerialize(value: unknown): CraftReplayTransportValue {
  if (typeof value === 'string') return { codec: 'text', value };
  if (value instanceof ArrayBuffer)
    return { codec: 'base64', value: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value))
    return {
      codec: 'base64',
      value: bytesToBase64(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ),
    };
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    value instanceof SharedArrayBuffer
  )
    return { codec: 'base64', value: bytesToBase64(new Uint8Array(value)) };
  if (typeof Blob !== 'undefined' && value instanceof Blob)
    throw new Error('Blob frames require an application-provided serializer.');
  if (!isJsonTransportValue(value, new Set()))
    throw new Error(
      'Non-JSON transport values require an application-provided serializer.',
    );
  return { codec: 'json', value };
}

function isJsonTransportValue(value: unknown, seen: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof SharedArrayBuffer !== 'undefined' &&
      value instanceof SharedArrayBuffer) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  )
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonTransportValue(item, seen))
    : Object.values(value).every((item) => isJsonTransportValue(item, seen));
  seen.delete(value);
  return valid;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)),
    );
  return btoa(binary);
}

function byteLength(value: CraftReplayTransportValue): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function redactTransportUrl(value: string): string {
  try {
    const url = new URL(
      value,
      typeof location === 'undefined' ? 'http://localhost' : location.href,
    );
    url.search = '';
    url.hash = '';
    return url.href.slice(0, 2_048);
  } catch {
    return (value.split(/[?#]/, 1)[0] ?? '').slice(0, 2_048);
  }
}

function redactText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/(?:token|password|secret|authorization)=?[^\s&]*/gi, '[REDACTED]')
    .slice(0, 1_024);
}

function randomTransportId(): string {
  return `transport-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @internal Installs network-free transports backed only by recorded events. */
export function installCraftReplayTransports(
  definitions: readonly CraftReplayTransportDefinition[],
  events: readonly Readonly<{ elapsedMs?: number; payload?: unknown }>[],
  onDivergence: (difference: CraftReplayTransportDifference) => void,
): Readonly<{
  advanceTo(elapsedMs: number): void;
  assertDue(elapsedMs: number): void;
  assertComplete(): void;
  restore(): void;
}> {
  const recorded = events
    .flatMap((event) => {
      if (
        !isRecord(event.payload) ||
        !isCraftReplayTransportEvent(event.payload)
      )
        return [];
      return [{ event, transport: event.payload }];
    })
    .sort((a, b) => a.event.elapsedMs! - b.event.elapsedMs!);
  const instances = new Map<string, ReplayTransportInstance>();
  for (const { event, transport } of recorded) {
    let instance = instances.get(transport.instanceId);
    if (!instance) {
      instance = {
        id: transport.instanceId,
        adapterId: transport.transportId,
        kind: transport.transport,
        events: [],
        cursor: 0,
        outgoingCursor: 0,
        lifecycleCursor: 0,
        createdAt: event.elapsedMs ?? 0,
      };
      instances.set(transport.instanceId, instance);
    }
    instance.events.push({ time: event.elapsedMs ?? 0, transport });
  }
  const definitionsById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  for (const instance of instances.values()) {
    if (!definitionsById.has(instance.adapterId))
      throw new Error(
        `Replay transport adapter is not registered: ${instance.adapterId}`,
      );
  }
  const orderedInstances = [...instances.values()].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const nextInstanceByAdapter = new Map<string, number>();
  let elapsedMs = 0;
  const activeInstances = new Map<string, ReplayTransportEndpoint>();
  const target = globalThis as unknown as Record<string, unknown>;
  const nativeWebSocket = target['WebSocket'];
  const nativeWorker = target['Worker'];

  class ReplayWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readonly url: string;
    readonly protocol = '';
    readonly extensions = '';
    readonly bufferedAmount = 0;
    binaryType: BinaryType = 'blob';
    readyState = 0;
    onopen: ((event: Event) => unknown) | null = null;
    onmessage: ((event: MessageEvent) => unknown) | null = null;
    onerror: ((event: Event) => unknown) | null = null;
    onclose: ((event: CloseEvent) => unknown) | null = null;
    private endpoint: ReplayTransportInstance;
    constructor(url: string) {
      super();
      this.url = url;
      this.endpoint = findNext('websocket', url);
      activeInstances.set(this.endpoint.id, this);
      advanceTo(elapsedMs);
    }
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      if (this.readyState === ReplayWebSocket.CONNECTING)
        throw new DOMException(
          'WebSocket is not open: readyState is CONNECTING.',
          'InvalidStateError',
        );
      if (this.readyState === ReplayWebSocket.CLOSED) return;
      compareOutgoing(this.endpoint, data, definitionsById, onDivergence);
    }
    close(code?: number, reason?: string): void {
      compareLifecycle(
        this.endpoint,
        'close-request',
        {
          ...(code === undefined ? {} : { code }),
          ...(reason === undefined ? {} : { reason: redactText(reason) }),
        },
        onDivergence,
      );
      this.readyState = 2;
    }
    emit(type: string, value?: unknown): void {
      if (type === 'open') this.readyState = 1;
      if (type === 'close') this.readyState = 3;
      const event =
        type === 'message'
          ? new MessageEvent(type, { data: value })
          : type === 'close'
            ? new CloseEvent(
                type,
                isRecord(value)
                  ? {
                      code: Number(value['code'] ?? 1000),
                      reason: String(value['reason'] ?? ''),
                      wasClean: Boolean(value['wasClean']),
                    }
                  : {},
              )
            : new Event(type);
      this.dispatchEvent(event);
      const handler = (
        this as unknown as Record<string, ((event: Event) => unknown) | null>
      )[`on${type}`];
      handler?.(event);
    }
  }

  class ReplayWorker extends EventTarget {
    onmessage: ((event: MessageEvent) => unknown) | null = null;
    onmessageerror: ((event: MessageEvent) => unknown) | null = null;
    onerror: ((event: ErrorEvent) => unknown) | null = null;
    private endpoint: ReplayTransportInstance;
    private terminated = false;
    constructor(url: string) {
      super();
      this.endpoint = findNext('worker', url);
      activeInstances.set(this.endpoint.id, this);
      advanceTo(elapsedMs);
    }
    postMessage(message: unknown, transfer?: Transferable[]): void {
      if (transfer?.length)
        return diverge(
          this.endpoint,
          'outgoing',
          'transfer-detachment-unsupported',
          'transfer-list',
          onDivergence,
        );
      compareOutgoing(this.endpoint, message, definitionsById, onDivergence);
    }
    terminate(): void {
      compareLifecycle(this.endpoint, 'terminate', undefined, onDivergence);
      this.terminated = true;
    }
    emit(type: string, value?: unknown): void {
      if (this.terminated) return;
      const decoded = value;
      const event =
        type === 'message' || type === 'messageerror'
          ? new MessageEvent(type, { data: decoded })
          : new ErrorEvent(type, {
              message: isRecord(value) ? String(value['message'] ?? '') : '',
            });
      this.dispatchEvent(event);
      const handler = (
        this as unknown as Record<string, ((event: Event) => unknown) | null>
      )[`on${type}`];
      handler?.(event);
    }
  }

  if (isConstructor(nativeWebSocket))
    Object.setPrototypeOf(ReplayWebSocket.prototype, nativeWebSocket.prototype);
  if (isConstructor(nativeWorker))
    Object.setPrototypeOf(ReplayWorker.prototype, nativeWorker.prototype);

  function findNext(
    kind: 'websocket' | 'worker',
    url: string,
  ): ReplayTransportInstance {
    const adapter = definitions.find(
      (entry) => entry.kind === kind && safeMatch(entry, url),
    );
    const counterKey = `${kind}:${adapter?.id ?? 'unmatched'}`;
    const index = nextInstanceByAdapter.get(counterKey) ?? 0;
    nextInstanceByAdapter.set(counterKey, index + 1);
    const instance = orderedInstances.filter(
      (entry) => entry.kind === kind && entry.adapterId === adapter?.id,
    )[indexForAdapter(orderedInstances, adapter?.id, kind, index)];
    if (!adapter || !instance || instance.adapterId !== adapter.id) {
      const synthetic: ReplayTransportInstance = {
        id: randomTransportId(),
        adapterId: `network:${kind}`,
        kind,
        events: [],
        cursor: 0,
        outgoingCursor: 0,
        lifecycleCursor: 0,
        createdAt: elapsedMs,
        blocked: true,
      };
      onDivergence({
        transportId: synthetic.adapterId,
        instanceId: synthetic.id,
        direction: 'outgoing',
        sequence: 1,
        expected: '[no recorded transport]',
        observed: '[blocked]',
        message: `Replay blocked an unmatched ${kind} transport.`,
      });
      return synthetic;
    }
    return instance;
  }
  const WrappedWebSocket = new Proxy(
    (nativeWebSocket ?? class {}) as new (...args: never[]) => unknown,
    {
      construct: (_target, args) => new ReplayWebSocket(String(args[0] ?? '')),
    },
  );
  const WrappedWorker = new Proxy(
    (nativeWorker ?? class {}) as new (...args: never[]) => unknown,
    {
      construct: (_target, args) => new ReplayWorker(String(args[0] ?? '')),
    },
  );
  target['WebSocket'] = WrappedWebSocket;
  target['Worker'] = WrappedWorker;
  const networkRestores = installReplayNetworkGuards(
    target,
    definitions,
    orderedInstances,
    onDivergence,
  );

  const advanceTo = (nextElapsedMs: number) => {
    elapsedMs = Math.max(elapsedMs, nextElapsedMs);
    for (const instance of orderedInstances) {
      const endpoint = activeInstances.get(instance.id) as
        | ReplayWebSocket
        | ReplayWorker
        | undefined;
      if (instance.blocked) continue;
      while (
        instance.cursor < instance.events.length &&
        instance.events[instance.cursor]!.time <= elapsedMs
      ) {
        const entry = instance.events[instance.cursor++]!;
        const { transport } = entry;
        if (instance.kind === 'custom') {
          const adapter = definitionsById.get(instance.adapterId);
          if (adapter?.replay) {
            const context: CraftReplayTransportHookContext = {
              id: instance.id,
              url: String(transport.metadata?.['url'] ?? ''),
              direction: transport.direction,
              messageType: transport.messageType,
              ...(transport.data
                ? { data: decodeForAdapter(adapter, transport.data) }
                : {}),
              elapsedMs: entry.time,
            };
            try {
              adapter.replay(context);
            } catch {
              onDivergence({
                transportId: `network:${instance.kind}`,
                instanceId: instance.id,
                direction: 'outgoing',
                sequence: transport.sequence,
                expected: '[adapter replay hook]',
                observed: '[hook failed]',
                message: `Replay adapter ${adapter.id} failed.`,
              });
            }
          }
          continue;
        }
        if (!endpoint) continue;
        if (
          transport.direction !== 'outgoing' &&
          transport.messageType !== 'created' &&
          transport.messageType !== 'terminate' &&
          transport.messageType !== 'close-request'
        ) {
          const data = transport.data
            ? decodeForAdapter(
                definitionsById.get(instance.adapterId)!,
                transport.data,
              )
            : undefined;
          const value =
            instance.kind === 'websocket' && transport.messageType === 'close'
              ? transport.metadata
              : instance.kind === 'worker' && transport.messageType === 'error'
                ? transport.metadata
                : data;
          // Let the caller install onmessage/addEventListener handlers before
          // events whose virtual deadline passed during construction arrive.
          queueMicrotask(() => {
            if (instance.blocked || !activeInstances.has(instance.id)) return;
            if (instance.kind === 'websocket')
              (endpoint as ReplayWebSocket).emit(transport.messageType, value);
            else (endpoint as ReplayWorker).emit(transport.messageType, value);
          });
        }
      }
    }
  };
  return {
    advanceTo,
    assertDue(dueTimeMs) {
      for (const instance of orderedInstances) {
        if (instance.blocked) continue;
        const outgoing = instance.events.filter(
          (entry) => entry.transport.direction === 'outgoing',
        );
        const nextOutgoing = outgoing[instance.outgoingCursor];
        if (nextOutgoing && nextOutgoing.time <= dueTimeMs) {
          diverge(
            instance,
            'outgoing',
            nextOutgoing.transport.messageType,
            '[missing]',
            onDivergence,
            nextOutgoing.transport.data,
          );
        }
        const lifecycle = instance.events.filter(
          (entry) =>
            entry.transport.direction === 'lifecycle' &&
            (entry.transport.messageType === 'terminate' ||
              entry.transport.messageType === 'close-request'),
        );
        const nextLifecycle = lifecycle[instance.lifecycleCursor];
        if (nextLifecycle && nextLifecycle.time <= dueTimeMs) {
          diverge(
            instance,
            'outgoing',
            nextLifecycle.transport.messageType,
            '[missing]',
            onDivergence,
            nextLifecycle.transport.metadata ??
              nextLifecycle.transport.messageType,
          );
        }
      }
    },
    assertComplete() {
      this.assertDue(Number.POSITIVE_INFINITY);
    },
    restore() {
      for (const restore of networkRestores.reverse()) restore();
      if (target['WebSocket'] === WrappedWebSocket)
        target['WebSocket'] = nativeWebSocket;
      if (target['Worker'] === WrappedWorker) target['Worker'] = nativeWorker;
      activeInstances.clear();
    },
  };
}

function installReplayNetworkGuards(
  target: Record<string, unknown>,
  definitions: readonly CraftReplayTransportDefinition[],
  instances: readonly ReplayTransportInstance[],
  onDivergence: (difference: CraftReplayTransportDifference) => void,
): Array<() => void> {
  const restores: Array<() => void> = [];
  let sequence = 0;
  const consumed = new Map<string, number>();
  const blocked = (api: string): Error => {
    const difference: CraftReplayTransportDifference = {
      transportId: `network:${api}`,
      instanceId: `unmatched-${++sequence}`,
      direction: 'outgoing',
      sequence,
      expected: '[recorded response or adapter]',
      observed: '[blocked before network]',
      message: `Replay blocked an unmatched ${api} call; no live network request was sent.`,
    };
    onDivergence(difference);
    return new Error(difference.message);
  };
  const replace = (
    object: Record<string, unknown>,
    key: string,
    value: unknown,
  ) => {
    const original = object[key];
    if (typeof original !== 'function') return;
    const ownDescriptor = Object.getOwnPropertyDescriptor(object, key);
    try {
      Object.defineProperty(object, key, {
        configurable: true,
        writable: true,
        value,
      });
    } catch {
      return;
    }
    restores.push(() => {
      if (object[key] !== value) return;
      if (ownDescriptor) Object.defineProperty(object, key, ownDescriptor);
      else delete object[key];
    });
    return original as (...args: unknown[]) => unknown;
  };
  const nativeFetch = target['fetch'];
  if (typeof nativeFetch === 'function')
    replace(
      target,
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        let request: Request;
        try {
          request = new Request(input, init);
        } catch {
          throw blocked('fetch');
        }
        const adapter = findMatching(
          definitions.filter((item) => item.kind === 'fetch'),
          request.url,
        );
        const instance = adapter
          ? takeInstance('fetch', adapter, request.url)
          : undefined;
        const responseEvent = instance?.events.find(
          (entry) =>
            entry.transport.direction === 'incoming' &&
            entry.transport.messageType === 'response',
        );
        if (!adapter || !instance || !responseEvent) throw blocked('fetch');
        const stored = responseEvent.transport.data
          ? decodeForAdapter(adapter, responseEvent.transport.data)
          : undefined;
        try {
          const result = await adapter.replay?.({
            id: instance.id,
            url: request.url,
            direction: 'incoming',
            messageType: 'response',
            data: stored,
            elapsedMs: responseEvent.time,
          });
          if (result instanceof Response) return result;
          if (isRecord(result) && typeof result['body'] === 'string')
            return new Response(result['body'], {
              status:
                typeof result['status'] === 'number' ? result['status'] : 200,
              statusText:
                typeof result['statusText'] === 'string'
                  ? result['statusText']
                  : '',
              headers: isRecord(result['headers'])
                ? (result['headers'] as HeadersInit)
                : undefined,
            });
        } catch {
          /* The adapter failure is reported below. */
        }
        throw blocked('fetch');
      },
    );
  const xhr = target['XMLHttpRequest'];
  const xhrPrototype =
    typeof xhr === 'function'
      ? (xhr as { prototype?: Record<string, unknown> }).prototype
      : undefined;
  if (xhrPrototype) {
    const nativeOpen = xhrPrototype['open'];
    if (typeof nativeOpen === 'function')
      replace(
        xhrPrototype,
        'open',
        function (this: XMLHttpRequest, ...args: unknown[]) {
          const xhr = this as XMLHttpRequest & {
            __craftReplayUrl?: string;
            __craftReplayMethod?: string;
          };
          xhr.__craftReplayMethod = String(args[0] ?? 'GET');
          xhr.__craftReplayUrl = String(args[1] ?? '');
          return Reflect.apply(nativeOpen, this, args);
        },
      );
    replace(
      xhrPrototype,
      'send',
      function (this: XMLHttpRequest, ...args: unknown[]) {
        const xhr = this as XMLHttpRequest & {
          __craftReplayUrl?: string;
          __craftReplayMethod?: string;
        };
        const url = xhr.__craftReplayUrl ?? '';
        const adapter = findMatching(
          definitions.filter((item) => item.kind === 'xhr'),
          url,
        );
        const instance = adapter
          ? takeInstance('xhr', adapter, url)
          : undefined;
        const responseEvent = instance?.events.find(
          (entry) =>
            entry.transport.direction === 'incoming' &&
            entry.transport.messageType === 'response',
        );
        if (!adapter || !instance || !responseEvent) throw blocked('xhr');
        const stored = responseEvent.transport.data
          ? decodeForAdapter(adapter, responseEvent.transport.data)
          : undefined;
        Promise.resolve(
          adapter.replay?.({
            id: instance.id,
            url,
            direction: 'incoming',
            messageType: 'response',
            data: stored,
            elapsedMs: responseEvent.time,
          }),
        )
          .then((result) => {
            const value: Record<string, unknown> = isRecord(result)
              ? result
              : isRecord(stored)
                ? stored
                : {};
            const complete = (
              responseText: string,
              status: number,
              statusText: string,
            ) => {
              try {
                Object.defineProperties(xhr, {
                  status: { configurable: true, value: status },
                  statusText: { configurable: true, value: statusText },
                  responseText: { configurable: true, value: responseText },
                  response: { configurable: true, value: responseText },
                  readyState: { configurable: true, value: 4 },
                });
              } catch {
                /* Browser-native readonly fields vary by engine. */
              }
              xhr.dispatchEvent(new Event('readystatechange'));
              xhr.dispatchEvent(new Event('load'));
              xhr.dispatchEvent(new Event('loadend'));
            };
            if (result instanceof Response)
              void result
                .text()
                .then((body) =>
                  complete(body, result.status, result.statusText),
                );
            else
              complete(
                String(value['body'] ?? ''),
                Number(value['status'] ?? 200),
                String(value['statusText'] ?? ''),
              );
          })
          .catch(() => {
            onDivergence(blockedDifference('xhr'));
          });
      },
    );
  }
  const navigator = target['navigator'] as Record<string, unknown> | undefined;
  if (navigator && typeof navigator['sendBeacon'] === 'function')
    replace(navigator, 'sendBeacon', (rawUrl: string | URL) => {
      const url = String(rawUrl);
      const adapter = findMatching(
        definitions.filter((item) => item.kind === 'sendbeacon'),
        url,
      );
      const instance = adapter
        ? takeInstance('sendbeacon', adapter, url)
        : undefined;
      const outgoing = instance?.events.find(
        (entry) => entry.transport.direction === 'outgoing',
      );
      if (!adapter || !instance || !outgoing) {
        blocked('sendBeacon');
        return false;
      }
      try {
        return (
          adapter.replay?.({
            id: instance.id,
            url,
            direction: 'outgoing',
            messageType: outgoing.transport.messageType,
            data: outgoing.transport.data
              ? decodeForAdapter(adapter, outgoing.transport.data)
              : undefined,
            elapsedMs: outgoing.time,
          }) === true
        );
      } catch {
        blocked('sendBeacon');
        return false;
      }
    });
  for (const api of ['EventSource', 'WebTransport'] as const) {
    const Native = target[api];
    if (typeof Native !== 'function') continue;
    const Guard = new Proxy(Native as new (...args: unknown[]) => object, {
      construct(_original, args) {
        const url = String(args[0] ?? '');
        const kind = api === 'EventSource' ? 'eventsource' : 'webtransport';
        const adapter = findMatching(
          definitions.filter((item) => item.kind === kind),
          url,
        );
        const instance = adapter ? takeInstance(kind, adapter, url) : undefined;
        if (!adapter || !instance) throw blocked(kind);
        if (api === 'EventSource') {
          const endpoint = new EventTarget() as EventTarget & {
            url: string;
            readyState: number;
            close(): void;
            onmessage: ((event: MessageEvent) => unknown) | null;
            onerror: ((event: Event) => unknown) | null;
          };
          endpoint.url = url;
          endpoint.readyState = 1;
          endpoint.onmessage = null;
          endpoint.onerror = null;
          endpoint.close = () => {
            endpoint.readyState = 2;
          };
          for (const event of instance.events.filter(
            (entry) =>
              entry.transport.direction === 'incoming' ||
              (entry.transport.direction === 'lifecycle' &&
                entry.transport.messageType === 'error'),
          ))
            queueMicrotask(async () => {
              const data = event.transport.data
                ? decodeForAdapter(adapter, event.transport.data)
                : undefined;
              let replayed: unknown;
              try {
                replayed = await adapter.replay?.({
                  id: instance.id,
                  url,
                  direction: event.transport.direction,
                  messageType: event.transport.messageType,
                  data,
                  elapsedMs: event.time,
                });
              } catch {
                onDivergence(blockedDifference(kind));
                return;
              }
              if (event.transport.messageType === 'error') {
                const error = new Event('error');
                endpoint.dispatchEvent(error);
                endpoint.onerror?.(error);
                return;
              }
              const message =
                replayed instanceof MessageEvent
                  ? replayed
                  : new MessageEvent('message', { data: replayed ?? data });
              endpoint.dispatchEvent(message);
              endpoint.onmessage?.(message);
            });
          return endpoint;
        }
        const lifecycle = instance.events.find(
          (entry) => entry.transport.messageType === 'created',
        );
        try {
          return (
            adapter.replay?.({
              id: instance.id,
              url,
              direction: 'lifecycle',
              messageType: 'created',
              elapsedMs: lifecycle?.time ?? 0,
            }) ??
            (() => {
              throw blocked(kind);
            })()
          );
        } catch {
          throw blocked(kind);
        }
      },
    });
    target[api] = Guard;
    restores.push(() => {
      if (target[api] === Guard) target[api] = Native;
    });
  }
  function takeInstance(
    kind: CraftReplayTransportKind,
    adapter: CraftReplayTransportDefinition,
    _url: string,
  ): ReplayTransportInstance | undefined {
    const key = `${kind}:${adapter.id}`;
    const index = consumed.get(key) ?? 0;
    consumed.set(key, index + 1);
    return instances.filter(
      (entry) => entry.kind === kind && entry.adapterId === adapter.id,
    )[index];
  }
  function blockedDifference(api: string): CraftReplayTransportDifference {
    return {
      transportId: `network:${api}`,
      instanceId: `unmatched-${sequence}`,
      direction: 'outgoing',
      sequence,
      expected: '[recorded response or adapter]',
      observed: '[blocked before network]',
      message: `Replay blocked an unmatched ${api} call; no live network request was sent.`,
    };
  }
  return restores;
}

export type CraftReplayTransportDifference = Readonly<{
  transportId: string;
  instanceId: string;
  direction: 'outgoing';
  sequence: number;
  expected: unknown;
  observed: unknown;
  message: string;
}>;
type ReplayTransportInstance = {
  id: string;
  adapterId: string;
  kind: CraftReplayTransportKind;
  events: Array<{ time: number; transport: CraftReplayTransportEvent }>;
  cursor: number;
  outgoingCursor: number;
  lifecycleCursor: number;
  createdAt: number;
  blocked?: boolean;
};
type ReplayTransportEndpoint = EventTarget;

function safeMatch(
  adapter: CraftReplayTransportDefinition,
  url: string,
): boolean {
  try {
    return adapter.match(url);
  } catch {
    return false;
  }
}

function indexForAdapter(
  instances: ReplayTransportInstance[],
  adapterId: string | undefined,
  kind: CraftReplayTransportKind,
  index: number,
): number {
  return (
    instances
      .map((value, position) => ({ value, position }))
      .filter(
        ({ value }) => value.kind === kind && value.adapterId === adapterId,
      )[index]?.position ?? -1
  );
}
function compareOutgoing(
  instance: ReplayTransportInstance,
  raw: unknown,
  definitions: Map<string, CraftReplayTransportDefinition>,
  onDivergence: (difference: CraftReplayTransportDifference) => void,
): void {
  const expectedEntry = instance.events.filter(
    (entry) => entry.transport.direction === 'outgoing',
  )[instance.outgoingCursor++];
  const adapter = definitions.get(instance.adapterId)!;
  let observed: CraftReplayTransportValue | undefined;
  try {
    observed = adapter.redact
      ? adapter.redact(
          adapter.serialize
            ? adapter.serialize(raw)
            : defaultTransportSerialize(raw),
        )
      : adapter.serialize
        ? adapter.serialize(raw)
        : defaultTransportSerialize(raw);
  } catch {
    observed = undefined;
  }
  const expected = expectedEntry?.transport.data;
  if (
    !expectedEntry ||
    !expectedEntry.transport.replayable ||
    !sameTransportValue(expected, observed)
  )
    diverge(
      instance,
      'outgoing',
      expectedEntry?.transport.messageType ?? 'unexpected-message',
      observed ?? '[unserializable]',
      onDivergence,
      expected,
    );
}

function compareLifecycle(
  instance: ReplayTransportInstance,
  messageType: string,
  observed: unknown,
  onDivergence: (difference: CraftReplayTransportDifference) => void,
): void {
  const expectedEvents = instance.events.filter(
    (entry) =>
      entry.transport.direction === 'lifecycle' &&
      (entry.transport.messageType === 'terminate' ||
        entry.transport.messageType === 'close-request'),
  );
  const expectedEntry = expectedEvents[instance.lifecycleCursor++];
  const expected = expectedEntry?.transport;
  const comparableObserved =
    isRecord(expected?.metadata) && isRecord(observed)
      ? Object.fromEntries(
          Object.keys(expected.metadata).flatMap((key) =>
            key in observed ? [[key, observed[key]]] : [],
          ),
        )
      : observed;
  if (
    !expected ||
    expected.messageType !== messageType ||
    (expected.metadata &&
      !sameTransportValue(expected.metadata, comparableObserved ?? {}))
  ) {
    diverge(
      instance,
      'outgoing',
      messageType,
      observed ?? '[none]',
      onDivergence,
      expected?.metadata ?? expected?.messageType,
    );
  }
}
function diverge(
  instance: ReplayTransportInstance,
  direction: 'outgoing',
  messageType: string,
  observed: unknown,
  onDivergence: (difference: CraftReplayTransportDifference) => void,
  expected?: unknown,
): void {
  const sequence =
    instance.events.filter((entry) => entry.transport.direction === 'outgoing')[
      instance.outgoingCursor - 1
    ]?.transport.sequence ?? instance.outgoingCursor;
  const difference = {
    transportId: instance.adapterId,
    instanceId: instance.id,
    direction,
    sequence,
    expected,
    observed,
    message: `Replay transport ${instance.adapterId} diverged at ${instance.id} sequence ${sequence} (${messageType}).`,
  } as const;
  instance.blocked = true;
  onDivergence(difference);
}
function sameTransportValue(expected: unknown, actual: unknown): boolean {
  if (
    expected === '[REDACTED]' ||
    expected === '[REDACTED_EMAIL]' ||
    expected === '[Circular]'
  )
    return true;
  try {
    return JSON.stringify(expected) === JSON.stringify(actual);
  } catch {
    return false;
  }
}
function decodeTransportValue(value: CraftReplayTransportValue): unknown {
  if (value.codec === 'text' || value.codec === 'json') return value.value;
  const binary = atob(value.value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function decodeForAdapter(
  adapter: CraftReplayTransportDefinition,
  value: CraftReplayTransportValue,
): unknown {
  return adapter.deserialize
    ? adapter.deserialize(value)
    : decodeTransportValue(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConstructor(
  value: unknown,
): value is new (...args: unknown[]) => object {
  return typeof value === 'function' && 'prototype' in value;
}
