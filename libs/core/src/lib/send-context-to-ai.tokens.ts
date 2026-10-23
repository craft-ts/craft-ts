import type { SnapshotReport } from './take-app-snapshot';
import { type Signal } from './host/craft-compat';
import { type CraftServiceProvider, ɵcraftValueService } from './craft-service';
import { behaviorSubject, type Subscribable } from './stream-kernel';
import { provideCraftDomEventHook } from './dom-event-hook';
import {
  provideCraftHttpTrace,
  ɵinvokeCraftHttpTransport,
} from './craft-http-trace';
import { provideCraftRouterTrace } from './craft-router-trace';
import { providePrimitiveResourceRuntimeObserver } from './primitive-resource-runtime-context';
import {
  ɵcorrelationIdForDomEvent,
  ɵinjectCorrelationIdService,
} from './correlation-id';
import { ɵinjectCraftPrimitiveRegistry } from './craft-primitive-registry';
import { ɵinjectPersistedStorageSnapshotRegistry } from './persisted-storage-snapshot';
import {
  connectCraftReplayTransportCapture,
  injectCraftReplayTransports,
} from './craft-replay-transports';
import { ɵcaptureCraftReplayTarget } from './craft-replay-target';
import { provideTemplateTrace } from './template-trace';
import { ɵinjectCraftRouterRuntime } from './craft-router-tokens';
import { ɵinjectCraftRouteActivationTracker } from './craft-route-activation';

const capturedReplayDomEvents = new WeakSet<Event>();

/** @internal Prevent the same native event from being recorded twice. */
export function ɵwasReplayDomEventCaptured(event: Event): boolean {
  return capturedReplayDomEvents.has(event);
}

/** @internal Mark a native event after recording its replay step. */
export function ɵmarkReplayDomEventCaptured(event: Event): void {
  capturedReplayDomEvents.add(event);
}

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
  | 'storage'
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
  /** Milliseconds since the recording started, measured with performance.now(). */
  readonly elapsedMs?: number;
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
  /** Present when a local archive combines events from multiple page tabs. */
  readonly participantId?: string;
  /** Event sequence within its originating page tab. */
  readonly participantSequence?: number;
  /** Wall-clock offset from the shared archive session start. */
  readonly globalElapsedMs?: number;
}

export interface SendContextEnvironmentProfile {
  readonly browser?: string;
  readonly browserVersion?: string;
  readonly engine?: 'chromium' | 'gecko' | 'webkit' | 'unknown';
  readonly platform?: string;
  readonly userAgent?: string;
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly devicePixelRatio?: number;
  readonly language?: string;
  readonly languages?: readonly string[];
  readonly timeZone?: string;
  readonly screen?: Readonly<{ width: number; height: number }>;
  /** Effective page theme, including an explicit document-level mode. */
  readonly colorScheme?: 'light' | 'dark';
}

export interface SendContextSessionParticipant {
  readonly id: string;
  readonly title: string;
  readonly startUrl: string;
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly environment?: SendContextEnvironmentProfile;
  readonly state: 'visible' | 'hidden' | 'blurred';
  readonly status: 'recording' | 'completed' | 'interrupted';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly initialSnapshot?: Readonly<Record<string, unknown>>;
}

/** Current portable recording schema. Bump only with an explicit replay migration decision. */
export const DEBUG_SESSION_EXPORT_VERSION = 6 as const;

/** A portable, redacted recording that can be validated before replay. */
export interface SendContextReplayExport {
  readonly format: 'craft-debug-session';
  /** Runtime target identities and transport contracts are defined by this schema version. */
  readonly version: typeof DEBUG_SESSION_EXPORT_VERSION;
  readonly startUrl: string;
  /** CSS-pixel viewport dimensions when session capture is initialized. */
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly exportedAt: number;
  readonly truncated: boolean;
  readonly events: readonly SendContextEvent[];
  readonly clips: readonly SendContextClip[];
  /** Stable, versioned restart points; component instances are never stored. */
  readonly snapshots?: readonly SendContextReplaySnapshot[];
  /** Page tabs that contributed to an automatically shared local session. */
  readonly participants?: readonly SendContextSessionParticipant[];
  /** Primitive values captured immediately before the first recorded interaction. */
  readonly initialSnapshot?: Readonly<Record<string, unknown>>;
}

