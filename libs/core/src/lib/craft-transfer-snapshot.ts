import type {
  CraftPrimitiveEntry,
  CraftPrimitiveRegistry,
} from './craft-primitive-registry';

export const CRAFT_TRANSFER_SNAPSHOT_VERSION = 1;

export type CraftTransferQuerySnapshot = Readonly<{
  status: string;
  value?: unknown;
  error?: unknown;
}>;

export type CraftTransferSnapshot = Readonly<{
  version: number;
  values: Readonly<Record<string, unknown>>;
  queries: Readonly<Record<string, CraftTransferQuerySnapshot>>;
}>;

/** Captures only JSON-compatible state; non-serializable entries fail loudly. */
export function captureCraftTransferSnapshot(
  registry: CraftPrimitiveRegistry,
): CraftTransferSnapshot {
  const values: Record<string, unknown> = {};
  const queries: Record<string, CraftTransferQuerySnapshot> = {};

  for (const entry of registry.list()) {
    const value = readSerializableEntry(entry);
    if (value === SKIP_ENTRY) continue;
    if (entry.kind === 'query') {
      const error = entry.error?.();
      queries[entry.address] = {
        status: entry.status?.() ?? (value === undefined ? 'idle' : 'resolved'),
        ...(value === undefined ? {} : { value }),
        ...(error === undefined ? {} : { error: serializeError(error) }),
      };
    } else {
      values[entry.address] = value;
    }
  }

  return {
    version: CRAFT_TRANSFER_SNAPSHOT_VERSION,
    values,
    queries,
  };
}

function serializeError(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : error;
}

/** Primes registrations that will be created during the first client render. */
export function primeCraftTransferSnapshot(
  registry: CraftPrimitiveRegistry,
  snapshot: CraftTransferSnapshot,
): void {
  if (snapshot.version !== CRAFT_TRANSFER_SNAPSHOT_VERSION) {
    throw new Error(
      `Unsupported Craft transfer snapshot version ${snapshot.version}.`,
    );
  }
  registry.prime({
    ...snapshot.values,
    ...Object.fromEntries(
      Object.entries(snapshot.queries).flatMap(([address, query]) =>
        'value' in query ? [[address, query.value]] : [],
      ),
    ),
  });
}

/** JSON safe for embedding in an HTML script element. */
export function serializeCraftTransferSnapshot(
  snapshot: CraftTransferSnapshot,
): string {
  return JSON.stringify(snapshot)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

const SKIP_ENTRY = Symbol('skip-transfer-entry');

function readSerializableEntry(
  entry: CraftPrimitiveEntry,
): unknown | typeof SKIP_ENTRY {
  let value: unknown;
  try {
    value = entry.read();
  } catch {
    return SKIP_ENTRY;
  }
  assertSerializable(value, entry.address, new Set());
  return value;
}

function assertSerializable(
  value: unknown,
  address: string,
  seen: Set<object>,
): void {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'bigint' || typeof value === 'function') {
    throw new Error(
      `Craft transfer value "${address}" is not JSON-serializable.`,
    );
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) {
    throw new Error(`Craft transfer value "${address}" contains a cycle.`);
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new Error(
      `Craft transfer value "${address}" must contain only plain objects and arrays.`,
    );
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    assertSerializable(child, address, seen);
  }
  seen.delete(value);
}
