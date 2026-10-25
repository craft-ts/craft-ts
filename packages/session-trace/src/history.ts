import type { SessionTraceMarker } from './normalize.js';

/** Format of `<testDir>/__sessions__/<test-id>/<project>/history.json`. */
export type SessionHistoryRun = Readonly<{
  /** Gzip export next to `history.json`; a plain file name, never a path. */
  file: string;
  traceHash: string;
  /** Normalizer version that produced `traceHash`; absent before version 2. */
  traceSchemaVersion?: number;
  recordedAt: string;
  durationMs: number;
  retry: number;
  gitSha: string;
  dirty: boolean;
  title: string;
  specFile: string;
  environment: Readonly<Record<string, string>>;
  sizeBytes: number;
  /** Steps recorded by the fixture, inserted into the trace by time. */
  markers?: readonly SessionTraceMarker[];
}>;
export type SessionHistory = Readonly<{
  format: 'craft-e2e-session-history';
  schemaVersion: 1;
  id: string;
  project: string;
  keep: number;
  runs: readonly SessionHistoryRun[];
}>;

export const SESSION_HISTORY_FILE = /^[^/\\]+\.session\.json\.gz$/;

/** The one validation of `history.json`, shared by the fixture and the log server. */
export function isSessionHistory(value: unknown): value is SessionHistory {
  if (!isRecord(value) || value['format'] !== 'craft-e2e-session-history' || value['schemaVersion'] !== 1 || typeof value['id'] !== 'string' || typeof value['project'] !== 'string' || !Number.isInteger(value['keep']) || !Array.isArray(value['runs'])) return false;
  return value['runs'].every(isSessionHistoryRun);
}

function isSessionHistoryRun(run: unknown): run is SessionHistoryRun {
  return isRecord(run)
    && typeof run['file'] === 'string' && SESSION_HISTORY_FILE.test(run['file'])
    && typeof run['traceHash'] === 'string'
    && (run['traceSchemaVersion'] === undefined || Number.isInteger(run['traceSchemaVersion']))
    && typeof run['recordedAt'] === 'string'
    && typeof run['durationMs'] === 'number' && Number.isFinite(run['durationMs'])
    && Number.isInteger(run['retry'])
    && typeof run['gitSha'] === 'string'
    && typeof run['dirty'] === 'boolean'
    && typeof run['title'] === 'string'
    && typeof run['specFile'] === 'string'
    && isRecord(run['environment']) && Object.values(run['environment']).every((item) => typeof item === 'string')
    && Number.isInteger(run['sizeBytes'])
    && (run['markers'] === undefined || (Array.isArray(run['markers']) && run['markers'].every((marker) => isRecord(marker) && typeof marker['label'] === 'string' && typeof marker['at'] === 'number')));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
