import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export type StoredLogEntry = {
  readonly level: string;
  readonly message: string;
  readonly args?: readonly unknown[];
  readonly from?: readonly string[];
  readonly tags?: readonly unknown[];
  readonly trace?: string;
  readonly correlationId?: unknown;
  readonly timestamp: string;
  readonly receivedAt: string;
  readonly route?: string;
  readonly browser?: unknown;
  readonly clientId?: string;
  readonly seq: number;
};

export type LogQuery = {
  readonly level?: readonly string[];
  /** Case-insensitive substring match on the message. */
  readonly text?: string;
  /** Matches when any host tag in the ancestry equals this value. */
  readonly from?: string;
  readonly correlationId?: string;
  readonly clientId?: string;
  /** Inclusive lower bound on `receivedAt`. */
  readonly since?: string;
  /** Inclusive upper bound on `receivedAt`. */
  readonly until?: string;
  readonly limit?: number;
};

export type LogStats = {
  readonly total: number;
  readonly byLevel: Record<string, number>;
  readonly byFrom: Record<string, number>;
  readonly clients: readonly string[];
  readonly firstAt?: string;
  readonly lastAt?: string;
};

const DEFAULT_FILE_NAME = 'app.jsonl';
const DEFAULT_LIMIT = 50;

export class LogReader {
  readonly directory: string;
  readonly fileName: string;
  readonly maxFiles: number;

  constructor(options: {
    directory: string;
    fileName?: string;
    maxFiles?: number;
  }) {
    this.directory = options.directory;
    this.fileName = options.fileName ?? DEFAULT_FILE_NAME;
    this.maxFiles = options.maxFiles ?? 5;
  }

  get filePath(): string {
    return join(this.directory, this.fileName);
  }

  /**
   * Oldest first: rotated files (highest index is oldest) then the active file.
   */
  files(): readonly string[] {
    const paths: string[] = [];
    for (let index = this.maxFiles; index >= 1; index--) {
      const path = join(this.directory, `${this.fileName}.${index}`);
      if (existsSync(path)) paths.push(path);
    }
    if (existsSync(this.filePath)) paths.push(this.filePath);
    return paths;
  }

  readAll(): readonly StoredLogEntry[] {
    return this.files().flatMap((path) => parseFile(path));
  }

  /** Newest first, capped by `limit`. */
  search(query: LogQuery = {}): readonly StoredLogEntry[] {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const matched = this.readAll().filter((entry) => matches(entry, query));
    return matched.slice(-limit).reverse();
  }

  /** The `count` most recent entries, oldest first so they read like a tail. */
  tail(count = 20): readonly StoredLogEntry[] {
    const all = this.readAll();
    return all.slice(Math.max(0, all.length - count));
  }

  stats(): LogStats {
    const entries = this.readAll();
    const byLevel: Record<string, number> = {};
    const byFrom: Record<string, number> = {};
    const clients = new Set<string>();

    for (const entry of entries) {
      byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
      const host = entry.from?.[entry.from.length - 1];
      if (host) byFrom[host] = (byFrom[host] ?? 0) + 1;
      if (entry.clientId) clients.add(entry.clientId);
    }

    return {
      total: entries.length,
      byLevel,
      byFrom,
      clients: [...clients],
      firstAt: entries[0]?.receivedAt,
      lastAt: entries[entries.length - 1]?.receivedAt,
    };
  }

  clear(): number {
    const paths = this.files();
    for (const path of paths) rmSync(path, { force: true });
    return paths.length;
  }
}

function parseFile(path: string): StoredLogEntry[] {
  const entries: StoredLogEntry[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.length === 0) continue;
    try {
      entries.push(JSON.parse(line) as StoredLogEntry);
    } catch {
      // A truncated trailing line can happen if the server is writing right
      // now; skip it rather than failing the whole read.
    }
  }
  return entries;
}

function matches(entry: StoredLogEntry, query: LogQuery): boolean {
  if (query.level && query.level.length > 0 && !query.level.includes(entry.level)) {
    return false;
  }

  if (query.text) {
    const needle = query.text.toLowerCase();
    const haystack = `${entry.message} ${JSON.stringify(entry.args ?? [])}`;
    if (!haystack.toLowerCase().includes(needle)) return false;
  }

  if (query.from && !(entry.from ?? []).includes(query.from)) return false;
  if (query.clientId && entry.clientId !== query.clientId) return false;

  if (query.correlationId) {
    const serialized = JSON.stringify(entry.correlationId ?? null);
    if (!serialized.includes(query.correlationId)) return false;
  }

  const receivedAt = Date.parse(entry.receivedAt);
  if (query.since && receivedAt < Date.parse(query.since)) return false;
  if (query.until && receivedAt > Date.parse(query.until)) return false;

  return true;
}
