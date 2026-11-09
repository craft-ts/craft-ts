import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import { collectLayoutDigest } from '@craft-ts/style-testing/digest';
import {
  commandServer,
  gitWorktreeServer,
  runGoldenCheck,
  writeGoldenCheckReport,
  type GoldenBuild,
} from '@craft-ts/playwright-sessions/suite';
import {
  changesFromUnifiedDiff,
  gitChanges,
  GraphStore,
  relevantGoldenSessions,
  type FileChange,
} from '@craft-ts/graph-mcp';

/** What `sessions-check.mjs` resolved: see `sessionsCheckPlan`. */
type SessionsCheckBuild = Readonly<{ name: string; ref?: string }>;
type SessionsCheckPlan = Readonly<{
  repository: string;
  origin: string;
  command: string;
  dashboardUrl: string;
  sessionIds: readonly string[];
  maxPoints: number;
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

test('la suite de sessions, base contre tête', async ({ browser }) => {
  const planFile = process.env['CRAFT_SESSIONS_CHECK'];
  test.skip(!planFile, 'lancé par tools/sessions-check/sessions-check.mjs');
  const plan = JSON.parse(readFileSync(planFile!, 'utf8')) as SessionsCheckPlan;
  const sessionIds = plan.changed ? relevantSessionIds(plan) : plan.sessionIds;
  if (plan.changed?.list) return;
  const server = { command: plan.command, url: `${plan.origin}/` };
  const build = (side: SessionsCheckBuild): GoldenBuild => ({
    name: side.name,
    serve: side.ref
      ? gitWorktreeServer({ ...server, ref: side.ref, repository: plan.repository })
      : commandServer({ ...server, cwd: plan.repository }),
  });
  // Nothing the change touches: nothing to serve nor replay.
  const report = await runGoldenCheck({
    browser,
    dashboardUrl: plan.dashboardUrl,
    sessionIds,
    base: sessionIds.length ? build(plan.base) : { name: plan.base.name },
    head: sessionIds.length ? build(plan.head) : { name: plan.head.name },
    replay: { maxPoints: plan.maxPoints, measure: measurePage, timeoutMs: 15 * 60_000 },
    onReplay: (role, result) =>
      console.log(
        `${role === 'base' ? 'base' : 'tête'} · ${result.sessionId.slice(0, 8)} · ${result.status} ${result.replayIndex}/${result.total}${
          result.message ? ` · ${result.message}` : ''
        }`,
      ),
  });
  // The verdict is the launcher's to give, from the report: the test only
  // fails when the check could not run.
  writeGoldenCheckReport(plan.out, report);
});