export interface SendContextReplaySnapshot {
  readonly format: 'craft-debug-replay-snapshot';
  readonly version: 1;
  readonly appVersion: string;
  readonly capturedAt: number;
  readonly route: Readonly<{ url: string }>;
  readonly primitives: Readonly<Record<string, unknown>>;
  readonly storage: readonly Readonly<{
    backend: string;
    storeName: string;
    key: string;
    kind: 'query' | 'queryById';
    resourceId?: string;
    queryParams?: unknown;
    value: unknown;
    timestamp?: number;
  }>[];
  readonly capabilities: Readonly<{
    primitives: true;
    storage: true;
    inFlightOperations: false;
  }>;
}

export interface SendContextClip {
  readonly id: string;
  /** Present when a local archive combines clips from multiple page tabs. */
  readonly participantId?: string;
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
  readonly events$: Subscribable<readonly SendContextEvent[]>;
  readonly snapshot$: Subscribable<SendContextSessionSnapshot>;
  readonly eventSignal?: Signal<readonly SendContextEvent[]>;
  readonly clipsSignal?: Signal<readonly SendContextClip[]>;
  readonly events: readonly SendContextEvent[];
  readonly clips: readonly SendContextClip[];
  readonly activeClip: SendContextClip | undefined;
  /** Milliseconds on this session's monotonic recording clock. */
  elapsedTime(): number;
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
  exportSessionJson(): string;
  exportSummary(clipId?: string): string;
  destroy(): void;
}

export interface SendContextRecordController {
  readonly clips$: Subscribable<readonly SendContextClip[]>;
  readonly clips: readonly SendContextClip[];
  startRecord(label?: string): SendContextClip;
  stopRecord(): SendContextClip | undefined;
  selectClip(id: string | undefined): SendContextClip | undefined;
  exportSummary(clipId?: string): string;
  exportJson(clipId?: string): string;
}

type SendContextHelper<T> = () => Generator<never, T, unknown>;
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

