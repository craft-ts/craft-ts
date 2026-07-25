import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogReader, type StoredLogEntry } from './log-reader.js';

describe('LogReader', () => {
  let directory: string;
  let reader: LogReader;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'log-reader-'));
    reader = new LogReader({ directory });
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function write(fileName: string, entries: Partial<StoredLogEntry>[]): void {
    writeFileSync(
      join(directory, fileName),
      entries
        .map((entry, index) =>
          JSON.stringify({
            level: 'log',
            message: `entry ${index}`,
            timestamp: '2026-07-25T08:00:00.000Z',
            receivedAt: '2026-07-25T08:00:00.000Z',
            seq: index + 1,
            ...entry,
          }),
        )
        .join('\n')
        .concat('\n'),
      'utf8',
    );
  }

  it('reads rotated files oldest first, then the active file', () => {
    write('app.jsonl.2', [{ message: 'oldest' }]);
    write('app.jsonl.1', [{ message: 'middle' }]);
    write('app.jsonl', [{ message: 'newest' }]);

    expect(reader.readAll().map((entry) => entry.message)).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('returns nothing when no file exists yet', () => {
    expect(reader.readAll()).toEqual([]);
    expect(reader.stats().total).toBe(0);
  });

  it('skips a truncated trailing line instead of failing', () => {
    writeFileSync(
      join(directory, 'app.jsonl'),
      `${JSON.stringify({ level: 'log', message: 'ok', timestamp: 'a', receivedAt: 'a', seq: 1 })}\n{"level":"log","mess`,
      'utf8',
    );

    expect(reader.readAll().map((entry) => entry.message)).toEqual(['ok']);
  });

  it('searches newest first and honours the limit', () => {
    write('app.jsonl', [
      { message: 'one' },
      { message: 'two' },
      { message: 'three' },
    ]);

    expect(reader.search({ limit: 2 }).map((entry) => entry.message)).toEqual([
      'three',
      'two',
    ]);
  });

  it('filters by level, text, host tag and clientId', () => {
    write('app.jsonl', [
      { message: 'boom', level: 'error', from: ['App', 'UserCard'] },
      { message: 'hello', level: 'log', from: ['App'], clientId: 'c1' },
      { message: 'BOOM louder', level: 'warn', from: ['App', 'Cart'] },
    ]);

    expect(reader.search({ level: ['error'] }).map((e) => e.message)).toEqual([
      'boom',
    ]);
    expect(reader.search({ text: 'boom' }).map((e) => e.message)).toEqual([
      'BOOM louder',
      'boom',
    ]);
    expect(reader.search({ from: 'UserCard' }).map((e) => e.message)).toEqual([
      'boom',
    ]);
    expect(reader.search({ clientId: 'c1' }).map((e) => e.message)).toEqual([
      'hello',
    ]);
  });

  it('matches text inside the serialized arguments', () => {
    write('app.jsonl', [{ message: 'payload', args: [{ userId: 'u-42' }] }]);

    expect(reader.search({ text: 'u-42' })).toHaveLength(1);
  });

  it('filters by correlation id and time range', () => {
    write('app.jsonl', [
      {
        message: 'early',
        receivedAt: '2026-07-25T08:00:00.000Z',
        correlationId: { lastCorrelationId: 'corr-1' },
      },
      {
        message: 'late',
        receivedAt: '2026-07-25T10:00:00.000Z',
        correlationId: { lastCorrelationId: 'corr-2' },
      },
    ]);

    expect(reader.search({ correlationId: 'corr-1' }).map((e) => e.message)).toEqual(
      ['early'],
    );
    expect(
      reader.search({ since: '2026-07-25T09:00:00.000Z' }).map((e) => e.message),
    ).toEqual(['late']);
    expect(
      reader.search({ until: '2026-07-25T09:00:00.000Z' }).map((e) => e.message),
    ).toEqual(['early']);
  });

  it('tails the most recent entries oldest first', () => {
    write('app.jsonl', [
      { message: 'one' },
      { message: 'two' },
      { message: 'three' },
    ]);

    expect(reader.tail(2).map((entry) => entry.message)).toEqual([
      'two',
      'three',
    ]);
  });

  it('aggregates stats per level, host tag and client', () => {
    write('app.jsonl', [
      { message: 'a', level: 'error', from: ['App', 'UserCard'], clientId: 'c1' },
      { message: 'b', level: 'error', from: ['App', 'UserCard'], clientId: 'c1' },
      { message: 'c', level: 'log', from: ['App', 'Cart'], clientId: 'c2' },
    ]);

    const stats = reader.stats();

    expect(stats.total).toBe(3);
    expect(stats.byLevel).toEqual({ error: 2, log: 1 });
    expect(stats.byFrom).toEqual({ UserCard: 2, Cart: 1 });
    expect(stats.clients.sort()).toEqual(['c1', 'c2']);
  });

  it('clears every file and reports how many were removed', () => {
    write('app.jsonl.1', [{ message: 'old' }]);
    write('app.jsonl', [{ message: 'new' }]);

    expect(reader.clear()).toBe(2);
    expect(existsSync(reader.filePath)).toBe(false);
    expect(reader.readAll()).toEqual([]);
  });
});
