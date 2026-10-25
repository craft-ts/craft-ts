import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import type { SessionTrace } from '@craft-ts/session-trace';

export type HistoryRun = Readonly<{
  file: string; traceHash: string; recordedAt: string; durationMs: number; retry: number;
  gitSha: string; dirty: boolean; title: string; specFile: string;
  environment: Readonly<Record<string, string>>; sizeBytes: number;
}>;
export type SessionHistory = Readonly<{
  format: 'craft-e2e-session-history'; schemaVersion: 1; id: string; project: string;
  keep: number; runs: readonly HistoryRun[];
}>;
export type RunMeta = Omit<HistoryRun, 'file' | 'traceHash' | 'sizeBytes'>;
export type PortableSession = Readonly<Record<string, unknown>>;

export function readHistory(dir: string): SessionHistory | undefined {
  const path = join(dir, 'history.json');
  if (!existsSync(path)) return undefined;
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isHistory(value)) throw new Error(`Historique e2e invalide : ${path}`);
  return value;
}

export function recordRun(dir: string, input: {
  id: string; project: string; keep: number; session: PortableSession; trace: SessionTrace; meta: RunMeta;
}): 'written' | 'unchanged' {
  mkdirSync(dir, { recursive: true });
  const previous = readHistory(dir);
  if (previous?.runs.some((run) => run.traceHash === input.trace.hash)) return 'unchanged';
  const serialized = stableJson(input.session);
  const compressed = gzipSync(serialized);
  const suffix = createHash('sha256').update(input.trace.hash).digest('hex').slice(0, 6);
  const stamp = input.meta.recordedAt.replace(/[:.]/g, '-').replace(/Z$/, 'Z');
  const file = `${stamp}-${suffix}.session.json.gz`;
  atomicWrite(join(dir, file), compressed);
  const run: HistoryRun = {
    file, traceHash: input.trace.hash, ...input.meta, sizeBytes: compressed.byteLength,
  };
  const runs = [run, ...(previous?.runs ?? [])].slice(0, input.keep);
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

export function readBaselines(dir: string): readonly Readonly<{ run: HistoryRun; session: PortableSession }>[] {
  const history = readHistory(dir);
  if (!history) return [];
  return history.runs.map((run) => ({
    run,
    session: JSON.parse(gunzipSync(readFileSync(join(dir, run.file))).toString('utf8')) as PortableSession,
  }));
}

export function historyBytes(dir: string): number {
  return readdirSync(dir).reduce((total, name) => total + statSync(join(dir, name)).size, 0);
}

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
function isHistory(value: unknown): value is SessionHistory {
  if (!isRecord(value) || value['format'] !== 'craft-e2e-session-history' || value['schemaVersion'] !== 1 || typeof value['id'] !== 'string' || typeof value['project'] !== 'string' || !Number.isInteger(value['keep']) || !Array.isArray(value['runs'])) return false;
  return value['runs'].every((run) => isRecord(run) && typeof run['file'] === 'string' && typeof run['traceHash'] === 'string' && typeof run['recordedAt'] === 'string' && Number.isFinite(run['durationMs']) && Number.isInteger(run['retry']) && typeof run['gitSha'] === 'string' && typeof run['dirty'] === 'boolean' && typeof run['title'] === 'string' && typeof run['specFile'] === 'string' && isRecord(run['environment']) && Number.isInteger(run['sizeBytes']));
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
