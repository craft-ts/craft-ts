import type { SendContextReplayExport } from '@craft-ts/core';
import type { DebugSessionResumePlan } from './debug-session-resume-plan';

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

/** Builds a staging checklist from the preflight plan without exposing secrets. */
export function buildDebugSessionResumeManifest(
  plan: DebugSessionResumePlan,
  archive: SendContextReplayExport,
): DebugSessionResumeManifest {
  const entries: DebugSessionResumeManifestEntry[] = [];
  const seenFacts = new Set<string>();
  const addRequiredFact = (kind: 'product' | 'category', name: unknown) => {
    if (typeof name !== 'string' || !name) return;
    const key = `${kind}\0${name}`;
    if (seenFacts.has(key)) return;
    seenFacts.add(key);
    entries.push({ level: 'required', kind: 'entity', name, detail: kind });
  };
  const started = new Map<string, Readonly<{ id?: string; input?: unknown }>>();
  for (const event of archive.events) {
    if ((event.globalElapsedMs ?? event.elapsedMs ?? 0) > plan.targetElapsedMs) continue;
    const payload = isRecord(event.payload) ? event.payload : undefined;
    if (event.kind === 'http' && event.phase === 'started' &&
        typeof event.operationId === 'string' && payload?.['source'] === 'browser-fetch') {
      const requestBody = parseNestedJson(payload['body']);
      if (isRecord(requestBody)) {
        started.set(event.operationId, {
          ...(typeof requestBody['id'] === 'string' ? { id: requestBody['id'] } : {}),
          input: requestBody['input'],
        });
      }
    }
    if (event.kind !== 'http' || event.phase !== 'succeeded' || !event.operationId) continue;
    const request = started.get(event.operationId);
    if (!request?.id) continue;
    const response = isRecord(event.response) ? event.response['body'] : event.response;
    const value = parseNestedJson(response);
    if (!isRecord(value)) continue;
    if (request.id === 'ecommerce.catalog' || request.id === 'ecommerce.admin.overview') {
      for (const product of Array.isArray(value['products']) ? value['products'] : [])
        if (isRecord(product)) addRequiredFact('product', product['id']);
      for (const category of Array.isArray(value['categories']) ? value['categories'] : [])
        if (isRecord(category)) addRequiredFact('category', category['id']);
    }
    if (request.id === 'ecommerce.cart.get' || request.id === 'ecommerce.cart.addLine') {
      const lines = Array.isArray(value['lines']) ? value['lines'] : [];
      for (const line of lines) if (isRecord(line)) addRequiredFact('product', line['productId']);
    }
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
      const box = entry.level === 'required' ? '[ ]' : '[ ]';
      const detail = entry.detail ? ` — ${entry.detail}` : '';
      return `- ${box} **${entry.level} · ${entry.kind}** ${entry.name}${detail}`;
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

function parseNestedJson(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      break;
    }
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
