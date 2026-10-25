import { lcsPairs } from './diff.js';
import type { SessionTrace, SessionTraceStep } from './normalize.js';

export { lcsPairs } from './diff.js';

export type SessionTraceFinding =
  | Readonly<{ kind: 'missing-invariant'; expected: SessionTraceStep; afterStep?: SessionTraceStep }>
  | Readonly<{ kind: 'changed-invariant'; expected: SessionTraceStep; observed: SessionTraceStep; fields: readonly string[] }>
  | Readonly<{ kind: 'new-step'; observed: SessionTraceStep; severity: 'error' | 'info'; afterExpected?: SessionTraceStep }>
  | Readonly<{ kind: 'extra-occurrence'; observed: SessionTraceStep; /** Highest count among the green runs. */ expectedCount: number; observedCount: number; severity: 'error' | 'info'; afterExpected?: SessionTraceStep }>
  | Readonly<{ kind: 'timing'; expected: SessionTraceStep; step: SessionTraceStep; measure: 'duration' | 'gap'; observedMs: number; baselineRangeMs: readonly [number, number] }>;
// `afterStep` (observed run) and `afterExpected` (first reference) are the last
// aligned step before a finding: where a replay of the other side is placed.
export type SessionTraceNoise = Readonly<{ key: string; kind: SessionTraceStep['kind']; occurrences: number }>;
export type SessionTraceComparison = Readonly<{
  baselineCount: number;
  firstDivergence?: SessionTraceFinding;
  /** In the order of the observed run. */
  findings: readonly SessionTraceFinding[];
  /** Reference steps not present in every green run, with their count in the first reference. */
  noise: readonly SessionTraceNoise[];
}>;

const SLOW_FACTOR = 2;
const SLOW_MARGIN_MS = 500;

export function compareSessionTraces(observed: SessionTrace, baselines: readonly SessionTrace[]): SessionTraceComparison {
  if (baselines.length === 0) return { baselineCount: 0, findings: [], noise: [] };
  const reference = baselines[0]!.steps;
  // Invariants: the reference steps every other green run aligns with.
  let aligned = reference.map((_, referenceIndex) => ({ referenceIndex, baselineIndices: [referenceIndex] }));
  for (const baseline of baselines.slice(1)) {
    const byReference = new Map(lcsPairs(keys(reference), keys(baseline.steps)));
    aligned = aligned.flatMap((item) => {
      const baselineIndex = byReference.get(item.referenceIndex);
      return baselineIndex === undefined ? [] : [{ referenceIndex: item.referenceIndex, baselineIndices: [...item.baselineIndices, baselineIndex] }];
    });
  }
  const invariants = aligned.map(({ referenceIndex, baselineIndices }) => ({
    expected: reference[referenceIndex]!,
    references: baselineIndices.map((index, baselineIndex) => baselines[baselineIndex]!.steps[index]!),
  }));
  const invariantIndices = new Set(aligned.map((item) => item.referenceIndex));
  const noiseCounts = new Map<string, SessionTraceNoise>();
  for (const [index, step] of reference.entries()) {
    if (invariantIndices.has(index)) continue;
    const current = noiseCounts.get(step.key);
    noiseCounts.set(step.key, { key: step.key, kind: step.kind, occurrences: (current?.occurrences ?? 0) + 1 });
  }

  const positioned: Array<{ position: number; finding: SessionTraceFinding }> = [];
  const observedByInvariant = new Map(lcsPairs(invariants.map((item) => item.expected.key), keys(observed.steps)));
  const matchedObserved = new Set(observedByInvariant.values());
  let previousInvariant: number | undefined;
  let lastObservedIndex = -1;
  for (const [invariantIndex, item] of invariants.entries()) {
    const index = observedByInvariant.get(invariantIndex);
    // Markers locate the other findings; the server cannot know the fixture's
    // markers of an observed run, so their absence is never a finding.
    if (index === undefined && item.expected.kind === 'marker') continue;
    if (index === undefined) {
      // An absent step sits right after the last observed step aligned before it.
      positioned.push({
        position: lastObservedIndex + 0.5,
        finding: { kind: 'missing-invariant', expected: item.expected, ...(lastObservedIndex >= 0 ? { afterStep: observed.steps[lastObservedIndex]! } : {}) },
      });
      continue;
    }
    const actual = observed.steps[index]!;
    const variableFields = new Set(Object.keys(item.expected.detail).filter((field) => item.references.some((step) => json(step.detail[field]) !== json(item.references[0]!.detail[field]))));
    const fields = [...new Set([...Object.keys(item.expected.detail), ...Object.keys(actual.detail)])]
      .filter((field) => !variableFields.has(field) && json(item.expected.detail[field]) !== json(actual.detail[field]));
    if (fields.length) positioned.push({ position: index, finding: { kind: 'changed-invariant', expected: item.expected, observed: actual, fields } });
    const timing = actual.kind === 'marker' ? undefined : slowness(item, actual, previousInvariant === undefined ? undefined : { invariant: invariants[previousInvariant]!, observed: observed.steps[observedByInvariant.get(previousInvariant)!]! });
    if (timing) positioned.push({ position: index, finding: { kind: 'timing', expected: item.expected, step: actual, ...timing } });
    previousInvariant = invariantIndex;
    lastObservedIndex = index;
  }

  // A count some green run already reached is normal: only more is extra.
  const maximumCount = new Map<string, number>();
  for (const baseline of baselines)
    for (const [key, count] of countByKey(baseline.steps)) maximumCount.set(key, Math.max(maximumCount.get(key) ?? 0, count));
  const observedCounts = countByKey(observed.steps);
  const reportedExtra = new Set<string>();
  const invariantByObserved = new Map([...observedByInvariant].map(([invariantIndex, observedIndex]) => [observedIndex, invariants[invariantIndex]!.expected]));
  let afterExpected: SessionTraceStep | undefined;
  for (const [index, step] of observed.steps.entries()) {
    afterExpected = invariantByObserved.get(index) ?? afterExpected;
    if (matchedObserved.has(index) || step.kind === 'marker') continue;
    const anchor = afterExpected ? { afterExpected } : {};
    if (!maximumCount.has(step.key)) {
      positioned.push({ position: index, finding: { kind: 'new-step', observed: step, severity: isErrorStep(step) ? 'error' : 'info', ...anchor } });
      continue;
    }
    const expectedCount = maximumCount.get(step.key)!;
    const observedCount = observedCounts.get(step.key) ?? 0;
    if (observedCount <= expectedCount || reportedExtra.has(step.key)) continue;
    reportedExtra.add(step.key);
    positioned.push({ position: index, finding: { kind: 'extra-occurrence', observed: step, expectedCount, observedCount, severity: step.kind === 'http' || step.kind === 'invocation' ? 'error' : 'info', ...anchor } });
  }

  const findings = positioned.sort((left, right) => left.position - right.position).map((item) => item.finding);
  const firstDivergence = findings.find(isDivergence);
  return { baselineCount: baselines.length, ...(firstDivergence ? { firstDivergence } : {}), findings, noise: [...noiseCounts.values()] };
}