const sendContextRetentionPolicyService = ɵcraftValueService(
  { name: 'SendContextRetentionPolicy', providedIn: 'toProvide' },
  () => ({ maxEvents: Number.MAX_SAFE_INTEGER }),
);
const sendContextRedactorService = ɵcraftValueService(
  { name: 'SendContextRedactor', providedIn: 'toProvide' },
  () => defaultSendContextRedactor,
);
const sendContextValueSerializerService = ɵcraftValueService(
  { name: 'SendContextValueSerializer', providedIn: 'toProvide' },
  () => defaultSendContextValueSerializer,
);
const sendContextEventSourceService = ɵcraftValueService(
  {
    name: 'SendContextEventSources',
    providedIn: 'toProvide',
    collection: true,
  },
  (inputs: { $provided?: SendContextEventSource }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const sendContextEventEnricherService = ɵcraftValueService(
  {
    name: 'SendContextEventEnrichers',
    providedIn: 'toProvide',
    collection: true,
  },
  (inputs: { $provided?: SendContextEventEnricher }) =>
    inputs.$provided ? [inputs.$provided] : [],
);
const sendContextEventFilterService = ɵcraftValueService(
  {
    name: 'SendContextEventFilters',
    providedIn: 'toProvide',
    collection: true,
  },
  (inputs: { $provided?: SendContextEventFilter }) =>
    inputs.$provided ? [inputs.$provided] : [],
);

const sendContextSessionService = ɵcraftValueService(
  { name: 'SendContextSession', providedIn: 'toProvide' },
  function* () {
    const session = createSendContextSession({
      retentionPolicy: yield* SendContextRetentionPolicy(),
      redactor: yield* SendContextRedactor(),
      serializer: yield* SendContextValueSerializer(),
      enrichers: yield* SendContextEventEnrichers(),
      filters: yield* SendContextEventFilters(),
    });
    for (const source of yield* SendContextEventSources()) {
      const cleanup =
        typeof source === 'function'
          ? source(session)
          : source.connect(session);
      if (cleanup)
        (session as SendContextSessionWithInternals).addCleanup(cleanup);
    }
    return session;
  },
);
const sendContextRecordControllerService = ɵcraftValueService(
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
export const ɵinjectSendContextRetentionPolicy =
  (): SendContextRetentionPolicy => retention.metadata.inject();
export const SendContextRedactor = redactor.helper;
export const provideSendContextRedactor = (
  value: SendContextRedactor,
): CraftServiceProvider => redactor.provide!(value) as CraftServiceProvider;
export const ɵinjectSendContextRedactor = (): SendContextRedactor =>
  redactor.metadata.inject();
export const SendContextValueSerializer = serializer.helper;
export const provideSendContextValueSerializer = (
  value: SendContextValueSerializer,
): CraftServiceProvider => serializer.provide!(value) as CraftServiceProvider;
export const ɵinjectSendContextValueSerializer =
  (): SendContextValueSerializer => serializer.metadata.inject();
export const SendContextEventSources = sources.helper;
export const ɵinjectSendContextEventSources =
  (): readonly SendContextEventSource[] => {
    try {
      return sources.metadata.inject();
    } catch {
      return [];
    }
  };
export const SendContextEventEnrichers = enrichers.helper;
export const ɵinjectSendContextEventEnrichers =
  (): readonly SendContextEventEnricher[] => {
    try {
      return enrichers.metadata.inject();
    } catch {
      return [];
    }
  };
export const SendContextEventFilters = filters.helper;
export const ɵinjectSendContextEventFilters =
  (): readonly SendContextEventFilter[] => {
    try {
      return filters.metadata.inject();
    } catch {
      return [];
    }
  };
export const SendContextSession = session.helper;
export const ɵinjectSendContextSession = (): SendContextSession | null => {
  try {
    return session.metadata.inject();
  } catch {
    return null;
  }
};
export const SendContextRecordController = recordController.helper;
export const ɵinjectSendContextRecordController =
  (): SendContextRecordController | null => {
    try {
      return recordController.metadata.inject();
    } catch {
      return null;
    }
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function defaultSendContextRedactor(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (current instanceof Error) {
      return {
        name: current.name,
        message: redactSensitiveText(current.message),
      };
    }
    if (current instanceof Date) return current;
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
        /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key/i.test(
          key,
        )
          ? [key, '[REDACTED]']
          : [key, visit(entry)],
      ),
    );
  };
  return visit(value);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /((?:password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key)\s*[:=]\s*)(["']?)[^\s"'&,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /([?&](?:password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key)=)[^&#\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]');
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
  const retention = options.retentionPolicy ?? {
    maxEvents: Number.MAX_SAFE_INTEGER,
  };
  const redactor = options.redactor ?? defaultSendContextRedactor;
  const serializer = options.serializer ?? defaultSendContextValueSerializer;
  const enrichers = options.enrichers ?? [];
  const filters = options.filters ?? [];
  let eventList: SendContextEvent[] = [];
  let clipList: SendContextClip[] = [];
  let sequence = 0;
  let activeClipId: string | undefined;
  let wasTruncated = false;
  const eventSizes: number[] = [];
  let retainedJsonSize = 2;
  const startedAtMonotonic =
    typeof performance === 'undefined' ? 0 : performance.now();
  const startUrl =
    typeof location === 'undefined' ? '' : redactReplayUrl(location.href);
  const viewport =
    typeof window === 'undefined'
      ? undefined
      : { width: window.innerWidth, height: window.innerHeight };
  const eventsSubject = behaviorSubject<readonly SendContextEvent[]>([]);
  const snapshotSubject = behaviorSubject<SendContextSessionSnapshot>({
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
        '[capture-error]': redactSensitiveText(
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  };
  const trim = (): void => {
    const maxEvents = Math.max(0, retention.maxEvents);
    const maxBytes = retention.maxBytes;
    while (
      eventList.length > maxEvents ||
      (maxBytes !== undefined && retainedJsonSize > maxBytes)
    ) {
      const removed = eventList.shift();
      if (!removed) break;
      const removedSize = eventSizes.shift() ?? safeJson(removed).length;
      retainedJsonSize -= removedSize + (eventList.length > 0 ? 1 : 0);
      if (eventList.length === 0) retainedJsonSize = 2;
      wasTruncated = true;
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
    events$: eventsSubject.asSubscribable(),
    snapshot$: snapshotSubject.asSubscribable(),
    get events() {
      return eventList;
    },
    get clips() {
      return clipList;
    },
    get activeClip() {
      return clipList.find((clip) => clip.id === activeClipId);
    },
    elapsedTime() {
      return Math.max(
        0,
        (typeof performance === 'undefined'
          ? startedAtMonotonic
          : performance.now()) - startedAtMonotonic,
      );
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
        elapsedMs: enriched.elapsedMs ?? session.elapsedTime(),
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
      const serializedSize = safeJson(serialized).length;
      if (eventList.length > 0) retainedJsonSize += 1;
      retainedJsonSize += serializedSize;
      // Keep the capture path append-only and O(1) by default. Snapshot
      // subscribers are notified below even though the array identity stays put.
      eventList.push(serialized);
      eventSizes.push(serializedSize);
      if (activeClipId) {
        clipList = clipList.map((clip) =>
          clip.id === activeClipId
            ? { ...clip, eventIds: [...clip.eventIds, serialized.id] }
            : clip,
        );
      }
      const trimStart = performance.now();
      const eventsBefore = eventList.length;
      trim();
      const trimMs = performance.now() - trimStart;
      // Picked up by the AI performance observer (component lib) so a stall
      // caused by retention shows up, attributed, in the exported prompt.
      if (trimMs > 16 && typeof performance.measure === 'function') {
        try {
          performance.measure(
            `craft:send-context.trim ${serialized.kind} removed=${eventsBefore - eventList.length}`,
            { start: trimStart, duration: trimMs },
          );
        } catch {
          // Instrumentation must never break the application flow.
        }
      }
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
      eventSizes.length = 0;
      retainedJsonSize = 2;
      clipList = [];
      activeClipId = undefined;
      wasTruncated = false;
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
    exportSessionJson() {
      const initialSnapshotEvent = eventList.find(
        (event) =>
          event.kind === 'snapshot' &&
          event.name === 'initial' &&
          isRecord(event.state),
      );
      const events = eventList.filter(
        (event) =>
          event.id !== initialSnapshotEvent?.id &&
          !(
            event.kind === 'dom' &&
            typeof event.name === 'string' &&
            [
              'AiSendContextChat',
              'AiSendContextLauncher',
              'AiContextMenu',
              'AiSendDialog',
            ].some((component) => event.name!.startsWith(`${component}:`))
          ),
      );
      const includedIds = new Set(events.map((event) => event.id));
      const clips = clipList.map((clip) => ({
        ...clip,
        eventIds: clip.eventIds.filter((id) => includedIds.has(id)),
      }));
      const snapshots = events.flatMap((event) =>
        event.kind === 'snapshot' &&
        event.name === 'replay-checkpoint' &&
        isRecord(event.payload) &&
        event.payload['format'] === 'craft-debug-replay-snapshot'
          ? [event.payload as unknown as SendContextReplaySnapshot]
          : [],
      );
      return safeJson({
        format: 'craft-debug-session',
        version: DEBUG_SESSION_EXPORT_VERSION,
        startUrl,
        ...(viewport ? { viewport } : {}),
        exportedAt: Date.now(),
        truncated: wasTruncated || clipList.some((clip) => clip.truncated),
        events,
        clips,
        ...(snapshots.length ? { snapshots } : {}),
        ...(initialSnapshotEvent
          ? {
              initialSnapshot: initialSnapshotEvent.state as Readonly<
                Record<string, unknown>
              >,
            }
          : {}),
      } satisfies SendContextReplayExport);
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
  const clipsSubject = behaviorSubject<readonly SendContextClip[]>(
    session.clips,
  );
  session.snapshot$.subscribe({
    next: ({ clips }) => clipsSubject.next(clips),
  });
  return {
    clips$: clipsSubject.asSubscribable(),
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

export function provideSendContextSession(
  options: Readonly<{
    captureInputValues?: boolean;
    captureSensitiveInputValues?: boolean;
  }> = {},
): CraftServiceProvider[] {
  const requireSession = (): SendContextSession => {
    const value = ɵinjectSendContextSession();
    if (!value) throw new Error('SendContextSession is not provided.');
    return value;
  };
  return [
    provideSendContextRetentionPolicy({
      maxEvents: Number.MAX_SAFE_INTEGER,
    }),
    provideSendContextRedactor(defaultSendContextRedactor),
    provideSendContextValueSerializer(defaultSendContextValueSerializer),
    sources.provide!() as CraftServiceProvider,
    provideSendContextEventSource((createdSession) => {
      let registry:
        | ReturnType<typeof ɵinjectPersistedStorageSnapshotRegistry>
        | undefined;
      try {
        registry = ɵinjectPersistedStorageSnapshotRegistry();
      } catch {
        return () => undefined;
      }
      return registry.onRead((entry) => {
        if (!createdSession.activeClip) return;
        createdSession.capture('storage', 'emitted', {
          name: 'restored',
          payload: entry,
        });
      });
    }),
    provideSendContextEventSource((createdSession) =>
      connectCraftReplayTransportCapture(
        createdSession,
        injectCraftReplayTransports(),
      ),
    ),
    provideSendContextEventSource((createdSession) =>
      ɵinjectCraftRouteActivationTracker().subscribe((event) => {
        if (!createdSession.activeClip) return;
        createdSession.capture(
          'route-activation',
          event.outcome === 'activated' ? 'succeeded' : 'failed',
          {
            name: event.routePath,
            operationId: event.activationId,
            payload: event,
          },
        );
      }),
    ),
    provideTemplateTrace((trace, next) => {
      if (
        trace.kind === 'component' &&
        (trace.phase === 'create' || trace.phase === 'destroy')
      ) {
        const activeSession = ɵinjectSendContextSession();
        if (activeSession?.activeClip) {
          const correlationId =
            ɵinjectCorrelationIdService()?.lastCorrelationId() ?? undefined;
          const routeUrl = ɵinjectCraftRouterRuntime()?.url;
          activeSession.capture('component-lifecycle', 'emitted', {
            name: `${trace.phase}:${trace.componentName ?? 'unknown'}`,
            ...(correlationId ? { correlationId } : {}),
            payload: {
              transition: trace.phase,
              componentName: trace.componentName ?? 'unknown',
              renderCount: trace.renderCount,
              ...(routeUrl ? { routeUrl } : {}),
            },
          });
        }
      }
      return next();
    }),
    enrichers.provide!() as CraftServiceProvider,
    filters.provide!() as CraftServiceProvider,
    session.provide!() as CraftServiceProvider,
    recordController.provide!() as CraftServiceProvider,
    provideCraftDomEventHook((interaction, next) => {
      const session = requireSession();
      const correlationId =
        ɵcorrelationIdForDomEvent(
          interaction.event,
          ɵinjectCorrelationIdService(),
          interaction.interactionName,
        ) ?? undefined;
      const element = interaction.element;
      const link =
        element instanceof HTMLAnchorElement
          ? element
          : element.closest('a[href]');
      const form =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement;
      const sensitive =
        form &&
        ((element instanceof HTMLInputElement && element.type === 'password') ||
          /password|secret|token|authorization|cookie/i.test(
            `${element.getAttribute('name') ?? ''} ${element.id}`,
          ));
      const event = interaction.event;
      if (ɵwasReplayDomEventCaptured(event)) return next();
      const explicitlyOptedIn =
        options.captureInputValues === true ||
        element.getAttribute('data-debug-session-capture-value') === 'true' ||
        element.getAttribute('data-debug-session-capture-sensitive-value') ===
          'true';
      const sensitiveCaptureAllowed =
        options.captureSensitiveInputValues === true ||
        element.getAttribute('data-debug-session-capture-sensitive-value') ===
          'true';
      const value =
        form && explicitlyOptedIn && (!sensitive || sensitiveCaptureAllowed)
          ? element.value
          : undefined;
      const replayTarget = ɵcaptureCraftReplayTarget(
        element,
        event instanceof MouseEvent
          ? { clientX: event.clientX, clientY: event.clientY }
          : undefined,
      );
      const selector = ɵstableReplaySelector(element);
      const scrollAncestors = ɵreplayScrollAncestors(element);
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      if (
        !session.events.some(
          (entry) => entry.kind === 'snapshot' && entry.name === 'initial',
        )
      ) {
        session.capture('snapshot', 'emitted', {
          name: 'initial',
          correlationId,
          state: ɵinjectCraftPrimitiveRegistry().capture(),
        });
        let storageRegistry:
          | ReturnType<typeof ɵinjectPersistedStorageSnapshotRegistry>
          | undefined;
        try {
          storageRegistry = ɵinjectPersistedStorageSnapshotRegistry();
        } catch {
          // Storage snapshots are optional when no persister is registered.
        }
        if (storageRegistry) {
          void storageRegistry.capture().then((entries) => {
            if (!session.activeClip) return;
            session.capture('storage', 'emitted', {
              name: 'initial-snapshot',
              correlationId,
              payload: { entries },
            });
          });
        }
      }
      session.capture('dom', 'emitted', {
        name: interaction.interactionName,
        correlationId,
        payload: {
          action: event.type,
          eventName: interaction.eventName,
          interactionName: interaction.interactionName,
          selector,
          replayTarget,
          ...(link instanceof HTMLAnchorElement
            ? { href: redactReplayUrl(link.href) }
            : {}),
          ...(value === undefined ? {} : { value }),
          ...(event instanceof KeyboardEvent
            ? { key: event.key, code: event.code }
            : {}),
          ...(event instanceof MouseEvent
            ? {
                button: event.button,
                clientX: event.clientX,
                clientY: event.clientY,
              }
            : {}),
          // Keep click coordinates meaningful when the user has scrolled the
          // page: replay restores this viewport position before dispatch.
          scrollX,
          scrollY,
          scrollAncestors,
        },
        targets: [
          {
            tagName: interaction.elementTag,
            selector,
          },
        ],
      });
      ɵmarkReplayDomEventCaptured(event);
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
        payload: { ...context, source: 'craft-http-client' },
      });
      return ɵinvokeCraftHttpTransport(next).then(
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
        // Keep the entire primitive graph together so a replay checkpoint can
        // compare one consistent snapshot against the currently observed app.
        state: ɵinjectCraftPrimitiveRegistry().capture(),
      });
    }),
  ] as CraftServiceProvider[];
}

export function ɵstableReplaySelector(element: Element): string {
  if (element === document.body) return 'body';
  if (element === document.documentElement) return 'html';

  const named = element.closest('[data-craft-name]');
  if (named?.getAttribute('data-craft-name')) {
    const rawName = named.getAttribute('data-craft-name')!;
    const value =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(rawName)
        : rawName.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const namedSelector = `[data-craft-name="${value}"]${pathFromAncestor(element, named)}`;
    const ancestor = findUniqueReplayAncestor(element);
    if (ancestor) {
      const scoped = `${ancestor.selector} > ${pathFromAncestor(element, ancestor.element)}`;
      if (isUniqueReplaySelector(scoped)) return scoped;
    }
    if (isUniqueReplaySelector(namedSelector)) return namedSelector;
  }
  if (element.id) {
    const escapedId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(element.id)
        : element.id.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `#${escapedId}`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 6) {
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current!.tagName,
        )
      : [];
    parts.unshift(
      `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
    );
    current = current.parentElement;
  }
  return `body > ${parts.join(' > ')}`;
}

export function ɵreplayScrollAncestors(element: Element): readonly Readonly<{
  selector: string;
  scrollLeft: number;
  scrollTop: number;
}>[] {
  const ancestors: Array<{
    selector: string;
    scrollLeft: number;
    scrollTop: number;
  }> = [];
  let current = element.parentElement;
  while (current && current !== document.body && ancestors.length < 8) {
    if (
      current instanceof HTMLElement &&
      (current.scrollLeft !== 0 || current.scrollTop !== 0)
    ) {
      ancestors.push({
        selector: ɵstableReplaySelector(current),
        scrollLeft: current.scrollLeft,
        scrollTop: current.scrollTop,
      });
    }
    current = current.parentElement;
  }
  return ancestors;
}

/** Add a unique row identity when a named control is repeated in a list. */
function findUniqueReplayAncestor(
  element: Element,
): Readonly<{ element: Element; selector: string }> | undefined {
  const stableAttributes = [
    'data-testid',
    'data-user-id',
    'data-item-id',
    'id',
  ] as const;
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    for (const attribute of stableAttributes) {
      const value = ancestor.getAttribute(attribute);
      if (value === null) continue;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(value)
          : value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      const selector =
        attribute === 'id' ? `#${escaped}` : `[${attribute}="${escaped}"]`;
      if (isUniqueReplaySelector(selector))
        return { element: ancestor, selector };
    }
    ancestor = ancestor.parentElement;
  }
  return undefined;
}

/** Build a stable child path with sibling positions under a unique container. */
function pathFromAncestor(element: Element, ancestor: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== ancestor) {
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current!.tagName,
        )
      : [];
    parts.unshift(
      `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
    );
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function isUniqueReplaySelector(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    // Ignore malformed selectors from app-provided attributes.
    return false;
  }
}

function redactReplayUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/password|passwd|secret|token|authorization|cookie|key/i.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.href;
  } catch {
    return value;
  }
}

type SendContextSessionWithInternals = SendContextSession & {
  addCleanup(cleanup: () => void): void;
};
