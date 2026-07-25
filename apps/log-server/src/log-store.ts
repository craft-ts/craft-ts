import { appendFileSync, mkdirSync, renameSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingLogEntry, StoredLogEntry } from './log-entry.js';

export type LogStoreOptions = {
  /** Directory holding `app.jsonl` and its rotated siblings. */
  readonly directory: string;
  readonly fileName?: string;
  /** Rotate once the active file exceeds this size, in bytes. */
  readonly maxFileSize?: number;
  /** Number of rotated files kept next to the active one. */
  readonly maxFiles?: number;
};

const DEFAULT_FILE_NAME = 'app.jsonl';
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

/**
 * Append-only JSONL store. One JSON object per line, newest last, so the MCP
 * reader can stream lines without parsing the whole file.
 */
export class LogStore {
  readonly directory: string;
  readonly fileName: string;
  readonly maxFileSize: number;
  readonly maxFiles: number;

  private seq = 0;

  constructor(options: LogStoreOptions) {
    this.directory = options.directory;
    this.fileName = options.fileName ?? DEFAULT_FILE_NAME;
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    mkdirSync(this.directory, { recursive: true });
  }

  get filePath(): string {
    return join(this.directory, this.fileName);
  }

  rotatedPath(index: number): string {
    return join(this.directory, `${this.fileName}.${index}`);
  }

  append(entries: readonly IncomingLogEntry[]): readonly StoredLogEntry[] {
    if (entries.length === 0) return [];

    const receivedAt = new Date().toISOString();
    const stored = entries.map((entry) => ({
      ...entry,
      timestamp: entry.timestamp ?? receivedAt,
      receivedAt,
      seq: ++this.seq,
    }));

    this.rotateIfNeeded();
    appendFileSync(
      this.filePath,
      stored.map((entry) => `${JSON.stringify(entry)}\n`).join(''),
      'utf8',
    );

    return stored;
  }

  clear(): void {
    rmSync(this.filePath, { force: true });
    for (let index = 1; index <= this.maxFiles; index++) {
      rmSync(this.rotatedPath(index), { force: true });
    }
  }

  size(): number {
    try {
      return statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  private rotateIfNeeded(): void {
    if (this.size() < this.maxFileSize) return;

    // Drop the oldest, then shift every rotated file one slot down.
    rmSync(this.rotatedPath(this.maxFiles), { force: true });
    for (let index = this.maxFiles - 1; index >= 1; index--) {
      try {
        renameSync(this.rotatedPath(index), this.rotatedPath(index + 1));
      } catch {
        // Slot is empty; nothing to shift.
      }
    }
    renameSync(this.filePath, this.rotatedPath(1));
  }
}
