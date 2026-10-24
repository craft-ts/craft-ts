type Step = Readonly<{ key: string; kind: string; detail: Readonly<Record<string, unknown>>; elapsedMs: number }>;
type Trace = Readonly<{ steps: readonly Step[] }>;
type Finding = Readonly<Record<string, unknown>>;

export function normalizeSessionTrace(session: Readonly<Record<string, unknown>>): Trace {
  const events = Array.isArray(session['events']) ? session['events'].filter(isRecord) : [];
  const sorted = [...events].sort((a, b) => number(a['sequence']) - number(b['sequence']));
  const origin = Math.min(...sorted.map((event) => number(event['timestamp'], Infinity)));
  const steps = sorted.flatMap((event): Step[] => {
    const payload = isRecord(event['payload']) ? event['payload'] : {};
    const rawKind = String(event['kind'] ?? '').toLowerCase();
    const name = String(event['name'] ?? '');
    const url = clean(String(payload['url'] ?? payload['routePath'] ?? ''));
    let kind = '', identity = '', detail: Record<string, unknown> = {};
    if (/route|navigation/.test(rawKind)) { kind = 'route'; identity = route(url); detail = { phase: event['phase'], queryKeys: queryKeys(url) }; }
    else if (rawKind === 'http') { kind = 'http'; identity = `${String(payload['method'] ?? 'GET').toUpperCase()}:${route(url)}`; const response = isRecord(event['response']) ? event['response'] : {}; const status = number(payload['status'] ?? response['status']); detail = { status, outcome: status >= 400 ? 'error' : event['phase'] === 'aborted' ? 'aborted' : 'ok', bodyKeys: bodyKeys(payload['body'] ?? response['body']) }; }
    else if (name === 'test-marker') { kind = 'interaction'; identity = `marker:${isRecord(payload) ? String(payload['label'] ?? '') : ''}`; }
    else if (/exception|error/.test(rawKind)) { kind = rawKind.includes('console') ? 'console-error' : 'exception'; identity = first(String(payload['message'] ?? name)); detail = { message: clean(String(payload['message'] ?? name)) }; }
    else if (rawKind === 'craft') { kind = 'invocation'; identity = clean(String(payload['host'] ?? name)); detail = { phase: event['phase'], error: payload['errorName'] ?? null }; }
    else if (/dom|hover|interaction|input/.test(rawKind)) { kind = 'interaction'; identity = clean(String(payload['interactionName'] ?? name)); detail = { value: payload['value'] ?? null }; }
    else return [];
    return [{ key: `${kind}:${identity}`, kind, detail, elapsedMs: Math.max(0, number(event['globalElapsedMs'] ?? event['elapsedMs'], number(event['timestamp']) - (Number.isFinite(origin) ? origin : 0))) }];
  });
  return { steps };
}

export function compareSessionTraces(observed: Trace, baselines: readonly Trace[]) {
  if (!baselines.length) return { baselineCount: 0, findings: [], noise: [] };
  const reference = baselines[0]!.steps;
  const baselinePairs = baselines.slice(1).map((baseline) => lcs(reference, baseline.steps));
  const commonIndices = reference.map((_, index) => index).filter((index) => baselinePairs.every((pairs) => pairs.some(([left]) => left === index)));
  const invariants = commonIndices.map((index) => ({ expected: reference[index]!, references: [reference[index]!, ...baselinePairs.map((pairs, i) => baselines[i + 1]!.steps[pairs.find(([left]) => left === index)![1]!]!)] }));
  const pairs = lcs(invariants.map((item) => item.expected), observed.steps);
  const observedByIndex = new Map(pairs.map(([left, right]) => [left, observed.steps[right]! ]));
  const findings: Finding[] = [];
  for (const [index, item] of invariants.entries()) {
    const actual = observedByIndex.get(index);
    if (!actual) { findings.push({ kind: 'missing-invariant', expected: item.expected }); continue; }
    const fields = Object.keys(item.expected.detail).filter((field) => item.references.every((baseline) => JSON.stringify(baseline.detail[field]) === JSON.stringify(item.expected.detail[field])) && JSON.stringify(actual.detail[field]) !== JSON.stringify(item.expected.detail[field]));
    if (fields.length) findings.push({ kind: 'changed-invariant', expected: item.expected, observed: actual, fields });
    const elapsed = item.references.map((step) => step.elapsedMs);
    const low = Math.min(...elapsed), high = Math.max(...elapsed);
    if (actual.elapsedMs > high * 2 && actual.elapsedMs > high + 500)
      findings.push({ kind: 'timing', step: actual, observedMs: actual.elapsedMs, baselineRangeMs: [low, high] });
  }
  const keys = new Set(baselines.flatMap((baseline) => baseline.steps.map((step) => step.key)));
  for (const step of observed.steps) if (!keys.has(step.key)) findings.push({ kind: 'new-step', observed: step, severity: ['exception', 'console-error'].includes(step.kind) || (step.kind === 'http' && number(step.detail['status']) >= 400) ? 'error' : 'info' });
  const noise = reference.filter((_, index) => !commonIndices.includes(index));
  const firstDivergence = findings.find((finding) => finding['kind'] === 'missing-invariant' || finding['kind'] === 'changed-invariant') ?? findings.find((finding) => finding['kind'] === 'new-step' && finding['severity'] === 'error');
  return { baselineCount: baselines.length, ...(firstDivergence ? { firstDivergence } : {}), findings, noise };
}

function lcs(left: readonly Step[], right: readonly Step[]): Array<[number, number]> {
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) table[i]![j] = left[i]?.key === right[j]?.key ? 1 + table[i + 1]![j + 1]! : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const result: Array<[number, number]> = []; let i = 0, j = 0;
  while (i < left.length && j < right.length) { if (left[i]?.key === right[j]?.key) { result.push([i++, j++]); } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1; else j += 1; }
  return result;
}
function route(url: string): string { try { return clean(new URL(url, 'http://localhost').pathname); } catch { return clean(url.split('?')[0] ?? ''); } }
function queryKeys(url: string): string[] { try { return [...new URL(url, 'http://localhost').searchParams.keys()].sort(); } catch { return []; } }
function bodyKeys(value: unknown): string[] { try { const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value; return isRecord(parsed) ? Object.keys(parsed).sort() : []; } catch { return []; } }
function clean(value: string): string { return value.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid').replace(/\b\d{7,}\b/g, ':n').replace(/\b\d{4}-\d\d-\d\dT[^\s]+/g, ':time').replace(/\[REDACTED\]/g, ':redacted').replace(/\s+/g, ' ').trim(); }
function first(value: string): string { return value.split(/[.:\s]/, 1)[0] ?? value; }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
