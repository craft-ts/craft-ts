import type { SessionTrace, SessionTraceStep } from './debug-session-trace.js';

export type SessionTraceFinding =
  | Readonly<{ kind: 'missing-invariant'; expected: SessionTraceStep; afterStep?: SessionTraceStep }>
  | Readonly<{ kind: 'changed-invariant'; expected: SessionTraceStep; observed: SessionTraceStep; fields: readonly string[] }>
  | Readonly<{ kind: 'new-step'; observed: SessionTraceStep; severity: 'error' | 'info' }>
  | Readonly<{ kind: 'timing'; step: SessionTraceStep; observedMs: number; baselineRangeMs: readonly [number, number] }>;
export type SessionTraceComparison = Readonly<{
  baselineCount: number; firstDivergence?: SessionTraceFinding; findings: readonly SessionTraceFinding[]; noise: readonly SessionTraceStep[];
}>;

export function compareSessionTraces(
  observed: SessionTrace,
  baselines: readonly SessionTrace[],
): SessionTraceComparison {
  if (baselines.length === 0) return { baselineCount: 0, findings: [], noise: [] };
  const reference = baselines[0]!.steps;
  let aligned: Array<{ referenceIndex: number; baselineIndices: number[] }> = reference.map((_, referenceIndex) => ({ referenceIndex, baselineIndices: [referenceIndex] }));
  for (const baseline of baselines.slice(1)) {
    const pairs = lcsPairs(reference, baseline.steps);
    const byReference = new Map(pairs.map(([referenceIndex, baselineIndex]) => [referenceIndex, baselineIndex]));
    aligned = aligned.flatMap((item) => {
      const baselineIndex = byReference.get(item.referenceIndex);
      return baselineIndex === undefined ? [] : [{ referenceIndex: item.referenceIndex, baselineIndices: [...item.baselineIndices, baselineIndex] }];
    });
  }
  const invariantReferenceIndices = new Set(aligned.map((item) => item.referenceIndex));
  const common = aligned.map(({ referenceIndex, baselineIndices }) => ({
    expected: reference[referenceIndex]!,
    references: baselineIndices.map((index, baselineIndex) => baselines[baselineIndex]!.steps[index]!),
  }));
  const noise = reference.filter((_, index) => !invariantReferenceIndices.has(index));
  const findings: SessionTraceFinding[] = [];
  const observedPairs = new Map(lcsPairs(common.map((item) => item.expected), observed.steps).map(([invariantIndex, observedIndex]) => [invariantIndex, observedIndex]));
  for (const [invariantIndex, item] of common.entries()) {
    const expected = item.expected;
    const index = observedPairs.get(invariantIndex);
    if (index === undefined) { findings.push({ kind: 'missing-invariant', expected }); continue; }
    const actual = observed.steps[index]!;
    const variableFields = Object.keys(expected.detail).filter((field) => item.references.some((step) => JSON.stringify(step.detail[field]) !== JSON.stringify(item.references[0]?.detail[field])));
    const fields = Object.keys(expected.detail).filter((field) => !variableFields.includes(field) && JSON.stringify(expected.detail[field]) !== JSON.stringify(actual.detail[field]));
    if (fields.length) findings.push({ kind: 'changed-invariant', expected, observed: actual, fields });
    const times = item.references.map((step) => step.elapsedMs);
    const min = Math.min(...times), max = Math.max(...times);
    if (actual.elapsedMs > max * 2 && actual.elapsedMs > max + 500) findings.push({ kind: 'timing', step: actual, observedMs: actual.elapsedMs, baselineRangeMs: [min, max] });
  }
  const knownKeys = new Set(baselines.flatMap((baseline) => baseline.steps.map((step) => step.key)));
  for (const step of observed.steps) if (!knownKeys.has(step.key)) findings.push({ kind: 'new-step', observed: step, severity: step.kind === 'exception' || step.kind === 'console-error' || (step.kind === 'http' && Number(step.detail['status']) >= 400) ? 'error' : 'info' });
  const firstDivergence = findings.find((finding) => finding.kind === 'missing-invariant' || finding.kind === 'changed-invariant') ?? findings.find((finding) => finding.kind === 'new-step' && finding.severity === 'error');
  return { baselineCount: baselines.length, ...(firstDivergence ? { firstDivergence } : {}), findings, noise };
}

function lcsPairs(left: readonly SessionTraceStep[], right: readonly SessionTraceStep[]): Array<[number, number]> {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const table = Array.from({ length: rows }, () => new Uint32Array(columns));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1)
    table[i]![j] = left[i]?.key === right[j]?.key ? 1 + table[i + 1]![j + 1]! : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const pairs: Array<[number, number]> = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i]?.key === right[j]?.key) { pairs.push([i, j]); i += 1; j += 1; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
    else j += 1;
  }
  return pairs;
}

export function renderSessionTraceComparison(result: SessionTraceComparison, context: Readonly<{ testId: string; project: string }>): string {
  const first = result.firstDivergence;
  const heading = `Session comparée à ${result.baselineCount} runs verts (${context.testId} · ${context.project})`;
  if (!first) return `${heading}\n\nAucune divergence détectée.\n`;
  const line = first.kind === 'missing-invariant' ? `Invariant absent : ${first.expected.key}` : first.kind === 'changed-invariant' ? `Divergence sur ${first.expected.key}\n  attendu  ${JSON.stringify(first.expected.detail)}\n  observé  ${JSON.stringify(first.observed.detail)}` : first.kind === 'new-step' ? `Nouveau : ${first.observed.key}` : `Lenteur : ${first.step.key} ${first.observedMs} ms (historique ${first.baselineRangeMs.join('–')} ms)`;
  const notice = result.baselineCount === 1 ? '\nUne seule référence : les variations normales ne sont pas connues.' : '';
  return `${heading}\n\n${line}${notice}\n`;
}
