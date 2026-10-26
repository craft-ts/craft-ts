import type { SendContextReplayExport } from '@craft-ts/core';
import { buildDebugAppSnapshot } from './debug-session-app-snapshot';
import {
  callNamesOf,
  type DebugSessionResumePlan,
} from './debug-session-resume-plan';
import { decodeNestedJson, readResumePath } from './debug-session-resume-path';

export type ResumeManifestLevel = 'required' | 'expected' | 'informational';

export interface DebugSessionResumeManifestEntry {
  readonly level: ResumeManifestLevel;
  readonly kind: 'call' | 'reference' | 'entity' | 'persona' | 'outcome';
  readonly name: string;
  readonly detail?: string;
}

export interface DebugSessionResumeManifest {
  readonly format: 'craft-debug-session-resume-manifest';
  readonly version: 1;
  readonly entries: readonly DebugSessionResumeManifestEntry[];
  readonly checklistMarkdown: string;
}

/**
 * Builds a staging checklist from the preflight plan. Backend facts come only
 * from the declarations' `entities`: those found in restored application
 * state (`restores`, `holds`) are required, those only seen in server lists
 * are expected. Every acquisition needs a persona of its role.
 */
export function buildDebugSessionResumeManifest(
  plan: DebugSessionResumePlan,
  archive: SendContextReplayExport,
): DebugSessionResumeManifest {
  const entries: DebugSessionResumeManifestEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: DebugSessionResumeManifestEntry) => {
    const key = `${entry.kind}\0${entry.name}\0${entry.detail ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };
  const required = new Set<string>();
  const entityKey = (kind: string, name: string) => `${kind}\0${name}`;
  const beforeSequence = archive.events
    .filter(
      (event) =>
        (event.globalElapsedMs ?? event.elapsedMs ?? 0) > plan.targetElapsedMs,
    )
    .reduce<number | undefined>(
      (first, event) =>
        first === undefined || event.sequence < first ? event.sequence : first,
      undefined,
    );
  const restored = buildDebugAppSnapshot(archive, beforeSequence).primitives;
  const restoredValueOf = (address: string) => {
    const wanted = ordinalFree(address);
    const key = Object.keys(restored).find(
      (candidate) => ordinalFree(candidate) === wanted,
    );
    return key === undefined ? undefined : restored[key];
  };
  for (const source of plan.entities ?? []) {
    if (source.role !== 'restores' && source.role !== 'holds') continue;
    for (const id of entityIdsAt(restoredValueOf(source.primitive), source.path)) {
      required.add(entityKey(source.kind, id));
      add({ level: 'required', kind: 'entity', name: id, detail: source.kind });
    }
  }
  const listed = (plan.entities ?? []).filter(
    (source) => source.role !== 'restores' && source.role !== 'holds',
  );
  const addExpected = (kind: string, id: string) => {
    if (!required.has(entityKey(kind, id)))
      add({ level: 'expected', kind: 'entity', name: id, detail: kind });
  };
  for (const source of listed)
    for (const id of entityIdsAt(restoredValueOf(source.primitive), source.path))
      addExpected(source.kind, id);
  const started = new Map<string, ReadonlySet<string>>();
  for (const event of archive.events) {
    if ((event.globalElapsedMs ?? event.elapsedMs ?? 0) > plan.targetElapsedMs) continue;
    if (event.kind !== 'http' || !event.operationId) continue;
    const key = `${event.participantId ?? ''}:${event.operationId}`;
    if (event.phase === 'started') {
      started.set(key, callNamesOf(event.payload));
      continue;
    }
    if (event.phase !== 'succeeded') continue;
    const names = started.get(key);
    const response = isRecord(event.response) ? event.response['body'] : undefined;
    for (const source of listed) {
      if (!names || !(source.calls ?? []).some((call) => names.has(call))) continue;
      for (const id of entityIdsAt(decodeNestedJson(response), source.path))
        addExpected(source.kind, id);
    }
  }
  for (const step of plan.steps) {
    if (step.kind !== 'acquire' || step.unneeded || !step.persona) continue;
    add({
      level: 'required',
      kind: 'persona',
      name: step.persona,
      ...(step.personaId ? { detail: step.personaId } : {}),
    });
  }
  for (const call of plan.expectedCalls) {
    entries.push({ level: 'expected', kind: 'call', name: call });
  }
  for (const outcome of plan.expectedOutcomes ?? []) {
    entries.push({
      level: 'expected',
      kind: 'outcome',
      name: outcome.call,
      detail:
        outcome.status === undefined
          ? 'un résultat archivé est attendu'
          : `résultat HTTP ${outcome.status} archivé attendu`,
    });
  }
  const seenReferences = new Set<string>();
  for (const event of archive.events) {
    if ((event.globalElapsedMs ?? event.elapsedMs ?? 0) > plan.targetElapsedMs) continue;
    for (const ref of event.refs ?? []) {
      const key = `${ref.direction}:${ref.fingerprint}`;
      if (seenReferences.has(key)) continue;
      seenReferences.add(key);
      entries.push({
        // Fingerprints describe provenance; only read-only backend facts are
        // preflight requirements. An outgoing token is reacquired by its
        // provider and cannot be checked by looking up the fingerprint.
        level: 'informational',
        kind: 'reference',
        name: ref.fingerprint,
        detail: `${ref.direction} · ${ref.path}`,
      });
    }
  }
  for (const problem of plan.problems) {
    entries.push({
      level: problem.blocking ? 'required' : 'informational',
      kind: 'outcome',
      name: problem.code,
      detail: problem.message,
    });
  }
  const checklistMarkdown = [
    '# Pré-vol de reprise',
    '',
    `Point ciblé : ${plan.targetElapsedMs} ms`,
    '',
    ...entries.map((entry) => {
      const detail = entry.detail ? ` — ${entry.detail}` : '';
      return `- [ ] **${entry.level} · ${entry.kind}** ${entry.name}${detail}`;
    }),
    '',
    `Plan : ${plan.status === 'ready' ? 'prêt' : 'refusé'}`,
  ].join('\n');
  return {
    format: 'craft-debug-session-resume-manifest',
    version: 1,
    entries,
    checklistMarkdown,
  };
}

/** String or number ids at a declared path; placeholders are not ids. */
function entityIdsAt(value: unknown, path: string): readonly string[] {
  return readResumePath(value, path).flatMap((id) =>
    (typeof id === 'string' && id && !id.startsWith('craft-ref:')) ||
    typeof id === 'number'
      ? [String(id)]
      : [],
  );
}

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
