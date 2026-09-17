import type { SnapshotReport } from './take-app-snapshot';
import {
  inject,
  type Provider,
  type Signal,
} from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';
import { BehaviorSubject, type Observable } from 'rxjs';
import { provideCraftDomEventHook } from './dom-event-hook';
import {
  provideCraftHttpTrace,
  type CraftHttpTraceContext,
} from './craft-http-trace';
import {
  provideCraftRouterTrace,
  type CraftRouterTraceContext,
} from './craft-router-trace';
import {
  providePrimitiveResourceRuntimeObserver,
  type PrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';
import { ɵinjectAppSnapshotRegistry } from './take-app-snapshot';
import { ɵinjectCorrelationIdService } from './correlation-id';

export interface SendContextPayload {
  hostName: string;
  tagList: unknown;
  coords: { x: number; y: number };
  readonly clickedElement?: {
    tagName: string;
    textContent: string;
    outerHTML: string;
  };
  readonly targets?: readonly SendContextTarget[];
  outerHTML: string;
  snapshot: SnapshotReport[];
}

export type SendContextEventPhase =
  | 'started'
  | 'emitted'
  | 'succeeded'
  | 'failed';

export type SendContextEventKind =
  | 'dom'
  | 'http'
  | 'navigation'
  | 'primitive'
  | 'snapshot'
  | 'custom'
  | (string & {});

export interface SendContextTarget {
  readonly tagName: string;
  readonly textContent?: string;
  readonly outerHTML?: string;
  readonly selector?: string;
}

export interface SendContextEvent {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly kind: SendContextEventKind;
  readonly phase: SendContextEventPhase;
  readonly name?: string;
  readonly operationId?: string;
  readonly correlationId?: string;
  readonly payload?: unknown;
  readonly response?: unknown;
  readonly state?: unknown;
  readonly targets?: readonly SendContextTarget[];
  readonly source?: string;
}

export interface SendContextClip {
  readonly id: string;
  readonly label: string;
  readonly startedAt: number;
  readonly stoppedAt?: number;
  readonly eventIds: readonly string[];
  readonly truncated: boolean;
}

export interface SendContextRetentionPolicy {
  readonly maxEvents: number;
  readonly maxBytes?: number;
}

export interface SendContextValueContext {
  readonly kind: SendContextEventKind;
  readonly phase: SendContextEventPhase;
  readonly field: 'payload' | 'response' | 'state';
}

export type SendContextRedactor = (
  value: unknown,
  context: SendContextValueContext,
) => unknown;
export type SendContextValueSerializer = (
  value: unknown,
  context: SendContextValueContext,
) => unknown;

export interface SendContextEventSourceDefinition {
  readonly name?: string;
  readonly connect: (session: SendContextSession) => void | (() => void);
}
export type SendContextEventSource =
  | SendContextEventSourceDefinition
  | ((session: SendContextSession) => void | (() => void));

export type SendContextEventEnricher = (
  event: Omit<SendContextEvent, 'id' | 'sequence' | 'timestamp'>,
) => Omit<SendContextEvent, 'id' | 'sequence' | 'timestamp'>;
export type SendContextEventFilter = (
  event: Omit<SendContextEvent, 'id' | 'sequence' | 'timestamp'>,
) => boolean;

export interface SendContextSessionSnapshot {
  readonly events: readonly SendContextEvent[];
  readonly clips: readonly SendContextClip[];
  readonly activeClipId?: string;
}

export interface SendContextSession {
  readonly events$: Observable<readonly SendContextEvent[]>;
  readonly snapshot$: Observable<SendContextSessionSnapshot>;
  readonly eventSignal?: Signal<readonly SendContextEvent[]>;
  readonly clipsSignal?: Signal<readonly SendContextClip[]>;
  readonly events: readonly SendContextEvent[];
  readonly clips: readonly SendContextClip[];
  readonly activeClip: SendContextClip | undefined;
  emit(
    event: Omit<SendContextEvent, 'id' | 'sequence' | 'timestamp'>,
  ): SendContextEvent | undefined;
  capture(
    kind: SendContextEventKind,
    phase: SendContextEventPhase,
    details?: Omit<
      SendContextEvent,
      'id' | 'sequence' | 'timestamp' | 'kind' | 'phase'
    >,
  ): SendContextEvent | undefined;
  startRecord(label?: string): SendContextClip;
  stopRecord(): SendContextClip | undefined;
  selectClip(id: string | undefined): SendContextClip | undefined;
  clear(): void;
  exportJson(clipId?: string): string;
  exportSummary(clipId?: string): string;
  destroy(): void;
}

export interface SendContextRecordController {
  readonly clips$: Observable<readonly SendContextClip[]>;
  readonly clips: readonly SendContextClip[];
  startRecord(label?: string): SendContextClip;
  stopRecord(): SendContextClip | undefined;
  selectClip(id: string | undefined): SendContextClip | undefined;
  exportSummary(clipId?: string): string;
  exportJson(clipId?: string): string;
}

type SendContextHelper<T> = () => Generator<unknown, T, unknown>;
type SendContextService<T> = {
  helper: SendContextHelper<T>;
  provide?: (value?: T | (() => T)) => unknown;
  metadata: { inject(): T };
};

function asSendContextService<T>(
  service: unknown,
  helperName: string,
  provideName: string,
  metadataName: string,
): SendContextService<T> {
  const api = service as Record<string, unknown>;
  return {
    helper: api[helperName] as SendContextHelper<T>,
    provide: api[provideName] as SendContextService<T>['provide'],
    metadata: api[metadataName] as SendContextService<T>['metadata'],
  };
}

const sendContextRetentionPolicyService = craftService(
  { name: 'SendContextRetentionPolicy', providedIn: 'toProvide' },
  () => ({ maxEvents: 500, maxBytes: 2 * 1024 * 1024 }),
);
const sendContextRedactorService = craftService(
  { name: 'SendContextRedactor', providedIn: 'toProvide' },
  () => defaultSendContextRedactor,
);
const sendContextValueSerializerService = craftService(
  { name: 'SendContextValueSerializer', providedIn: 'toProvide' },
  () => defaultSendContextValueSerializer,
);
const sendContextEventSourceService = craftService(
  { name: 'SendContextEventSources', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextEventSource }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const sendContextEventEnricherService = craftService(
  { name: 'SendContextEventEnrichers', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextEventEnricher }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const sendContextEventFilterService = craftService(
  { name: 'SendContextEventFilters', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: SendContextEventFilter }) =>
    inputs.$provided ? [inputs.$provided] : [],
);

const sendContextSessionService = craftService(
  { name: 'SendContextSession', providedIn: 'toProvide' },
  function* () {
    const session = createSendContextSession({
      retentionPolicy: yield* SendContextRetentionPolicy(),
      redactor: yield* SendContextRedactor(),
      serializer: yield* SendContextValueSerializer(),
      enrichers: yield* SendContextEventEnrichers(),
      filters: yield* SendContextEventFilters(),
    });
    const snapshots = ɵinjectAppSnapshotRegistry();
    const snapshotSubscription = snapshots.allSnapShot$.subscribe((report) => {
      session.capture('snapshot', 'emitted', {
        name: report.source,
        state: report,
      });
    });
    (session as SendContextSessionWithInternals).addCleanup(() =>
      snapshotSubscription.unsubscribe(),
    );
    for (const source of yield* SendContextEventSources()) {
      const cleanup =
        typeof source === 'function' ? source(session) : source.connect(session);
      if (cleanup) (session as SendContextSessionWithInternals).addCleanup(cleanup);
    }
    return session;
  },
);
const sendContextRecordControllerService = craftService(
  { name: 'SendContextRecordController', providedIn: 'toProvide' },
  function* () {
    return createSendContextRecordController(yield* SendContextSession());
  },
);

const retention = asSendContextService<SendContextRetentionPolicy>(
  sendContextRetentionPolicyService,
  'SendContextRetentionPolicy',
  'provideSendContextRetentionPolicy',
  'SEND_CONTEXT_RETENTION_POLICY_META_DATA',
);
const redactor = asSendContextService<SendContextRedactor>(
  sendContextRedactorService,
  'SendContextRedactor',
  'provideSendContextRedactor',
  'SEND_CONTEXT_REDACTOR_META_DATA',
);
const serializer = asSendContextService<SendContextValueSerializer>(
  sendContextValueSerializerService,
  'SendContextValueSerializer',
  'provideSendContextValueSerializer',
  'SEND_CONTEXT_VALUE_SERIALIZER_META_DATA',
);
const sources = asSendContextService<readonly SendContextEventSource[]>(
  sendContextEventSourceService,
  'SendContextEventSources',
  'provideSendContextEventSources',
  'SEND_CONTEXT_EVENT_SOURCES_META_DATA',
);
const enrichers = asSendContextService<readonly SendContextEventEnricher[]>(
  sendContextEventEnricherService,
  'SendContextEventEnrichers',
  'provideSendContextEventEnrichers',
  'SEND_CONTEXT_EVENT_ENRICHERS_META_DATA',
);
const filters = asSendContextService<readonly SendContextEventFilter[]>(
  sendContextEventFilterService,
  'SendContextEventFilters',
  'provideSendContextEventFilters',
  'SEND_CONTEXT_EVENT_FILTERS_META_DATA',
);
const session = asSendContextService<SendContextSession>(
  sendContextSessionService,
  'SendContextSession',
  'provideSendContextSession',
  'SEND_CONTEXT_SESSION_META_DATA',
);
const recordController = asSendContextService<SendContextRecordController>(
  sendContextRecordControllerService,
  'SendContextRecordController',
  'provideSendContextRecordController',
  'SEND_CONTEXT_RECORD_CONTROLLER_META_DATA',
);

export const SendContextRetentionPolicy = retention.helper;
export const provideSendContextRetentionPolicy = (
  value: SendContextRetentionPolicy,
): CraftServiceProvider => retention.provide!(value) as CraftServiceProvider;
export const ɵinjectSendContextRetentionPolicy = (): SendContextRetentionPolicy =>
  retention.metadata.inject();
export const SendContextRedactor = redactor.helper;
export const provideSendContextRedactor = (
  value: SendContextRedactor,
): CraftServiceProvider => redactor.provide!(value) as CraftServiceProvider;
export const ɵinjectSendContextRedactor = (): SendContextRedactor => redactor.metadata.inject();
export const SendContextValueSerializer = serializer.helper;
export const provideSendContextValueSerializer = (
  value: SendContextValueSerializer,
): CraftServiceProvider =>
  serializer.provide!(value) as CraftServiceProvider;
export const ɵinjectSendContextValueSerializer = (): SendContextValueSerializer => serializer.metadata.inject();
export const SendContextEventSources = sources.helper;
export const ɵinjectSendContextEventSources = (): readonly SendContextEventSource[] => {
  try { return sources.metadata.inject(); } catch { return []; }
};
export const SendContextEventEnrichers = enrichers.helper;
export const ɵinjectSendContextEventEnrichers = (): readonly SendContextEventEnricher[] => {
  try { return enrichers.metadata.inject(); } catch { return []; }
};
export const SendContextEventFilters = filters.helper;
export const ɵinjectSendContextEventFilters = (): readonly SendContextEventFilter[] => {
  try { return filters.metadata.inject(); } catch { return []; }
};
export const SendContextSession = session.helper;
export const ɵinjectSendContextSession = (): SendContextSession | null => {
  try { return session.metadata.inject(); } catch { return null; }
};
export const SendContextRecordController = recordController.helper;
export const ɵinjectSendContextRecordController = (): SendContextRecordController | null => {
  try { return recordController.metadata.inject(); } catch { return null; }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function defaultSendContextRedactor(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (current instanceof Error || current instanceof Date) return current;
    if (Array.isArray(current)) {
      if (seen.has(current)) return '[Circular]';
      seen.add(current);
      return current.map(visit);
    }
    if (!isRecord(current)) return current;
    if (seen.has(current)) return '[Circular]';
    seen.add(current);
    return Object.fromEntries(
      Object.entries(current).map(([key, entry]) =>
        /password|passwd|secret|token|authorization|cookie/i.test(key)
          ? [key, '[REDACTED]']
          : [key, visit(entry)],
      ),
    );
  };
  return visit(value);
}

export function defaultSendContextValueSerializer(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (typeof current === 'bigint') return `${current}n`;
    if (current instanceof Date) return current.toISOString();
    if (current instanceof Error) {
      return {
        name: current.name,
        message: current.message,
        stack: current.stack,
      };
    }
    if (typeof current === 'function')
      return `[Function ${current.name || 'anonymous'}]`;
    if (!isRecord(current) && !Array.isArray(current)) return current;
    if (seen.has(current)) return '[Circular]';
    seen.add(current);
    if (Array.isArray(current)) return current.map(visit);
    return Object.fromEntries(
      Object.entries(current).map(([key, entry]) => [key, visit(entry)]),
    );
  };
  return visit(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return '"[unserializable]"';
  }
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSendContextSession(
  options: {
    readonly retentionPolicy?: SendContextRetentionPolicy;
    readonly redactor?: SendContextRedactor;
    readonly serializer?: SendContextValueSerializer;
    readonly enrichers?: readonly SendContextEventEnricher[];
    readonly filters?: readonly SendContextEventFilter[];
  } = {},
): SendContextSession {
  const retention = options.retentionPolicy ?? { maxEvents: 500 };
  const redactor = options.redactor ?? defaultSendContextRedactor;
  const serializer = options.serializer ?? defaultSendContextValueSerializer;
  const enrichers = options.enrichers ?? [];
  const filters = options.filters ?? [];
  let eventList: SendContextEvent[] = [];
  let clipList: SendContextClip[] = [];
  let sequence = 0;
  let activeClipId: string | undefined;
  const eventsSubject = new BehaviorSubject<readonly SendContextEvent[]>([]);
  const snapshotSubject = new BehaviorSubject<SendContextSessionSnapshot>({
    events: [],
    clips: [],
  });
  const cleanups: Array<() => void> = [];

  const publish = (): void => {
    eventsSubject.next(eventList);
    snapshotSubject.next({
      events: eventList,
      clips: clipList,
      ...(activeClipId ? { activeClipId } : {}),
    });
  };
  const serializeField = (
    value: unknown,
    context: SendContextValueContext,
  ): unknown => {
    try {
      return serializer(redactor(value, context), context);
    } catch (error) {
      return {
        '[capture-error]':
          error instanceof Error ? error.message : String(error),
      };
    }
  };
  const trim = (): void => {
    const maxEvents = Math.max(0, retention.maxEvents);
    const maxBytes = retention.maxBytes;
    while (
      eventList.length > maxEvents ||
      (maxBytes !== undefined && safeJson(eventList).length > maxBytes)
    ) {
      const removed = eventList.shift();
      if (!removed) break;
      clipList = clipList.map((clip) =>
        clip.eventIds.includes(removed.id)
          ? {
              ...clip,
              eventIds: clip.eventIds.filter((id) => id !== removed.id),
              truncated: true,
            }
          : clip,
      );
    }
  };

  const session: SendContextSession = {
    events$: eventsSubject.asObservable(),
    snapshot$: snapshotSubject.asObservable(),
    get events() {
      return eventList;
    },
    get clips() {
      return clipList;
    },
    get activeClip() {
      return clipList.find((clip) => clip.id === activeClipId);
    },
    emit(event) {
      let enriched = event;
      for (const enrich of enrichers) {
        try {
          enriched = enrich(enriched);
        } catch {
          // Instrumentation must never break the application flow.
        }
      }
      if (
        filters.some((filter) => {
          try {
            return !filter(enriched);
          } catch {
            return false;
          }
        })
      )
        return undefined;
      const full: SendContextEvent = {
        ...enriched,
        id: randomId('event'),
        sequence: ++sequence,
        timestamp: Date.now(),
      };
      const serialized: SendContextEvent = {
        ...full,
        ...(full.payload !== undefined
          ? {
              payload: serializeField(full.payload, {
                kind: full.kind,
                phase: full.phase,
                field: 'payload',
              }),
            }
          : {}),
        ...(full.response !== undefined
          ? {
              response: serializeField(full.response, {
                kind: full.kind,
                phase: full.phase,
                field: 'response',
              }),
            }
          : {}),
        ...(full.state !== undefined
          ? {
              state: serializeField(full.state, {
                kind: full.kind,
                phase: full.phase,
                field: 'state',
              }),
            }
          : {}),
      };
      eventList = [...eventList, serialized];
      if (activeClipId) {
        clipList = clipList.map((clip) =>
          clip.id === activeClipId
            ? { ...clip, eventIds: [...clip.eventIds, serialized.id] }
            : clip,
        );
      }
      trim();
      publish();
      return serialized;
    },
    capture(kind, phase, details = {}) {
      return session.emit({ ...details, kind, phase });
    },
    startRecord(label = `Record ${clipList.length + 1}`) {
      if (activeClipId) session.stopRecord();
      const clip: SendContextClip = {
        id: randomId('clip'),
        label,
        startedAt: Date.now(),
        eventIds: [],
        truncated: false,
      };
      clipList = [...clipList, clip];
      activeClipId = clip.id;
      publish();
      return clip;
    },
    stopRecord() {
      const active = clipList.find((clip) => clip.id === activeClipId);
      if (!active) return undefined;
      const stopped = { ...active, stoppedAt: Date.now() };
      clipList = clipList.map((clip) =>
        clip.id === stopped.id ? stopped : clip,
      );
      activeClipId = undefined;
      publish();
      return stopped;
    },
    selectClip(id) {
      return id === undefined
        ? undefined
        : clipList.find((clip) => clip.id === id);
    },
    clear() {
      eventList = [];
      clipList = [];
      activeClipId = undefined;
      publish();
    },
    exportJson(clipId) {
      const clip = clipId
        ? clipList.find((entry) => entry.id === clipId)
        : undefined;
      const events = clip
        ? eventList.filter((event) => clip.eventIds.includes(event.id))
        : eventList;
      return safeJson({ events, ...(clip ? { clip } : { clips: clipList }) });
    },
    exportSummary(clipId) {
      const clip = clipId
        ? clipList.find((entry) => entry.id === clipId)
        : undefined;
      const events = clip
        ? eventList.filter((event) => clip.eventIds.includes(event.id))
        : eventList;
      return events
        .map((event) => {
          const operation = event.operationId ? ` ${event.operationId}` : '';
          return `${new Date(event.timestamp).toISOString()} [${event.phase}] ${event.kind}${operation}${event.name ? ` ${event.name}` : ''}`;
        })
        .join('\n');
    },
    destroy() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      eventsSubject.complete();
      snapshotSubject.complete();
    },
  };
  (session as SendContextSessionWithInternals).addCleanup = (cleanup) => {
    cleanups.push(cleanup);
  };
  return session;
}

export function createSendContextRecordController(
  session: SendContextSession,
): SendContextRecordController {
  const clipsSubject = new BehaviorSubject<readonly SendContextClip[]>(
    session.clips,
  );
  const subscription = session.snapshot$.subscribe(({ clips }) =>
    clipsSubject.next(clips),
  );
  return {
    clips$: clipsSubject.asObservable(),
    get clips() {
      return session.clips;
    },
    startRecord: (label) => session.startRecord(label),
    stopRecord: () => session.stopRecord(),
    selectClip: (id) => session.selectClip(id),
    exportSummary: (id) => session.exportSummary(id),
    exportJson: (id) => session.exportJson(id),
  };
}

export function provideSendContextEventSource(
  source: SendContextEventSource,
): CraftServiceProvider {
  return (sources.provide as unknown as (
    value: SendContextEventSource,
  ) => unknown)!(source) as CraftServiceProvider;
}
export function provideSendContextEventEnricher(
  enricher: SendContextEventEnricher,
): CraftServiceProvider {
  return (enrichers.provide as unknown as (
    value: SendContextEventEnricher,
  ) => unknown)!(enricher) as CraftServiceProvider;
}
export function provideSendContextEventFilter(
  filter: SendContextEventFilter,
): CraftServiceProvider {
  return (filters.provide as unknown as (
    value: SendContextEventFilter,
  ) => unknown)!(filter) as CraftServiceProvider;
}

export function provideSendContextSession(): CraftServiceProvider[] {
  const requireSession = (): SendContextSession => {
    const value = ɵinjectSendContextSession();
    if (!value) throw new Error('SendContextSession is not provided.');
    return value;
  };
  return [
    provideSendContextRetentionPolicy({
      maxEvents: 500,
      maxBytes: 2 * 1024 * 1024,
    }),
    provideSendContextRedactor(defaultSendContextRedactor),
    provideSendContextValueSerializer(defaultSendContextValueSerializer),
    sources.provide!() as CraftServiceProvider,
    enrichers.provide!() as CraftServiceProvider,
    filters.provide!() as CraftServiceProvider,
    session.provide!() as CraftServiceProvider,
    recordController.provide!() as CraftServiceProvider,
    provideCraftDomEventHook((interaction, next) => {
      const session = requireSession();
      const correlationId =
        ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined;
      session.capture('dom', 'emitted', {
        name: interaction.interactionName,
        correlationId,
        payload: interaction,
        targets: [{ tagName: interaction.elementTag }],
      });
      return next();
    }),
    provideCraftHttpTrace((context, next) => {
      const session = requireSession();
      const correlationId =
        ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined;
      const operationId = randomId('http');
      session.capture('http', 'started', {
        name: context.method,
        operationId,
        correlationId,
        payload: context,
      });
      return next().then(
        (response) => {
          session.capture('http', 'succeeded', {
            name: context.method,
            operationId,
            correlationId,
            response,
          });
          return response;
        },
        (error) => {
          session.capture('http', 'failed', {
            name: context.method,
            operationId,
            correlationId,
            response: error,
          });
          throw error;
        },
      );
    }),
    ...provideCraftRouterTrace((context, next) => {
      const session = requireSession();
      const correlationId =
        ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined;
      const operationId = randomId('navigation');
      session.capture('navigation', 'started', {
        name: context.eventName ?? context.stage,
        operationId,
        correlationId,
        payload: context,
      });
      try {
        const result = next();
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          return (result as Promise<unknown>).then(
            (response) => {
              session.capture('navigation', 'succeeded', {
                name: context.eventName ?? context.stage,
                operationId,
                correlationId,
                response,
              });
              return response;
            },
            (error) => {
              session.capture('navigation', 'failed', {
                name: context.eventName ?? context.stage,
                operationId,
                correlationId,
                response: error,
              });
              throw error;
            },
          );
        }
        session.capture('navigation', 'succeeded', {
          name: context.eventName ?? context.stage,
          operationId,
          correlationId,
          response: result,
        });
        return result;
      } catch (error) {
        session.capture('navigation', 'failed', {
          name: context.eventName ?? context.stage,
          operationId,
          correlationId,
          response: error,
        });
        throw error;
      }
    }),
    providePrimitiveResourceRuntimeObserver((context) => {
      const session = requireSession();
      const correlationId =
        ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined;
      session.capture('primitive', 'emitted', {
        name: context.kind,
        correlationId,
        state: readPrimitiveState(context),
      });
    }),
  ] as CraftServiceProvider[];
}

type SendContextSessionWithInternals = SendContextSession & {
  addCleanup(cleanup: () => void): void;
};

function readPrimitiveState(context: PrimitiveResourceRuntimeContext): unknown {
  try {
    return context.get();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
