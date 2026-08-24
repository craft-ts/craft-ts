import type {
  CraftPrimitiveEntry,
  CraftPrimitiveRegistry,
} from './craft-primitive-registry';
import {
  CraftSecurityError,
  type CraftTransferPolicy,
} from './craft-security';

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

export type CraftTransferCaptureOptions = Readonly<{
  readonly policy?: CraftTransferPolicy;
  /** Compatibility switch for callers that have not opted into policy yet. */
  readonly legacy?: boolean;
}>;

/** Captures only JSON-compatible state; non-serializable entries fail loudly. */
export function captureCraftTransferSnapshot(
  registry: CraftPrimitiveRegistry,
  options: CraftTransferCaptureOptions = { legacy: true },
): CraftTransferSnapshot {
  const values: Record<string, unknown> = {};
  const queries: Record<string, CraftTransferQuerySnapshot> = {};

  for (const entry of registry.list()) {
    if (!isTransferable(entry.address, entry.transfer, options.policy, options.legacy)) {
      continue;
    }
    const value = readSerializableEntry(
      entry,
      options.policy?.maxDepth ?? Number.POSITIVE_INFINITY,
      options.policy?.redact,
    );
    if (value === SKIP_ENTRY) continue;
    if (entry.kind === 'query') {
      const error = entry.error?.();
      queries[entry.address] = {
        status: entry.status?.() ?? (value === undefined ? 'idle' : 'resolved'),
        ...(value === undefined ? {} : { value }),
        ...(options.policy || options.legacy === false
          ? {}
          : error === undefined
            ? {}
            : { error: serializeError(error) }),
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
  policy?: CraftTransferPolicy,
): void {
  validateCraftTransferSnapshot(snapshot, policy);
  // Le filtrage par adresse appartient à la capture : le rejouer ici, avec
  // une politique cliente qui peut différer de celle du rendu, ferait
  // disparaître silencieusement des données légitimement transférées.
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
  policy?: CraftTransferPolicy,
): string {
  validateCraftTransferSnapshot(snapshot, policy);
  const json = JSON.stringify(snapshot);
  if (policy?.maxBytes !== undefined && byteLength(json) > policy.maxBytes) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_TOO_LARGE',
      `Snapshot exceeds the ${policy.maxBytes}-byte limit.`,
    );
  }
  return json
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

const SKIP_ENTRY = Symbol('skip-transfer-entry');

function readSerializableEntry(
  entry: CraftPrimitiveEntry,
  maxDepth = Number.POSITIVE_INFINITY,
  redact?: (address: string, value: unknown) => unknown,
): unknown | typeof SKIP_ENTRY {
  let value: unknown;
  try {
    value = entry.read();
  } catch {
    return SKIP_ENTRY;
  }
  const safeValue = redactSensitive(entry.address, value);
  const redacted = redact ? redact(entry.address, safeValue) : safeValue;
  if (redacted === undefined && value !== undefined) return SKIP_ENTRY;
  assertSerializable(redacted, entry.address, new Set(), 0, maxDepth);
  return redacted;
}

const SENSITIVE_NAME = /(?:^|[_:-])(pass(?:word)?|secret|token|api[-_]?key|authorization|cookie|session|private[-_]?key)(?:$|[_:-])/i;

function redactSensitive(address: string, value: unknown): unknown {
  return redactSensitiveWithSeen(address, value, new Set());
}

function redactSensitiveWithSeen(
  address: string,
  value: unknown,
  seen: Set<object>,
): unknown {
  if (SENSITIVE_NAME.test(address)) return undefined;
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    const result = value.map((item) => redactSensitiveWithSeen(address, item, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }
    if (seen.has(value)) return value;
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_NAME.test(key)) continue;
      result[key] = redactSensitiveWithSeen(`${address}:${key}`, child, seen);
    }
    seen.delete(value);
    return result;
  }
  return value;
}

/**
 * Une primitive n'est transférée que si la politique la nomme. Un défaut
 * ouvert ne protégerait rien : c'est l'application qui sait ce qui peut
 * atterrir dans le HTML envoyé au navigateur, pas le framework.
 */
