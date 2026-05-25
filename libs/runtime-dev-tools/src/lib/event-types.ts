import type {
  CorrelationIdMetadata,
  SnapshotReport,
} from '@craft-ng/core';

export type DevToolsEventKind =
  | 'call:start'
  | 'call:end'
  | 'call:error';

export interface CallStartEvent {
  readonly kind: 'call:start';
  readonly id: string;
  readonly hostTag: readonly string[];
  readonly primitiveKind: PrimitiveKind;
  readonly name: string;
  readonly args: readonly unknown[];
  readonly correlation: CorrelationIdMetadata | null;
  readonly startedAt: number;
}

export interface CallEndEvent {
  readonly kind: 'call:end';
  readonly id: string;
  readonly hostTag: readonly string[];
  readonly primitiveKind: PrimitiveKind;
  readonly name: string;
  readonly correlation: CorrelationIdMetadata | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly result: unknown;
  readonly stateSnapshot: readonly SnapshotReport[];
  readonly insertions?: Record<string, unknown>;
}

export interface CallErrorEvent {
  readonly kind: 'call:error';
  readonly id: string;
  readonly hostTag: readonly string[];
  readonly primitiveKind: PrimitiveKind;
  readonly name: string;
  readonly correlation: CorrelationIdMetadata | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly error: unknown;
  readonly stateSnapshot: readonly SnapshotReport[];
}

export type DevToolsEvent = CallStartEvent | CallEndEvent | CallErrorEvent;

export type PrimitiveKind =
  | 'method'
  | 'mutation'
  | 'query'
  | 'computed'
  | 'asyncProcess'
  | 'service'
  | 'component'
  | 'unknown';

const PRIMITIVE_PREFIXES: readonly { prefix: string; kind: PrimitiveKind }[] = [
  { prefix: 'method:', kind: 'method' },
  { prefix: 'mutation:', kind: 'mutation' },
  { prefix: 'query:', kind: 'query' },
  { prefix: 'computed:', kind: 'computed' },
  { prefix: 'asyncProcess:', kind: 'asyncProcess' },
  { prefix: 'service:', kind: 'service' },
  { prefix: 'component:', kind: 'component' },
];

export function primitiveKindFromHostTag(
  hostTag: readonly string[],
): { kind: PrimitiveKind; name: string } {
  // Innermost host tag is last — that's the primitive currently executing.
  for (let i = hostTag.length - 1; i >= 0; i--) {
    const tag = hostTag[i];
    for (const { prefix, kind } of PRIMITIVE_PREFIXES) {
      if (tag.startsWith(prefix)) {
        return { kind, name: tag.slice(prefix.length) };
      }
    }
  }
  const last = hostTag[hostTag.length - 1] ?? '';
  return { kind: 'unknown', name: last };
}
