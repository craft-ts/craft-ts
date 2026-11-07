import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext } from '@playwright/test';
import { compareGoldenRuns, type CompareGoldenRunsOptions, type GoldenSessionComparison } from './compare-runs.js';
import { replayGoldenSession, type GoldenReplayOptions, type GoldenReplayResult } from './golden-replay.js';
import { goldenCheckReport, type GoldenCheckReport } from './report.js';

/**
 * A build of the app the suite replays on. The two builds are served one after
 * the other at the same address — the one the sessions were recorded at: the
 * recorded responses are matched by URL, origin included, so a build served
 * elsewhere would answer none of them.
 */
export type GoldenBuild = Readonly<{
  /** What the report calls it: a ref, `working tree`, … */
  name: string;
  /** Starts serving the build; nothing to do when it already runs. */
  serve?: () => Promise<ServedBuild>;
  /** Runs before each replay on this build (init scripts, routes). */
  prepareContext?: (context: BrowserContext) => Promise<void>;
}>;
export type ServedBuild = Readonly<{ stop(): Promise<void> }>;

export type GoldenCheckInput = Readonly<{
  browser: Browser;
  dashboardUrl: string;
  /** Sessions of the golden set, by id. */
  sessionIds: readonly string[];
  base: GoldenBuild;
  head: GoldenBuild;
  /** Shared by every replay (maxPoints, measure, …). */
  replay?: Omit<GoldenReplayOptions, 'dashboardUrl' | 'sessionId'>;
  compare?: CompareGoldenRunsOptions;
  /** Told of each replay as it ends. */
  onReplay?: (build: 'base' | 'head', result: GoldenReplayResult) => void;
}>;

/**
 * Replays every session twice on the base (the noise) and once on the head,
 * and compares them. The base is served, replayed, stopped; then the head.
 */
export async function runGoldenCheck(input: GoldenCheckInput): Promise<GoldenCheckReport> {
  const baseRuns = await replayOnBuild(input, input.base, 'base', 2);
  const headRuns = await replayOnBuild(input, input.head, 'head', 1);
  const sessions: GoldenSessionComparison[] = input.sessionIds.map((sessionId) => {
    const [base, baseAgain] = baseRuns.get(sessionId)!;
    const [head] = headRuns.get(sessionId)!;
    return compareGoldenRuns({ base: [base!, baseAgain!], head: head! }, input.compare);
  });
  return goldenCheckReport(sessions, { base: input.base.name, head: input.head.name });
}

async function replayOnBuild(
  input: GoldenCheckInput,
  build: GoldenBuild,
  role: 'base' | 'head',
  times: number,
): Promise<Map<string, GoldenReplayResult[]>> {
  const served = await build.serve?.();
  const runs = new Map<string, GoldenReplayResult[]>();
  try {
    for (const sessionId of input.sessionIds)
      for (let attempt = 0; attempt < times; attempt += 1) {
        // A context of its own per replay: nothing carries from one to the next.
        const context = await input.browser.newContext();
        try {
          await build.prepareContext?.(context);
          const result = await replayGoldenSession(context, { ...input.replay, dashboardUrl: input.dashboardUrl, sessionId });
          input.onReplay?.(role, result);
          runs.set(sessionId, [...(runs.get(sessionId) ?? []), result]);
        } finally {
          await context.close();
        }
      }
  } finally {
    await served?.stop();
  }
  return runs;
}

export type CommandServerOptions = Readonly<{
  /** Run through the shell. */
  command: string;
  /** Answers once the build is served. */
  url: string;
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}>;

/** Serves a build with a command (a dev server, a preview of a build) until `stop`. */
export function commandServer(options: CommandServerOptions): () => Promise<ServedBuild> {
  return async () => {
    if (await answers(options.url))
      throw new Error(`${options.url} répond déjà : un autre serveur occupe l’adresse de la build.`);
    const child = spawn(options.command, {
      shell: true,
      detached: true,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'ignore',
    });
    let exited: number | null = null;
    child.on('exit', (code) => { exited = code ?? -1; });
    const stop = () => stopProcess(child, options.url);
    const deadline = Date.now() + (options.timeoutMs ?? 120_000);
    while (!(await answers(options.url))) {
      if (exited !== null) throw new Error(`« ${options.command} » s’est arrêtée (code ${exited}) avant de servir ${options.url}.`);
      if (Date.now() > deadline) {
        await stop();
        throw new Error(`${options.url} ne répond pas après ${(options.timeoutMs ?? 120_000) / 1000} s.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { stop };
  };
}

export type GitWorktreeServerOptions = Omit<CommandServerOptions, 'cwd'> & Readonly<{
  /** The commit, branch or tag to serve (the base of a pull request). */
  ref: string;
  /** The repository; the current directory by default. */
  repository?: string;
}>;

/**
 * Serves another commit: checks it out in a temporary worktree (the
 * repository's `node_modules` linked in, so nothing is installed), runs the
 * command there, and removes the worktree on `stop`.
 */
export function gitWorktreeServer(options: GitWorktreeServerOptions): () => Promise<ServedBuild> {
  return async () => {
    const repository = resolve(options.repository ?? '.');
    const directory = mkdtempSync(join(tmpdir(), 'craft-golden-base-'));
    execFileSync('git', ['-C', repository, 'worktree', 'add', '--detach', directory, options.ref], { stdio: 'ignore' });
    const remove = () => {
      try {
        execFileSync('git', ['-C', repository, 'worktree', 'remove', '--force', directory], { stdio: 'ignore' });
      } catch {
        rmSync(directory, { recursive: true, force: true });
      }
    };
    try {
      const modules = join(repository, 'node_modules');
      if (existsSync(modules) && !existsSync(join(directory, 'node_modules'))) symlinkSync(modules, join(directory, 'node_modules'), 'dir');
      const served = await commandServer({ ...options, cwd: directory })();
      return {
        stop: async () => {
          await served.stop();
          remove();
        },
      };
    } catch (error) {
      remove();
      throw error;
    }
  };
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

/** Stops the whole process group (a dev server starts children), then waits for the address to free. */
async function stopProcess(child: ChildProcess, url: string): Promise<void> {
  if (child.exitCode === null && child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && (await answers(url))) await new Promise((resolve) => setTimeout(resolve, 200));
  if (await answers(url) && child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}
