import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { collectLayoutDigest } from '@craft-ts/style-testing/digest';
import {
  approveGoldenChange,
  commandServer,
  gitWorktreeServer,
  goldenCheckReport,
  isGoldenChangeApproved,
  readGoldenLedger,
  runGoldenCheck,
  updateGoldenLedger,
  writeGoldenCheckReport,
  type GoldenBuild,
  type GoldenCheckReport,
} from '@craft-ts/playwright-sessions/suite';
import {
  changesFromUnifiedDiff,
  gitChanges,
  GraphStore,
  relevantGoldenSessions,
  type FileChange,
} from '@craft-ts/graph-mcp';
import { proposeGoldenSet } from '@craft-ts/log-mcp/golden-set';

/** What `sessions-check.mjs` resolved: see `sessionsCheckPlan`. */
type SessionsCheckBuild = Readonly<{ name: string; ref?: string }>;
type SessionsCheckPlan = Readonly<{
  repository: string;
  app: string;
  origin: string;
  /** The attestation register: the changes a person approved. */
  ledger: string;
  command: string;
  dashboardUrl: string;
  sessionIds: readonly string[];
  maxPoints: number;
  /** Base replays per session (absent from a plan written before the option). */
  noiseRuns?: number;
  out: string;
  base: SessionsCheckBuild;
  head: SessionsCheckBuild;
  changed?: Readonly<{
    sessions: readonly Readonly<{ sessionId: string; recordedAt: string; units: readonly string[] }>[];
    tsconfig: string;
    scope: string;
    list: boolean;
  }>;
}>;

/** The page as a person sees it: its layout from `body`, and its text. */
async function measurePage(frame: Frame): Promise<unknown> {
  return {
    digest: await collectLayoutDigest(frame, { root: 'body' }),
    text: await frame.evaluate(() => document.body.innerText),
  };
}

/**
 * The files the change touches, within the scope: from the base to the head
 * ref, or to the working tree (new files included) when the head is it.
 */
