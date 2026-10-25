import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import {
  isSessionHistory,
  normalizeSessionTrace,
  SESSION_TRACE_SCHEMA_VERSION,
  type PortableSessionForTrace,
  type SessionHistory,
  type SessionHistoryRun,
  type SessionTrace,
} from '@craft-ts/session-trace';

export type HistoryRun = SessionHistoryRun;
export type { SessionHistory };
export type RunMeta = Omit<HistoryRun, 'file' | 'traceHash' | 'traceSchemaVersion' | 'sizeBytes'>;
export type PortableSession = Readonly<Record<string, unknown>>;
export type Baseline = Readonly<{ run: HistoryRun; session: PortableSession; trace: SessionTrace }>;

export function readHistory(dir: string): SessionHistory | undefined {
  const path = join(dir, 'history.json');
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isSessionHistory(value)) throw new Error(`Historique e2e invalide : ${path}`);
  return value;
}

/**
 * Writes the run only when its trace is new. The stored hashes are not
 * trusted: every kept session is normalized again with the current normalizer,
 * so a history written by an older version is compared fairly.
 */
export function recordRun(dir: string, input: {
  id: string; project: string; keep: number; session: PortableSession; trace: SessionTrace; meta: RunMeta;
}): 'written' | 'unchanged' {
  mkdirSync(dir, { recursive: true });
  const previous = readBaselines(dir);
  if (previous.some((baseline) => baseline.trace.hash === input.trace.hash)) return 'unchanged';
  const compressed = gzipSync(stableJson(input.session));
  const suffix = createHash('sha256').update(input.trace.hash).digest('hex').slice(0, 6);
  const file = `${input.meta.recordedAt.replace(/[:.]/g, '-')}-${suffix}.session.json.gz`;
  atomicWrite(join(dir, file), compressed);
  const run: HistoryRun = {
    file, traceHash: input.trace.hash, traceSchemaVersion: input.trace.schemaVersion, ...input.meta, sizeBytes: compressed.byteLength,
  };
  const refreshed = previous.map(({ run: kept, trace }) => ({ ...kept, traceHash: trace.hash, traceSchemaVersion: trace.schemaVersion }));
  const runs = [run, ...refreshed].slice(0, input.keep);
  const history: SessionHistory = {
    format: 'craft-e2e-session-history', schemaVersion: 1, id: input.id,
    project: input.project, keep: input.keep, runs,
  };
  atomicWrite(join(dir, 'history.json'), `${stableJson(history)}\n`);
  const retained = new Set(runs.map((item) => item.file));
  for (const name of readdirSync(dir))
    if (name.endsWith('.session.json.gz') && !retained.has(name)) rmSync(join(dir, name));
  return 'written';
}

/** Green references, most recent first, with their trace recomputed. */
export function readBaselines(dir: string): readonly Baseline[] {
  const history = readHistory(dir);
  if (!history) return [];
  return history.runs.map((run) => {
    const session = JSON.parse(gunzipSync(readFileSync(join(dir, run.file))).toString('utf8')) as PortableSession;
    return { run, session, trace: normalizeSessionTrace(portable(session), { markers: run.markers ?? [] }) };
  });
}

export function historyBytes(dir: string): number {
  return readdirSync(dir).reduce((total, name) => total + statSync(join(dir, name)).size, 0);
}

export function portable(session: PortableSession): PortableSessionForTrace {
  const events = Array.isArray(session['events']) ? session['events'].filter(isRecord) : [];
  return { events };
}

export { SESSION_TRACE_SCHEMA_VERSION };

function atomicWrite(path: string, contents: string | Buffer): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, path);
}
function stableJson(value: unknown): string { return JSON.stringify(sortValue(value), null, 2); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
