import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isSessionHistory, normalizeSessionTrace, type SessionTrace } from '@craft-ts/session-trace';
import { portable, readBaselines, type PortableSession } from './history-store.js';

/**
 * The trace of each test's most recent green reference, keyed `<id>/<project>`.
 *
 * The references are committed already: reading them costs no storage, and
 * the behaviour catalog reads its e2e proofs from them.
 */
export function readReferenceTraces(sessionsDir: string): Record<string, SessionTrace> {
  const traces: Record<string, SessionTrace> = {};
  if (!existsSync(sessionsDir)) return traces;
  for (const id of directories(sessionsDir)) {
    for (const project of directories(join(sessionsDir, id))) {
      const [latest] = readBaselines(join(sessionsDir, id, project));
      if (latest) traces[`${id}/${project}`] = latest.trace;
    }
  }
  return sortedRecord(traces);
}

/**
 * The same references as committed where the branch left the base (their
 * merge base). `undefined` when git knows none of the refs; an empty record
 * when the base has no references.
 */
export function readReferenceTracesAtBase(options: Readonly<{
  cwd: string;
  /** Relative to `cwd`. */
  sessionsDir: string;
  /** Tried in order; defaults to `CRAFT_BEHAVIOR_BASE` or `main`, then `origin/main`. */
  baseRef?: string | readonly string[];
}>): Record<string, SessionTrace> | undefined {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'ignore'] });
  const refs = typeof options.baseRef === 'string'
    ? [options.baseRef]
    : options.baseRef ?? [process.env['CRAFT_BEHAVIOR_BASE'] ?? 'main', 'origin/main'];
  for (const ref of refs) {
    let base: string;
    try {
      base = git('merge-base', 'HEAD', ref).toString('utf8').trim();
    } catch {
      continue;
    }
    // Paths come back relative to `cwd`, which `rev:./path` reads from.
    const histories = git('ls-tree', '-r', '--name-only', base, '--', options.sessionsDir)
      .toString('utf8')
      .split('\n')
      .filter((path) => path.endsWith('/history.json'));
    const traces: Record<string, SessionTrace> = {};
    for (const path of histories) {
      const history: unknown = JSON.parse(git('show', `${base}:./${path}`).toString('utf8'));
      const run = isSessionHistory(history) ? history.runs[0] : undefined;
      if (!run) continue;
      const session = JSON.parse(gunzipSync(git('show', `${base}:./${dirname(path)}/${run.file}`)).toString('utf8')) as PortableSession;
      const [id, project] = dirname(path).slice(options.sessionsDir.replace(/\/$/, '').length + 1).split('/');
      traces[`${id}/${project}`] = normalizeSessionTrace(portable(session), { markers: run.markers ?? [] });
    }
    return sortedRecord(traces);
  }
  return undefined;
}

function directories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}
