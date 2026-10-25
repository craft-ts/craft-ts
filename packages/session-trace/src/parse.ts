import type { SessionTraceComparison, SessionTraceFinding, SessionTraceNoise } from './compare.js';
import type { SessionTraceStep, SessionTraceStepKind } from './normalize.js';

const STEP_KINDS: ReadonlySet<string> = new Set<SessionTraceStepKind>(['route', 'interaction', 'http', 'invocation', 'checkpoint', 'marker', 'exception']);

/**
 * A comparison read from JSON (the log server's answer, an attachment), rebuilt
 * field by field: undefined when anything does not have the expected shape.
 */
export function parseSessionTraceComparison(value: unknown): SessionTraceComparison | undefined {
  if (!isRecord(value) || !isCount(value['baselineCount']) || !Array.isArray(value['findings']) || !Array.isArray(value['noise'])) return undefined;
  const findings = value['findings'].map(parseFinding);
  const noise = value['noise'].map(parseNoise);
  if (findings.some((item) => item === undefined) || noise.some((item) => item === undefined)) return undefined;
  const firstDivergence = value['firstDivergence'] === undefined ? undefined : parseFinding(value['firstDivergence']);
  if (value['firstDivergence'] !== undefined && !firstDivergence) return undefined;
  return {
    baselineCount: value['baselineCount'],
    ...(firstDivergence ? { firstDivergence } : {}),
    findings: findings.filter((item): item is SessionTraceFinding => item !== undefined),
    noise: noise.filter((item): item is SessionTraceNoise => item !== undefined),
  };
}

export function parseSessionTraceStep(value: unknown): SessionTraceStep | undefined {
  if (!isRecord(value)) return undefined;
  const { key, kind, detail, elapsedMs, durationMs, participant, eventId } = value;
  if (typeof key !== 'string' || typeof kind !== 'string' || !STEP_KINDS.has(kind) || !isRecord(detail) || !isFiniteNumber(elapsedMs)
    || (durationMs !== undefined && !isFiniteNumber(durationMs)) || typeof participant !== 'string' || typeof eventId !== 'string') return undefined;
  return { key, kind: stepKind(kind), detail: { ...detail }, elapsedMs, ...(durationMs === undefined ? {} : { durationMs }), participant, eventId };
}

function parseFinding(value: unknown): SessionTraceFinding | undefined {
  if (!isRecord(value)) return undefined;
  const optionalStep = (name: string): { ok: boolean; step?: SessionTraceStep } => {
    if (value[name] === undefined) return { ok: true };
    const step = parseSessionTraceStep(value[name]);
    return step ? { ok: true, step } : { ok: false };
  };
  const severity = value['severity'] === 'error' || value['severity'] === 'info' ? value['severity'] : undefined;
  switch (value['kind']) {
    case 'missing-invariant': {
      const expected = parseSessionTraceStep(value['expected']);
      const after = optionalStep('afterStep');
      return expected && after.ok ? { kind: 'missing-invariant', expected, ...(after.step ? { afterStep: after.step } : {}) } : undefined;
    }
    case 'changed-invariant': {
      const expected = parseSessionTraceStep(value['expected']);
      const observed = parseSessionTraceStep(value['observed']);
      const fields = value['fields'];
      return expected && observed && Array.isArray(fields) && fields.every((field) => typeof field === 'string')
        ? { kind: 'changed-invariant', expected, observed, fields: fields.filter((field): field is string => typeof field === 'string') }
        : undefined;
    }
    case 'new-step': {
      const observed = parseSessionTraceStep(value['observed']);
      const after = optionalStep('afterExpected');
      return observed && severity && after.ok ? { kind: 'new-step', observed, severity, ...(after.step ? { afterExpected: after.step } : {}) } : undefined;
    }
    case 'extra-occurrence': {
      const observed = parseSessionTraceStep(value['observed']);
      const after = optionalStep('afterExpected');
      const { expectedCount, observedCount } = value;
      return observed && severity && after.ok && isCount(expectedCount) && isCount(observedCount)
        ? { kind: 'extra-occurrence', observed, expectedCount, observedCount, severity, ...(after.step ? { afterExpected: after.step } : {}) }
        : undefined;
    }
    case 'timing': {
      const expected = parseSessionTraceStep(value['expected']);
      const step = parseSessionTraceStep(value['step']);
      const range = value['baselineRangeMs'];
      const measure = value['measure'] === 'duration' || value['measure'] === 'gap' ? value['measure'] : undefined;
      return expected && step && measure && isFiniteNumber(value['observedMs']) && Array.isArray(range) && range.length === 2 && isFiniteNumber(range[0]) && isFiniteNumber(range[1])
        ? { kind: 'timing', expected, step, measure, observedMs: value['observedMs'], baselineRangeMs: [range[0], range[1]] }
        : undefined;
    }
    default: return undefined;
  }
}

function parseNoise(value: unknown): SessionTraceNoise | undefined {
  if (!isRecord(value) || typeof value['key'] !== 'string' || typeof value['kind'] !== 'string' || !STEP_KINDS.has(value['kind']) || !isCount(value['occurrences'])) return undefined;
  return { key: value['key'], kind: stepKind(value['kind']), occurrences: value['occurrences'] };
}

function stepKind(value: string): SessionTraceStepKind {
  switch (value) {
    case 'route': case 'interaction': case 'http': case 'invocation': case 'checkpoint': case 'marker': return value;
    default: return 'exception';
  }
}
function isCount(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