/**
 * An operation is slow when its own duration is; any other step when the time
 * since the previous aligned invariant is. A late start alone never makes the
 * following steps slow.
 */
function slowness(
  item: Readonly<{ expected: SessionTraceStep; references: readonly SessionTraceStep[] }>,
  actual: SessionTraceStep,
  previous: Readonly<{ invariant: Readonly<{ references: readonly SessionTraceStep[] }>; observed: SessionTraceStep }> | undefined,
): Readonly<{ measure: 'duration' | 'gap'; observedMs: number; baselineRangeMs: readonly [number, number] }> | undefined {
  let measure: 'duration' | 'gap';
  let observedMs: number;
  let references: number[];
  if (actual.durationMs !== undefined && item.references.every((step) => step.durationMs !== undefined)) {
    measure = 'duration'; observedMs = actual.durationMs; references = item.references.map((step) => step.durationMs!);
  } else if (previous) {
    measure = 'gap'; observedMs = actual.elapsedMs - previous.observed.elapsedMs;
    references = item.references.map((step, index) => step.elapsedMs - previous.invariant.references[index]!.elapsedMs);
  } else return undefined;
  const min = Math.min(...references), max = Math.max(...references);
  return observedMs > max * SLOW_FACTOR && observedMs > max + SLOW_MARGIN_MS ? { measure, observedMs, baselineRangeMs: [min, max] } : undefined;
}