function changesOf(plan: SessionsCheckPlan, scope: string): FileChange[] {
  const base = plan.base.ref!;
  if (!plan.head.ref) return gitChanges(scope, base);
  const diff = execFileSync('git', ['-C', scope, 'diff', '-U0', '--no-color', '--no-ext-diff', base, plan.head.ref, '--', '.'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return changesFromUnifiedDiff(diff).map((change) => ({ ...change, file: resolve(plan.repository, change.file) }));
}

/** The sessions of the set the change touches, by the app's graph; written next to the report. */
function relevantSessionIds(plan: SessionsCheckPlan): readonly string[] {
  const changed = plan.changed!;
  const changes = changesOf(plan, changed.scope);
  // The graph of the head: the working tree's, analysed now.
  const rootDir = dirname(changed.tsconfig);
  const { graph } = new GraphStore({
    rootDir,
    tsConfigFilePath: changed.tsconfig,
    // Never read nor written: the analysis stays in memory.
    graphFile: join(plan.out, 'no-graph-file.json'),
    readonly: true,
  }).get();
  const relevant = relevantGoldenSessions(graph, { sessions: changed.sessions }, changes, { rootDir });
  writeFileSync(join(plan.out, 'relevant.json'), `${JSON.stringify({ changes: changes.length, ...relevant }, null, 2)}\n`);
  return relevant.sessions.map((session) => session.sessionId);
}

/** What `--approve` hands over: the session of the last report, and who approves. */
type ApprovalPlan = Readonly<{
  repository: string;
  app: string;
  origin: string;
  out: string;
  ledger: string;
  approve: Readonly<{ sessionId: string; by: string }>;
}>;

/** What `--select` hands over: the app, and where the archive is. */
type SelectionPlan = Readonly<{
  app: string;
  origin: string;
  out: string;
  archive: string;
  select: Readonly<{ appDir: string; maxSessions?: number }>;
}>;

const planFile = process.env['CRAFT_SESSIONS_CHECK'];
const plan = planFile ? (JSON.parse(readFileSync(planFile, 'utf8')) as SessionsCheckPlan | ApprovalPlan | SelectionPlan) : undefined;
const approval = plan && 'approve' in plan ? plan : undefined;
const selection = plan && 'select' in plan ? plan : undefined;

/**
 * Not a replay: the archive proposes the suite — the one in place kept
 * stable, the behaviours no test proves first — and it is written next to
 * the app. The same proposal as the logs MCP's `sessions.goldenSet`.
 */
test('choisir la suite de l’app', async () => {
  test.skip(!selection, 'lancé par sessions-check.mjs --select');
  const { out, archive, app, origin, select } = selection!;
  const previousUrl = process.env['LOG_SERVER_URL'];
  process.env['LOG_SERVER_URL'] = archive;
  try {
    const proposed = await proposeGoldenSet({ origin, app, appDir: select.appDir, write: true, ...(select.maxSessions ? { maxSessions: select.maxSessions } : {}) });
    writeFileSync(join(out, 'selection.json'), `${JSON.stringify(proposed, null, 2)}\n`);
  } catch (error) {
    writeFileSync(join(out, 'selection.json'), `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
  } finally {
    if (previousUrl === undefined) delete process.env['LOG_SERVER_URL'];
    else process.env['LOG_SERVER_URL'] = previousUrl;
  }
});

/**
 * Not a replay: the change the last report found in a session enters the
 * register, and the report is written again with it approved. Its outcome is
 * written for the launcher (`approval.json`).
 */
test('approuver un changement de la dernière vérification', () => {
  test.skip(!approval, 'lancé par sessions-check.mjs --approve');
  const { out, ledger, app, origin, approve } = approval!;
  const outcome = (value: Record<string, unknown>) => writeFileSync(join(out, 'approval.json'), `${JSON.stringify(value, null, 2)}\n`);
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as GoldenCheckReport;
  const session = report.sessions.find((item) => item.sessionId === approve.sessionId);
  try {
    if (!session) throw new Error(`La dernière vérification n’a pas rejoué ${approve.sessionId}.`);
    const builds = { base: report.base, head: report.head };
    const approved = updateGoldenLedger(ledger, (current) => approveGoldenChange(current, app, session, { by: approve.by, builds }));
    writeGoldenCheckReport(
      out,
      goldenCheckReport(report.sessions, builds, { app, origin, isApproved: (item) => isGoldenChangeApproved(approved, app, item) }),
    );
    outcome({ approved: true, sessionId: session.sessionId, change: session.change, ledger });
  } catch (error) {
    outcome({ approved: false, message: error instanceof Error ? error.message : String(error) });
  }
});

test('la suite de sessions, base contre tête', async ({ browser }) => {
  test.skip(!plan || approval !== undefined || selection !== undefined, 'lancé par tools/sessions-check/sessions-check.mjs');
  const check = plan as SessionsCheckPlan;
  const sessionIds = check.changed ? relevantSessionIds(check) : check.sessionIds;
  if (check.changed?.list) return;
  const server = { command: check.command, url: `${check.origin}/` };
  const build = (side: SessionsCheckBuild): GoldenBuild => ({
    name: side.name,
    serve: side.ref
      ? gitWorktreeServer({ ...server, ref: side.ref, repository: check.repository })
      : commandServer({ ...server, cwd: check.repository }),
  });
  // Nothing the change touches: nothing to serve nor replay.
  const report = await runGoldenCheck({
    browser,
    dashboardUrl: check.dashboardUrl,
    sessionIds,
    base: sessionIds.length ? build(check.base) : { name: check.base.name },
    head: sessionIds.length ? build(check.head) : { name: check.head.name },
    replay: { maxPoints: check.maxPoints, measure: measurePage, timeoutMs: 15 * 60_000 },
    ...(check.noiseRuns === undefined ? {} : { noiseRuns: check.noiseRuns }),
    // The changes a person approved, read now: an approval made while the
    // replays ran counts for this report too.
    report: {
      app: check.app,
      origin: check.origin,
      isApproved: (session) => isGoldenChangeApproved(readGoldenLedger(check.ledger), check.app, session),
    },
    onReplay: (role, result) =>
      console.log(
        `${role === 'base' ? 'base' : 'tête'} · ${result.sessionId.slice(0, 8)} · ${result.status} ${result.replayIndex}/${result.total}${
          result.message ? ` · ${result.message}` : ''
        }`,
      ),
  });
  // The verdict is the launcher's to give, from the report: the test only
  // fails when the check could not run.
  writeGoldenCheckReport(check.out, report);
});
