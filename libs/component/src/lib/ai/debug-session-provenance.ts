import type { SendContextEvent } from '@craft-ts/core';

export interface DebugSessionReferenceUse {
  readonly eventId: string;
  readonly sequence: number;
  readonly name?: string;
  readonly path: string;
}

export interface DebugSessionReferenceProvenance {
  readonly fingerprint: string;
  readonly producers: readonly DebugSessionReferenceUse[];
  readonly holders: readonly DebugSessionReferenceUse[];
  readonly consumers: readonly DebugSessionReferenceUse[];
  readonly edges: readonly Readonly<{
    from: DebugSessionReferenceUse;
    to: DebugSessionReferenceUse;
  }>[];
}

/** Links values that flow from captured responses through storage to requests. */
export function buildDebugSessionProvenance(
  events: readonly SendContextEvent[],
): readonly DebugSessionReferenceProvenance[] {
  const uses = new Map<
    string,
    {
      producers: DebugSessionReferenceUse[];
      holders: DebugSessionReferenceUse[];
      consumers: DebugSessionReferenceUse[];
    }
  >();
  for (const event of [...events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    for (const ref of event.refs ?? []) {
      const entry = uses.get(ref.fingerprint) ?? {
        producers: [],
        holders: [],
        consumers: [],
      };
      const use: DebugSessionReferenceUse = {
        eventId: event.id,
        sequence: event.sequence,
        ...(event.name ? { name: event.name } : {}),
        path: ref.path,
      };
      if (event.kind === 'storage' || event.kind === 'primitive') {
        entry.holders.push(use);
      } else if (ref.direction === 'in') {
        entry.producers.push(use);
      } else {
        entry.consumers.push(use);
      }
      uses.set(ref.fingerprint, entry);
    }
  }

  return [...uses.entries()].map(([fingerprint, entry]) => ({
    fingerprint,
    producers: entry.producers,
    holders: entry.holders,
    consumers: entry.consumers,
    edges: entry.producers.flatMap((from) => [
      ...entry.holders
        .filter((to) => from.sequence <= to.sequence)
        .map((to) => ({ from, to })),
      ...entry.consumers
        .filter((to) => from.sequence <= to.sequence)
        .map((to) => ({ from, to })),
    ]),
  }));
}
