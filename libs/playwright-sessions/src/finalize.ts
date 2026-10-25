import { gzipSync } from 'node:zlib';
import {
  compareSessionTraces,
  normalizeSessionTrace,
  renderSessionTraceComparison,
  type SessionTraceComparison,
  type SessionTraceMarker,
} from '@craft-ts/session-trace';
import type { CraftSessionContract } from './contract.js';
import { portable, readBaselines, recordRun, type PortableSession, type RunMeta } from './history-store.js';
import type { CraftSessionMode } from './mode.js';

export type TestOutcome = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** Outcome of replaying the latest green reference on the current build. */
export type BaselineReplay = Readonly<{
  status: 'completed' | 'diverged' | 'error' | 'timeout' | 'unavailable';
  /** First gap of the replay with the recording, when it diverged. */
  difference?: unknown;
  message?: string;
}>;

export type FinalizeInput = Readonly<{
  testId: string;
  project: string;
  title: string;
  contract: CraftSessionContract;
  mode: CraftSessionMode;
  status: TestOutcome;
  /** Effective session ids seen during the test, duplicates included. */
  sessionIds: readonly string[];
  serverUrl: string;
  historyDir: string;
  markers: readonly SessionTraceMarker[];
  meta: Omit<RunMeta, 'markers'>;
  budgetBytes?: Readonly<{ session: number; test: number }>;
  /** Comparison view of the dashboard for a session id. */
  compareUrl?: (sessionId: string) => string;
  /** How long a session may stay 404 while the page's finish beacon lands. */
  lookupTimeoutMs?: number;
  fetch?: typeof fetch;
  attach: (name: string, body: string | Buffer, contentType: string) => Promise<void>;
  annotate: (type: string, description: string) => void;
  replayBaseline?: (input: Readonly<{ baselineFile: string }>) => Promise<BaselineReplay>;
}>;

export type FinalizeResult = Readonly<{
  recorded: readonly ('written' | 'unchanged')[];
  comparisons: readonly SessionTraceComparison[];
  warnings: readonly string[];
}>;

const COMPARED_OUTCOMES: ReadonlySet<TestOutcome> = new Set(['failed', 'timedOut', 'interrupted']);
const LOOKUP_INTERVAL_MS = 200;

/**
 * End of a test, once all its pages are finished: each distinct session is
 * fetched, then recorded (green, update mode) or compared (red) exactly once.
 */
export async function finalizeCraftSession(input: FinalizeInput): Promise<FinalizeResult> {
  const result = { recorded: [] as ('written' | 'unchanged')[], comparisons: [] as SessionTraceComparison[], warnings: [] as string[] };
  if (input.mode === 'off' || input.contract.capture === 'none' || input.status === 'skipped') return result;
  const record = input.mode === 'update' && input.status === 'passed';
  const compare = COMPARED_OUTCOMES.has(input.status);
  const ids = [...new Set(input.sessionIds)];
  if (ids.length === 0) {
    if (input.status === 'passed') throw new Error(`${input.title}: aucune capture craft n’a été installée dans la page.`);
    return result;
  }
  if (!record && !compare) return result;
  if (ids.length > 1) result.warnings.push(`La session a été coupée en ${ids.length} : ${ids.join(', ')}. Une page a sans doute perdu l’id de session du test.`);

  for (const id of ids) {
    const session = await fetchSession(input, id);
    if (!session) {
      const message = `${input.title}: la session craft ${id} est introuvable sur ${input.serverUrl}.`;
      if (record) throw new Error(message);
      result.warnings.push(message);
      continue;
    }
    const trace = normalizeSessionTrace(portable(session), { markers: input.markers });
    const suffix = ids.length > 1 ? `-${id.slice(0, 8)}` : '';
    if (record) {
      const bytes = gzipSync(JSON.stringify(session)).byteLength;
      if (input.budgetBytes && bytes > input.budgetBytes.session)
        throw new Error(`${input.title}: export de session (${bytes} octets) au-dessus du budget.`);
      result.recorded.push(recordRun(input.historyDir, {
        id: input.testId, project: input.project, keep: input.contract.keep, session, trace,
        meta: { ...input.meta, markers: input.markers },
      }));
      continue;
    }
    const baselines = readBaselines(input.historyDir);
    if (baselines.length) {
      const comparison = compareSessionTraces(trace, baselines.map((baseline) => baseline.trace));
      result.comparisons.push(comparison);
      const replay = input.replayBaseline ? await input.replayBaseline({ baselineFile: baselines[0]!.run.file }) : undefined;
      const compareUrl = input.compareUrl?.(id);
      const markdown = [
        renderSessionTraceComparison(comparison, { testId: input.testId, project: input.project, ...(compareUrl ? { dashboardUrl: compareUrl } : {}) }),
        ...result.warnings.map((warning) => `> ${warning}\n`),
        ...(replay ? [`## Rejeu de la référence\n\n${describeBaselineReplay(replay)}\n`] : []),
      ].join('\n');
      await input.attach(`craft-session-diff${suffix}.md`, markdown, 'text/markdown');
      await input.attach(`craft-session-diff${suffix}.json`, Buffer.from(JSON.stringify({ sessionId: id, ...comparison, ...(replay ? { baselineReplay: replay } : {}) }, null, 2)), 'application/json');
      if (comparison.firstDivergence) input.annotate('craft-session-divergence', JSON.stringify(comparison.firstDivergence));
    } else {
      result.warnings.push(`Aucune référence verte pour ${input.testId} (${input.project}) : rien à comparer.`);
    }
    await input.attach(`craft-session${suffix}.json.gz`, gzipSync(JSON.stringify(session)), 'application/gzip');
  }
  return result;
}

/** The reading of a baseline replay, worded for what the replay can and cannot prove. */
export function describeBaselineReplay(replay: BaselineReplay): string {
  switch (replay.status) {
    case 'completed':
      return 'La référence verte rejoue sans écart sur le build courant, avec les réponses enregistrées. '
        + 'L’écart vient soit des réponses réelles (données, back, environnement), soit de l’interaction elle-même : '
        + 'le replay appelle les méthodes enregistrées sans passer par les gestionnaires de clic, il ne vérifie donc pas qu’un bouton est toujours branché.';
    case 'diverged':
      return `Le front a changé ce parcours : la référence verte ne rejoue plus à l’identique sur le build courant.\n\nPremière différence du replay :\n\n\`\`\`json\n${JSON.stringify(replay.difference ?? null, null, 2)}\n\`\`\``;
    case 'timeout':
      return `Rejeu de la référence interrompu : ${replay.message ?? 'délai dépassé'}. Aucune conclusion.`;
    case 'error':
      return `Le rejeu de la référence a échoué : ${replay.message ?? 'erreur inconnue'}. Aucune conclusion.`;
    case 'unavailable':
      return `Référence non rejouée : ${replay.message ?? 'aucun export vert disponible'}.`;
  }
}

/** The session by its exact id: a 404 is retried on the same id, never on another run. */
async function fetchSession(input: FinalizeInput, id: string): Promise<PortableSession | undefined> {
  const request = input.fetch ?? fetch;
  const deadline = Date.now() + (input.lookupTimeoutMs ?? 5_000);
  for (;;) {
    try {
      const response = await request(`${input.serverUrl.replace(/\/$/, '')}/sessions/${encodeURIComponent(id)}`);
      if (response.ok) return await response.json() as PortableSession;
    } catch { /* The app may still be posting its pagehide finish beacon. */ }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, LOOKUP_INTERVAL_MS));
  }
}