function isTransferable(
  address: string,
  transfer: boolean | undefined,
  policy: CraftTransferPolicy | undefined,
  legacy: boolean | undefined,
): boolean {
  if (transfer === false) return false;
  if (!policy) return legacy !== false;
  if (policy.mode === 'legacy') return true;
  if (policy.mode === 'deny') return false;
  return (policy.allow ?? []).includes(address);
}

function validateCraftTransferSnapshot(
  snapshot: unknown,
  policy?: CraftTransferPolicy,
): asserts snapshot is CraftTransferSnapshot {
  if (!isRecord(snapshot) || snapshot['version'] !== CRAFT_TRANSFER_SNAPSHOT_VERSION) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_INVALID',
      'Unsupported or missing transfer snapshot version.',
    );
  }
  if (
    Object.keys(snapshot).some(
      (key) => !['version', 'values', 'queries'].includes(key),
    )
  ) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_INVALID',
      'The snapshot contains unknown top-level fields.',
    );
  }
  if (!isRecord(snapshot['values']) || !isRecord(snapshot['queries'])) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_INVALID',
      'The snapshot must contain values and queries objects.',
    );
  }
  const maxDepth = policy?.maxDepth ?? Number.POSITIVE_INFINITY;
  for (const [address, value] of Object.entries(snapshot['values'])) {
    assertKnownAddress(address);
    assertSerializable(value, address, new Set(), 0, maxDepth);
  }
  for (const [address, query] of Object.entries(snapshot['queries'])) {
    assertKnownAddress(address);
    if (!isRecord(query) || typeof query['status'] !== 'string') {
      throw new CraftSecurityError(
        'CRAFT_TRANSFER_SNAPSHOT_INVALID',
        `Invalid query entry at ${address}.`,
      );
    }
    if (
      Object.keys(query).some((key) => !['status', 'value', 'error'].includes(key)) ||
      !['idle', 'loading', 'reloading', 'resolved', 'error', 'local'].includes(
        query['status'],
      )
    ) {
      throw new CraftSecurityError(
        'CRAFT_TRANSFER_SNAPSHOT_INVALID',
        `Invalid query status or fields at ${address}.`,
      );
    }
    if ('value' in query) {
      assertSerializable(query['value'], address, new Set(), 0, maxDepth);
    }
    // Error payloads are deliberately not accepted from a secure client path.
    if (policy && 'error' in query) {
      throw new CraftSecurityError(
        'CRAFT_TRANSFER_SNAPSHOT_INVALID',
        `Query errors cannot be transferred at ${address}.`,
      );
    }
  }
  if (policy?.maxBytes !== undefined) {
    const json = JSON.stringify(snapshot);
    if (byteLength(json) > policy.maxBytes) {
      throw new CraftSecurityError(
        'CRAFT_TRANSFER_SNAPSHOT_TOO_LARGE',
        `Snapshot exceeds the ${policy.maxBytes}-byte limit.`,
      );
    }
  }
}

function assertKnownAddress(address: string): void {
  const segments = address.split(' / ');
  const last = segments.at(-1) ?? '';
  if (
    segments.some((segment) => !/^[A-Za-z][A-Za-z0-9:_#.-]*$/.test(segment)) ||
    !/^(?:state|query|mutation|asyncProcess|queryParams):[A-Za-z][A-Za-z0-9_.:-]*#\d+$/.test(
      last,
    )
  ) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_INVALID',
      `Unknown primitive address "${address}".`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertSerializable(
  value: unknown,
  address: string,
  seen: Set<object>,
  depth = 0,
  maxDepth = Number.POSITIVE_INFINITY,
): void {
  if (depth > maxDepth) {
    throw new CraftSecurityError(
      'CRAFT_TRANSFER_SNAPSHOT_TOO_DEEP',
      `Transfer value "${address}" exceeds the depth limit.`,
    );
  }
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
    assertSerializable(child, address, seen, depth + 1, maxDepth);
  }
  seen.delete(value);
}
