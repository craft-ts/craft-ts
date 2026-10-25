import type { DebugSessionResumeManifest } from './debug-session-resume-manifest';

export interface ResumePreflightFact {
  readonly kind: string;
  readonly name: string;
  readonly detail?: string;
}

export interface ResumePreflightResult {
  readonly status: 'passed' | 'failed';
  readonly checked: readonly ResumePreflightFact[];
  readonly missing: readonly ResumePreflightFact[];
}

export interface ResumePreflightAdapter {
  /** The adapter exposes reads only; implementations must not mutate the backend. */
  readFacts(
    manifest: DebugSessionResumeManifest,
  ): Promise<readonly ResumePreflightFact[]>;
  /** Identifies the exact network requests allowed while replay blocks fetch. */
  isReadOnlyRequest?(request: Request): boolean | Promise<boolean>;
}

/**
 * Compares the required manifest facts with a read-only backend inventory.
 * The adapter contract intentionally exposes a single read operation: the
 * executor cannot perform writes during preflight.
 */
export async function runDebugSessionResumePreflight(
  manifest: DebugSessionResumeManifest,
  adapter: ResumePreflightAdapter,
): Promise<ResumePreflightResult> {
  const actual = await adapter.readFacts(manifest);
  const actualKeys = new Set(actual.map(factKey));
  const required = manifest.entries
    .filter((entry) => entry.level === 'required')
    .map(({ kind, name, detail }) => ({
      kind,
      name,
      ...(detail ? { detail } : {}),
    }));
  const missing = required.filter((fact) => !actualKeys.has(factKey(fact)));
  return {
    status: missing.length === 0 ? 'passed' : 'failed',
    checked: required,
    missing,
  };
}

/** Structural guard for the message boundary between an app and its dashboard. */
export function isDebugSessionResumeManifest(
  value: unknown,
): value is DebugSessionResumeManifest {
  if (
    !isRecord(value) ||
    value['format'] !== 'craft-debug-session-resume-manifest' ||
    value['version'] !== 1 ||
    !Array.isArray(value['entries']) ||
    typeof value['checklistMarkdown'] !== 'string'
  )
    return false;
  return value['entries'].every(
    (entry) =>
      isRecord(entry) &&
      ['required', 'expected', 'informational'].includes(
        String(entry['level']),
      ) &&
      ['call', 'reference', 'entity', 'persona', 'outcome'].includes(
        String(entry['kind']),
      ) &&
      typeof entry['name'] === 'string' &&
      (entry['detail'] === undefined || typeof entry['detail'] === 'string'),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function factKey(fact: ResumePreflightFact): string {
  return `${fact.kind}\0${fact.name}\0${fact.detail ?? ''}`;
}