function isDivergence(finding: SessionTraceFinding): boolean {
  return finding.kind === 'missing-invariant' || finding.kind === 'changed-invariant' || ((finding.kind === 'new-step' || finding.kind === 'extra-occurrence') && finding.severity === 'error');
}
function isErrorStep(step: SessionTraceStep): boolean {
  return step.kind === 'exception' || step.detail['outcome'] === 'error' || step.detail['outcome'] === 'failed' || Number(step.detail['status']) >= 400;
}
function countByKey(steps: readonly SessionTraceStep[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(step.key, (counts.get(step.key) ?? 0) + 1);
  return counts;
}
function keys(steps: readonly SessionTraceStep[]): string[] { return steps.map((step) => step.key); }
function json(value: unknown): string { return JSON.stringify(value) ?? 'undefined'; }

const FINDING_LABELS: Readonly<Record<SessionTraceFinding['kind'], string>> = {
  'missing-invariant': 'Absent du run',
  'changed-invariant': 'Valeur différente',
  'new-step': 'Nouveau',
  'extra-occurrence': 'En trop',
  timing: 'Plus lent',
};
const MAX_LISTED_FINDINGS = 20;

export function describeSessionTraceFinding(finding: SessionTraceFinding): string {
  switch (finding.kind) {
    case 'missing-invariant': return `${finding.expected.key}${finding.afterStep ? ` (attendu après ${finding.afterStep.key})` : ''}`;
    case 'changed-invariant': return `${finding.expected.key} · ${finding.fields.map((field) => `${field} : ${json(finding.expected.detail[field])} → ${json(finding.observed.detail[field])}`).join(', ')}`;
    case 'new-step': return `${finding.observed.key}${finding.severity === 'error' && Object.keys(finding.observed.detail).length ? ` · ${json(finding.observed.detail)}` : ''}`;
    case 'extra-occurrence': return `${finding.observed.key} · ${finding.observedCount} fois au lieu de ${finding.expectedCount}`;
    case 'timing': return `${finding.step.key} · ${Math.round(finding.observedMs)} ms (${finding.measure === 'duration' ? 'durée' : 'depuis le pas précédent'}, historique ${finding.baselineRangeMs.map(Math.round).join('–')} ms)`;
  }
}
export function sessionTraceFindingLabel(finding: SessionTraceFinding): string { return FINDING_LABELS[finding.kind]; }

/** The step each side's replay goes to for a finding: the step itself, or the last aligned one before it. */
export function sessionTraceFindingAnchors(finding: SessionTraceFinding): Readonly<{ baseline?: SessionTraceStep; observed?: SessionTraceStep }> {
  switch (finding.kind) {
    case 'missing-invariant': return { baseline: finding.expected, ...(finding.afterStep ? { observed: finding.afterStep } : {}) };
    case 'changed-invariant': return { baseline: finding.expected, observed: finding.observed };
    case 'new-step':
    case 'extra-occurrence': return { observed: finding.observed, ...(finding.afterExpected ? { baseline: finding.afterExpected } : {}) };
    case 'timing': return { baseline: finding.expected, observed: finding.step };
  }
}

export function renderSessionTraceComparison(
  result: SessionTraceComparison,
  context: Readonly<{ testId: string; project: string; dashboardUrl?: string }>,
): string {
  const runs = result.baselineCount > 1 ? `${result.baselineCount} runs verts` : `${result.baselineCount} run vert`;
  const lines = [`# Session comparée à ${runs} (${context.testId} · ${context.project})`, ''];
  if (result.baselineCount === 1) lines.push('> Une seule référence : les variations normales ne sont pas connues.', '');
  const first = result.firstDivergence;
  if (!first) lines.push(result.findings.length ? 'Aucune divergence bloquante.' : 'Aucune divergence détectée.', '');
  else {
    lines.push('## Première divergence', '', `**${sessionTraceFindingLabel(first)}** : ${describeSessionTraceFinding(first)}`);
    if (first.kind === 'changed-invariant') lines.push('', '```', `attendu  ${json(first.expected.detail)}`, `observé  ${json(first.observed.detail)}`, '```');
    else if (first.kind === 'missing-invariant') { if (Object.keys(first.expected.detail).length) lines.push('', '```', `attendu  ${json(first.expected.detail)}`, '```'); }
    else if (first.kind !== 'timing' && Object.keys(first.observed.detail).length) lines.push('', '```', `observé  ${json(first.observed.detail)}`, '```');
    lines.push('');
  }
  if (result.findings.length) {
    lines.push(`## Trouvailles (${result.findings.length})`, '');
    let listed = 0;
    for (const kind of Object.keys(FINDING_LABELS) as SessionTraceFinding['kind'][]) {
      const group = result.findings.filter((finding) => finding.kind === kind);
      if (!group.length) continue;
      if (listed >= MAX_LISTED_FINDINGS) break;
      lines.push(`### ${FINDING_LABELS[kind]} (${group.length})`, '');
      for (const finding of group) {
        if (listed >= MAX_LISTED_FINDINGS) break;
        lines.push(`- ${describeSessionTraceFinding(finding)}`);
        listed += 1;
      }
      lines.push('');
    }
    if (result.findings.length > listed) lines.push(`… et ${result.findings.length - listed} autres.`, '');
  }
  const noiseSteps = result.noise.reduce((total, item) => total + item.occurrences, 0);
  lines.push(`Bruit : ${noiseSteps} pas absents d'au moins une référence, non comparés.`);
  if (context.dashboardUrl) lines.push('', `[Ouvrir la comparaison dans le dashboard](${context.dashboardUrl})`);
  return `${lines.join('\n')}\n`;
}
