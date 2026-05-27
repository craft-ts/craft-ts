import { inject, type Provider } from '@angular/core';
import {
  APP_SNAPSHOT_REGISTRY,
  CorrelationIdToYield,
  HostTagToYield,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  provideFnWrapper,
  triggerAndCollectInsertions,
} from '@craft-ng/core';
import { collectSnapshot } from '../buffer/snapshot-collector';
import { DEV_TOOLS_EVENT_BUS } from '../event-bus';
import {
  primitiveKindFromHostTag,
  type CallEndEvent,
  type CallErrorEvent,
  type CallStartEvent,
  type PrimitiveKind,
} from '../event-types';

export interface FnWrapperCollectorOptions {
  /**
   * Primitive kinds whose calls should be recorded.
   * Defaults to method, mutation, query, asyncProcess (computed is skipped to avoid noise).
   */
  readonly trackKinds?: readonly PrimitiveKind[];
}

const DEFAULT_TRACK_KINDS: readonly PrimitiveKind[] = [
  'method',
  'mutation',
  'query',
  'asyncProcess',
];

let _devToolsCallCounter = 0;
function nextId(): string {
  _devToolsCallCounter += 1;
  return `${Date.now().toString(36)}-${_devToolsCallCounter.toString(36)}`;
}

export function provideFnWrapperCollector(
  options: FnWrapperCollectorOptions = {},
): Provider[] {
  const trackKinds = new Set<PrimitiveKind>(
    options.trackKinds ?? DEFAULT_TRACK_KINDS,
  );

  return [
    { provide: INSERTION_SNAPSHOT_REGISTRY, useClass: InsertionSnapshotRegistry },
    provideFnWrapper(function* (factory, thisArg, args) {
      const bus = inject(DEV_TOOLS_EVENT_BUS);
      const snapshotRegistry = inject(APP_SNAPSHOT_REGISTRY);
      const insertionRegistry = inject(INSERTION_SNAPSHOT_REGISTRY, {
        optional: true,
      });

      const hostTag = yield* HostTagToYield();
      const { kind, name } = primitiveKindFromHostTag(hostTag);

      if (!trackKinds.has(kind)) {
        return yield* factory.apply(thisArg, args);
      }

      const correlation = yield* CorrelationIdToYield();
      const id = nextId();
      const startedAt = performance.now();

      const startEvent: CallStartEvent = {
        kind: 'call:start',
        id,
        hostTag,
        primitiveKind: kind,
        name,
        args,
        correlation,
        startedAt,
      };
      bus.emit(startEvent);

      try {
        const result = yield* factory.apply(thisArg, args);
        const endedAt = performance.now();
        const stateSnapshot = collectSnapshot(snapshotRegistry);
        const insertions = triggerAndCollectInsertions(insertionRegistry);
        const endEvent: CallEndEvent = {
          kind: 'call:end',
          id,
          hostTag,
          primitiveKind: kind,
          name,
          correlation,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          result: previewValue(result),
          stateSnapshot,
          insertions,
        };
        bus.emit(endEvent);
        return result;
      } catch (error) {
        const endedAt = performance.now();
        const stateSnapshot = safeCollectSnapshot(snapshotRegistry);
        const errorEvent: CallErrorEvent = {
          kind: 'call:error',
          id,
          hostTag,
          primitiveKind: kind,
          name,
          correlation,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
          error: previewError(error),
          stateSnapshot,
        };
        bus.emit(errorEvent);
        throw error;
      }
    }),
  ];
}

function safeCollectSnapshot(
  registry: Parameters<typeof collectSnapshot>[0],
): readonly import('@craft-ng/core').SnapshotReport[] {
  try {
    return collectSnapshot(registry);
  } catch {
    return [];
  }
}

const MAX_PREVIEW_DEPTH = 4;
const MAX_STRING_LENGTH = 500;

function previewValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_PREVIEW_DEPTH) return '[…]';
  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return s.length > MAX_STRING_LENGTH
      ? `${s.slice(0, MAX_STRING_LENGTH)}…`
      : s;
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function') return `[Function ${(value as () => void).name || 'anonymous'}]`;
  if (t === 'symbol') return String(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => previewValue(v, depth + 1));
  }
  if (value instanceof Error) {
    return { __error: true, name: value.name, message: value.message };
  }
  if (t === 'object') {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (i++ >= 50) {
        out['…'] = `+${Object.keys(value as object).length - 50} more`;
        break;
      }
      out[k] = previewValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function previewError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      __error: true,
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return previewValue(error);
}
