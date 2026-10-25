export interface DebugSessionReference {
  readonly path: string;
  readonly fingerprint: string;
  readonly direction: 'out' | 'in';
}

export interface DebugSessionReferenceCandidate {
  readonly path: string;
  readonly value: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^(?:bearer\s+)?[A-Za-z0-9_~+/=-]{20,}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const CODE_NAME_PATTERN = /^[A-Za-z][a-z]+(?:[A-Z][a-z]+)+$/;
/** `id`, `cartId`, `cart_id`, `productID`. */
const IDENTIFIER_FIELD_PATTERN = /^(?:id|.*[a-z0-9]I[dD]|.*_id)$/;
const SENSITIVE_HEADER_PATTERN =
  /^(?:authorization|cookie|set-cookie|proxy-authorization|.*(?:token|secret|api[-_]key).*)$/i;
const sessionSalts = new WeakMap<object, string>();
let fallbackSaltSequence = 0;

/** Shares one per-session salt across fetch, XHR, and later reference capture. */
export function getDebugSessionReferenceSalt(session: object): string {
  const existing = sessionSalts.get(session);
  if (existing) return existing;
  const bytes = new Uint8Array(16);
  const salt =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? (crypto.getRandomValues(bytes),
        [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
      : `session-${++fallbackSaltSequence}`;
  sessionSalts.set(session, salt);
  return salt;
}

/** Finds UUIDs and opaque, high-entropy string leaves without mutating input. */
export function extractReferenceCandidates(
  value: unknown,
  path = '$',
): readonly DebugSessionReferenceCandidate[] {
  const candidates: DebugSessionReferenceCandidate[] = [];
  const visit = (current: unknown, currentPath: string): void => {
    if (typeof current === 'string') {
      if (isReferenceValue(current, currentPath))
        candidates.push({ path: currentPath, value: current });
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}[${index}]`));
      return;
    }
    if (isRecord(current)) {
      for (const [key, item] of Object.entries(current)) {
        visit(item, `${currentPath}.${escapePathKey(key)}`);
      }
    }
  };
  visit(value, path);
  return candidates;
}

/** Returns the stable session-local fingerprint used by archive placeholders. */
export function fingerprintDebugSessionReference(
  value: string,
  sessionSalt: string,
): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(`${sessionSalt}\u0000${value}`);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/** JSON text nested in a JSON string is followed this many times at most. */
const MAX_NESTED_JSON_DEPTH = 3;

/**
 * Replaces recognized references recursively, preserving repeated identity.
 * A string that holds JSON (a server function answers a JSON string) is
 * decoded, traversed at the same path, then encoded back. `tracedKeys` are
 * the last keys of declared resume paths: a number there is traced too (a
 * numeric `cartId`), and a slug there may be a reference.
 */
export function redactDebugSessionReferences(
  value: unknown,
  sessionSalt: string,
  path = '$',
  direction: 'out' | 'in' = 'out',
  options: Readonly<{ tracedKeys?: ReadonlySet<string> }> = {},
): Readonly<{ value: unknown; refs: readonly DebugSessionReference[] }> {
  const refs: DebugSessionReference[] = [];
  const traced = (currentPath: string) => {
    const key = lastPathKey(currentPath);
    return key !== undefined && options.tracedKeys?.has(key) === true;
  };
  const replace = (current: string | number, currentPath: string) => {
    const fingerprint = fingerprintDebugSessionReference(
      String(current),
      sessionSalt,
    );
    refs.push({ path: currentPath, fingerprint, direction });
    return `craft-ref:${fingerprint}`;
  };
  let nesting = 0;
  const visit = (current: unknown, currentPath: string): unknown => {
    if (typeof current === 'number' && Number.isFinite(current) && traced(currentPath))
      return replace(current, currentPath);
    if (typeof current === 'string') {
      if (PLACEHOLDER_VALUE.test(current)) return current;
      if (nesting < MAX_NESTED_JSON_DEPTH) {
        const nested = decodeNestedJsonText(current, MAX_NESTED_JSON_DEPTH - nesting);
        if (nested) {
          nesting += nested.levels;
          let encoded = visit(nested.value, currentPath);
          nesting -= nested.levels;
          for (let level = 0; level < nested.levels; level += 1)
            encoded = JSON.stringify(encoded);
          return encoded;
        }
      }
      if (
        isReferenceValue(current, currentPath, traced(currentPath)) ||
        isSensitivePath(currentPath)
      )
        return replace(current, currentPath);
      return current;
    }
    if (Array.isArray(current)) {
      return current.map((item, index) =>
        visit(item, `${currentPath}[${index}]`),
      );
    }
    if (isRecord(current)) {
      return Object.fromEntries(
        Object.entries(current).map(([key, item]) => [
          key,
          visit(item, `${currentPath}.${escapePathKey(key)}`),
        ]),
      );
    }
    return current;
  };
  return { value: visit(value, path), refs };
}

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key/i;
const PLACEHOLDER_VALUE = /^craft-ref:[a-f0-9]{16}$/i;

/**
 * Wraps the event redactor so that a sensitive field (a token in a primitive
 * state, a checkpoint, a payload) becomes this session's placeholder rather
 * than `[REDACTED]`. A restored app then carries the same `craft-ref:` as the
 * recorded storage and requests, and the resume can substitute it.
 */
export function createDebugSessionReferenceRedactor<Context>(
  fallback: (value: unknown, context: Context) => unknown,
): Readonly<{
  redactor: (value: unknown, context: Context) => unknown;
  bind(session: object): void;
}> {
  let salt: string | undefined;
  const fingerprintSensitive = (value: unknown, sessionSalt: string) => {
    const seen = new WeakSet<object>();
    const visit = (current: unknown): unknown => {
      if (Array.isArray(current)) {
        if (seen.has(current)) return current;
        seen.add(current);
        return current.map(visit);
      }
      if (!isRecord(current)) return current;
      if (seen.has(current)) return current;
      seen.add(current);
      return Object.fromEntries(
        Object.entries(current).map(([key, entry]) => [
          key,
          typeof entry === 'string' &&
          SENSITIVE_KEY_PATTERN.test(key) &&
          !PLACEHOLDER_VALUE.test(entry)
            ? `craft-ref:${fingerprintDebugSessionReference(entry, sessionSalt)}`
            : visit(entry),
        ]),
      );
    };
    return visit(value);
  };
  return {
    redactor: (value, context) =>
      fallback(salt ? fingerprintSensitive(value, salt) : value, context),
    bind(session) {
      salt = getDebugSessionReferenceSalt(session);
    },
  };
}

/** Masks sensitive header values even when they are short or low entropy. */
export function redactDebugSessionHeaders(
  headers: Headers | Readonly<Record<string, string>>,
  sessionSalt: string,
  direction: 'out' | 'in',
): Readonly<{
  headers: Readonly<Record<string, string>>;
  refs: readonly DebugSessionReference[];
}> {
  const entries =
    headers instanceof Headers
      ? [...headers.entries()]
      : Object.entries(headers);
  const refs: DebugSessionReference[] = [];
  const output: Record<string, string> = {};
  for (const [name, rawValue] of entries) {
    const value = String(rawValue);
    const fingerprint = fingerprintDebugSessionReference(
      normalizeHeaderReference(name, value),
      sessionSalt,
    );
    if (SENSITIVE_HEADER_PATTERN.test(name) || isReferenceValue(value)) {
      output[name] = `craft-ref:${fingerprint}`;
      refs.push({
        path: `headers.${name.toLowerCase()}`,
        fingerprint,
        direction,
      });
    } else {
      output[name] = value;
    }
  }
  return { headers: output, refs };
}

function normalizeHeaderReference(name: string, value: string): string {
  if (/^(?:authorization|proxy-authorization)$/i.test(name)) {
    return value.replace(/^(?:bearer|basic)\s+/i, '');
  }
  return value;
}

/** Replaces URL path segments and query values that identify resources. */
export function redactDebugSessionUrl(
  url: string,
  sessionSalt: string,
): Readonly<{ url: string; refs: readonly DebugSessionReference[] }> {
  try {
    const parsed = new URL(url, 'http://craft.invalid');
    const refs: DebugSessionReference[] = [];
    parsed.pathname = parsed.pathname
      .split('/')
      .map((segment, index) => {
        if (!segment || !isReferenceValue(decodeURIComponentSafe(segment)))
          return segment;
        const fingerprint = fingerprintDebugSessionReference(
          decodeURIComponentSafe(segment),
          sessionSalt,
        );
        refs.push({
          path: `url.pathname[${index}]`,
          fingerprint,
          direction: 'out',
        });
        return ':ref';
      })
      .join('/');
    for (const [key, value] of [...parsed.searchParams.entries()]) {
      if (!isReferenceValue(value)) continue;
      const fingerprint = fingerprintDebugSessionReference(value, sessionSalt);
      refs.push({
        path: `url.search.${escapePathKey(key)}`,
        fingerprint,
        direction: 'out',
      });
      parsed.searchParams.set(key, `craft-ref:${fingerprint}`);
    }
    const formatted =
      parsed.origin === 'http://craft.invalid'
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : parsed.toString();
    return { url: formatted, refs };
  } catch {
    return { url, refs: [] };
  }
}

/** Redacts opaque values in application/x-www-form-urlencoded data. */
export function redactDebugSessionUrlEncoded(
  value: string,
  sessionSalt: string,
  path: string,
  direction: 'out' | 'in',
): Readonly<{ value: string; refs: readonly DebugSessionReference[] }> {
  const params = new URLSearchParams(value);
  const refs: DebugSessionReference[] = [];
  for (const [name, rawValue] of [...params.entries()]) {
    if (!isReferenceValue(rawValue, `${path}.${escapePathKey(name)}`)) continue;
    const fingerprint = fingerprintDebugSessionReference(rawValue, sessionSalt);
    refs.push({
      path: `${path}.${escapePathKey(name)}`,
      fingerprint,
      direction,
    });
    params.set(name, `craft-ref:${fingerprint}`);
  }
  return { value: params.toString(), refs };
}

function isReferenceValue(value: string, path = '', declared = false): boolean {
  if (UUID_PATTERN.test(value)) return true;
  if (isSensitivePath(path)) return true;
  if (value.length > 512) return false;
  const field = lastPathKey(path) ?? '';
  // Prose is never an identifier; words joined by dashes (a slug) or by
  // case (a code name) only are in a field that names an identifier.
  if (/\s/.test(value.replace(/^bearer\s+/i, ''))) return false;
  if (
    (SLUG_PATTERN.test(value) || CODE_NAME_PATTERN.test(value)) &&
    !declared &&
    !IDENTIFIER_FIELD_PATTERN.test(field)
  )
    return false;
  const entropy = shannonEntropy(value);
  if (value.length >= 20 && TOKEN_PATTERN.test(value) && entropy >= 3.2) {
    return true;
  }
  const identifierField = [
    'id',
    'ref',
    'token',
    'key',
    'session',
    'cart',
    'user',
  ].some((suffix) => {
    const start = field.length - suffix.length;
    const firstSuffixCharacter = field[start];
    return (
      field.toLowerCase() === suffix ||
      (start >= 0 &&
        field.slice(start).toLowerCase() === suffix &&
        (firstSuffixCharacter === firstSuffixCharacter?.toUpperCase() ||
          /[_-]/.test(field[start - 1] ?? '')))
    );
  });
  return (
    value.length >= 12 &&
    identifierField &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    entropy >= 2.8
  );
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value)
    counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePathKey(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value)
    ? value
    : `[${JSON.stringify(value)}]`;
}

/** `token`, `accessToken`, `access_token`, `clientSecret`, `client_secret`… */
function isSensitivePath(path: string): boolean {
  const key = lastPathKey(path);
  if (key === undefined) return false;
  return (
    /^(?:authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|private[-_]?key)$/i.test(
      key,
    ) ||
    /[a-z0-9](?:Token|Secret)$/.test(key) ||
    /[_-](?:token|secret)$/i.test(key)
  );
}

/** The last property name of a reference path (`token` for `$.session.token`). */
export function lastPathKey(path: string): string | undefined {
  const match = /(?:\.([^.[\]]+)|\[("(?:[^"\\]|\\.)*")\])$/.exec(path);
  if (!match) return undefined;
  if (match[1] !== undefined) return match[1];
  try {
    return JSON.parse(match[2]!) as string;
  } catch {
    return undefined;
  }
}

/** Decodes a JSON object or array, possibly encoded several times, from a string. */
function decodeNestedJsonText(
  text: string,
  maxLevels: number,
): Readonly<{ value: unknown; levels: number }> | undefined {
  let current: unknown = text;
  let levels = 0;
  while (levels < maxLevels && typeof current === 'string') {
    const trimmed = current.trim();
    if (!/^[[{"]/.test(trimmed)) return undefined;
    try {
      current = JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
    levels += 1;
  }
  return typeof current === 'object' && current !== null
    ? { value: current, levels }
    : undefined;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
