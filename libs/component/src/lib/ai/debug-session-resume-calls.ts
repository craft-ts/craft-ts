import { redactDebugSessionUrl } from './debug-session-references';
import { decodeNestedJson, readResumePath } from './debug-session-resume-path';

const SERVER_FUNCTION_PATH = '/__server-functions';
const PLACEHOLDER_PATTERN = /craft-ref:([a-f0-9]{16})/gi;

/**
 * Every name a call answers to: the server-function id for the craft
 * protocol, and always `METHOD /template`, where segments that identify a
 * resource read `:ref` (`GET /carts/:ref`). A backend without craft server
 * functions is described by the second form alone.
 */
export function resumeCallNamesOf(
  method: string,
  url: string,
  body?: unknown,
  base = 'http://craft.invalid',
): readonly string[] {
  const upper = method.toUpperCase();
  let pathname: string;
  try {
    pathname = new URL(url, base).pathname;
  } catch {
    return [];
  }
  const template = redactDebugSessionUrl(pathname, '').url.split(/[?#]/)[0];
  const names = [`${upper} ${template}`];
  if (upper === 'POST' && pathname === SERVER_FUNCTION_PATH) {
    const decoded = decodeNestedJson(body);
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'id' in decoded &&
      typeof decoded.id === 'string'
    )
      names.unshift(decoded.id, `function:${decoded.id}`);
  }
  return names;
}

/** The name shown to a person: the function id when there is one. */
export function resumeCallNameOf(
  method: string,
  url: string,
  body?: unknown,
  base?: string,
): string {
  return resumeCallNamesOf(method, url, body, base)[0] ?? `${method} ${url}`;
}

/** Recorded placeholders (`craft-ref:<fingerprint>`) carried by a text. */
export function resumePlaceholdersOf(text: string): readonly string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]!.toLowerCase()))];
}

/** Replaces every placeholder the resolver knows; reports the others. */
export function substituteResumePlaceholders(
  text: string,
  resolve: (fingerprint: string) => string | undefined,
): Readonly<{ text: string; missing: readonly string[] }> {
  const missing = new Set<string>();
  const replaced = text.replace(PLACEHOLDER_PATTERN, (placeholder, fingerprint: string) => {
    const value = resolve(fingerprint.toLowerCase());
    if (value === undefined) {
      missing.add(fingerprint.toLowerCase());
      return placeholder;
    }
    return value;
  });
  return { text: replaced, missing: [...missing] };
}

/**
 * A JSON value inside a JSON string must stay escaped: the placeholder sits
 * between quotes, so the replacement is the escaped value without them.
 */
export function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

export type ResumeOutcomeComparison = Readonly<{
  matched: boolean;
  detail: string;
}>;

/** Compares a live answer with the archived one: status, then the declared paths. */
export function compareResumeOutcome(
  expected: Readonly<{
    status?: number;
    match?: readonly (readonly (string | number)[])[];
    recordedBody?: unknown;
  }>,
  actual: Readonly<{ status: number; body: unknown }>,
): ResumeOutcomeComparison {
  if (expected.status !== undefined && expected.status !== actual.status)
    return {
      matched: false,
      detail: `${expected.status} attendu, ${actual.status} obtenu`,
    };
  const recorded = decodeNestedJson(expected.recordedBody);
  const live = decodeNestedJson(actual.body);
  for (const path of expected.match ?? []) {
    const jsonPath = `$${path.map((key) => (typeof key === 'number' ? `[${key}]` : `[${JSON.stringify(key)}]`)).join('')}`;
    const before = JSON.stringify(readResumePath(recorded, jsonPath));
    const after = JSON.stringify(readResumePath(live, jsonPath));
    if (before !== after)
      return {
        matched: false,
        detail: `${path.join('.')} : ${before} attendu, ${after} obtenu`,
      };
  }
  return {
    matched: true,
    detail:
      expected.status === undefined
        ? `${actual.status} obtenu, conforme`
        : `${expected.status} attendu, ${actual.status} obtenu`,
  };
}
