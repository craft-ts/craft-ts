import type { SendContextReplayExport } from '@craft-ts/core';
import type { ResumeOverride } from './debug-session-resume-executor';

export type ResumeOverrideValidationIssue = Readonly<{
  call: string;
  reason: 'missing-recorded-response' | 'response-shape-mismatch';
}>;

/** Accepts only unique, frozen, data-only call replacements or JSON merge patches. */
export function isDebugSessionResumeOverrideList(
  value: unknown,
): value is readonly ResumeOverride[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (override) =>
        typeof override === 'object' &&
        override !== null &&
        'call' in override &&
        typeof override.call === 'string' &&
        override.call.length > 0 &&
        'frozen' in override &&
        override.frozen === true &&
        (!('status' in override) ||
          (Number.isInteger(override.status) &&
            Number(override.status) >= 200 &&
            Number(override.status) <= 599)) &&
        Object.hasOwn(override, 'response') !==
          Object.hasOwn(override, 'patch'),
    )
  )
    return false;
  const calls = value.map((override) => override.call);
  return new Set(calls).size === calls.length;
}

/**
 * Uses a captured response as a fallback schema when no API schema is
 * available. Values may change, but JSON types and object keys must match.
 */
export function validateDebugSessionResumeOverrides(
  archive: SendContextReplayExport,
  overrides: readonly ResumeOverride[],
): readonly ResumeOverrideValidationIssue[] {
  const requests = new Map<string, ReadonlySet<string>>();
  const responses = new Map<string, unknown>();
  for (const event of archive.events) {
    if (event.kind !== 'http' || !event.operationId) continue;
    const operationKey = `${event.participantId ?? ''}:${event.operationId}`;
    if (event.phase === 'started') {
      requests.set(operationKey, capturedCallNames(event.payload));
      continue;
    }
    if (event.phase !== 'succeeded') continue;
    const body = isRecord(event.response) ? event.response['body'] : undefined;
    const parsed = parseJsonBody(body);
    if (parsed !== undefined) responses.set(operationKey, parsed);
  }

  return overrides.flatMap<ResumeOverrideValidationIssue>((override) => {
    const operationId = [...requests].find(([, names]) =>
      names.has(override.call),
    )?.[0];
    const recorded = operationId ? responses.get(operationId) : undefined;
    if (recorded === undefined)
      return [{ call: override.call, reason: 'missing-recorded-response' }];
    const candidate = Object.hasOwn(override, 'response')
      ? override.response
      : applyResumeJsonPatch(recorded, override.patch);
    return sameJsonShape(recorded, candidate)
      ? []
      : [{ call: override.call, reason: 'response-shape-mismatch' }];
  });
}

function capturedCallNames(payload: unknown): ReadonlySet<string> {
  if (typeof payload !== 'object' || payload === null) return new Set();
  const value = payload as Record<string, unknown>;
  const method = typeof value['method'] === 'string' ? value['method'] : '';
  const url = typeof value['url'] === 'string' ? value['url'] : '';
  const names = new Set<string>();
  if (method && url) {
    let pathname = url;
    try {
      pathname = new URL(url, 'http://craft.invalid').pathname;
    } catch {
      // Keep the captured URL as a fallback for nonstandard URL strings.
    }
    names.add(`${method.toUpperCase()} ${pathname}`);
    names.add(pathname);
  }
  const body = parseJsonBody(value['body']);
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    typeof body.id === 'string'
  ) {
    names.add(body.id);
    names.add(`function:${body.id}`);
  }
  return names;
}

function parseJsonBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameJsonShape(recorded: unknown, candidate: unknown): boolean {
  if (recorded === null || candidate === null) return recorded === candidate;
  if (Array.isArray(recorded))
    return (
      Array.isArray(candidate) &&
      (recorded.length === 0 ||
        candidate.every((item) => sameJsonShape(recorded[0], item)))
    );
  if (Array.isArray(candidate)) return false;
  if (typeof recorded === 'object') {
    if (typeof candidate !== 'object' || candidate === null) return false;
    const recordedKeys = Object.keys(recorded);
    const candidateKeys = Object.keys(candidate);
    return (
      recordedKeys.length === candidateKeys.length &&
      recordedKeys.every(
        (key) =>
          Object.hasOwn(candidate, key) &&
          sameJsonShape(
            (recorded as Record<string, unknown>)[key],
            (candidate as Record<string, unknown>)[key],
          ),
      )
    );
  }
  return typeof recorded === typeof candidate;
}

/** Stable call names used by saved overrides: function id, method/path, or path. */
export async function resumeCallNames(
  request: Request,
): Promise<readonly string[]> {
  const url = new URL(request.url);
  const names = [`${request.method} ${url.pathname}`, url.pathname];
  if (url.pathname === '/__server-functions') {
    try {
      const body: unknown = await request.clone().json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'id' in body &&
        typeof body.id === 'string'
      )
        names.push(body.id, `function:${body.id}`);
    } catch {
      // Invalid function calls cannot match a saved override.
    }
  }
  return names;
}

/** Applies an override before the transport barrier decides how to handle a call. */
export async function applyDebugSessionResumeOverride(
  request: Request,
  nativeFetch: typeof fetch,
  overrides: readonly ResumeOverride[],
): Promise<
  Readonly<{ response: Response; override?: ResumeOverride }> | undefined
> {
  const names = await resumeCallNames(request);
  const override = overrides.find(
    (candidate) => candidate.frozen === true && names.includes(candidate.call),
  );
  if (!override) return undefined;
  if (Object.hasOwn(override, 'response')) {
    const status = override.status ?? 200;
    const body = [204, 205, 304].includes(status)
      ? null
      : JSON.stringify(override.response);
    return {
      override,
      response: new Response(body, {
        status,
        headers:
          body === null ? undefined : { 'content-type': 'application/json' },
      }),
    };
  }

  const response = await nativeFetch.call(globalThis, request);
  if (!response.ok || [204, 205, 304].includes(response.status))
    return { response };
  try {
    const original: unknown = await response.clone().json();
    const patched = applyResumeJsonPatch(original, override.patch);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    const status = override.status ?? response.status;
    const body = [204, 205, 304].includes(status)
      ? null
      : JSON.stringify(patched);
    return {
      response: new Response(body, {
        status,
        statusText: response.statusText,
        headers: body === null ? undefined : headers,
      }),
      override,
    };
  } catch {
    return { response };
  }
}

/** RFC 7396-style recursive JSON merge patch. */
export function applyResumeJsonPatch(value: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
    return patch;
  const result: Record<string, unknown> =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ...value }
      : {};
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === null) delete result[key];
    else result[key] = applyResumeJsonPatch(result[key], patchValue);
  }
  return result;
}
