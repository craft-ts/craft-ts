import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogStore } from './log-store.js';

describe('LogStore', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'log-store-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function readLines(path: string): unknown[] {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  }

  it('appends one JSON object per line with an incrementing seq', () => {
    const store = new LogStore({ directory });

    store.append([
      { level: 'log', message: 'first' },
      { level: 'error', message: 'second' },
    ]);
    store.append([{ level: 'warn', message: 'third' }]);

    const lines = readLines(store.filePath) as { message: string; seq: number }[];
    expect(lines.map((line) => line.message)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(lines.map((line) => line.seq)).toEqual([1, 2, 3]);
  });

  it('keeps the browser timestamp and adds receivedAt', () => {
    const store = new LogStore({ directory });

    store.append([
      { level: 'log', message: 'a', timestamp: 'Tue, 01 Jan 2030 00:00:00 GMT' },
    ]);

    const [entry] = readLines(store.filePath) as {
      timestamp: string;
      receivedAt: string;
    }[];
    expect(entry.timestamp).toBe('Tue, 01 Jan 2030 00:00:00 GMT');
    expect(Number.isNaN(Date.parse(entry.receivedAt))).toBe(false);
  });

  it('falls back to receivedAt when the client sent no timestamp', () => {
    const store = new LogStore({ directory });

    store.append([{ level: 'log', message: 'a' }]);

    const [entry] = readLines(store.filePath) as {
      timestamp: string;
      receivedAt: string;
    }[];
    expect(entry.timestamp).toBe(entry.receivedAt);
  });

  it('writes nothing for an empty batch', () => {
    const store = new LogStore({ directory });

    expect(store.append([])).toEqual([]);
    expect(existsSync(store.filePath)).toBe(false);
  });

  it('rotates the active file once it exceeds maxFileSize', () => {
    const store = new LogStore({ directory, maxFileSize: 200, maxFiles: 2 });

    // Each entry is well over 100 bytes once serialized.
    store.append([{ level: 'log', message: 'x'.repeat(300) }]);
    store.append([{ level: 'log', message: 'rotated' }]);

    expect(existsSync(store.rotatedPath(1))).toBe(true);
    const active = readLines(store.filePath) as { message: string }[];
    expect(active.map((line) => line.message)).toEqual(['rotated']);
  });

  it('drops the oldest rotated file beyond maxFiles', () => {
    const store = new LogStore({ directory, maxFileSize: 100, maxFiles: 1 });

    store.append([{ level: 'log', message: 'a'.repeat(200) }]);
    store.append([{ level: 'log', message: 'b'.repeat(200) }]);
    store.append([{ level: 'log', message: 'c' }]);

    expect(existsSync(store.rotatedPath(1))).toBe(true);
    expect(existsSync(store.rotatedPath(2))).toBe(false);
    const rotated = readLines(store.rotatedPath(1)) as { message: string }[];
    expect(rotated[0]?.message.startsWith('b')).toBe(true);
  });

  it('clears the active and rotated files', () => {
    const store = new LogStore({ directory, maxFileSize: 100, maxFiles: 2 });

    store.append([{ level: 'log', message: 'a'.repeat(200) }]);
    store.append([{ level: 'log', message: 'b' }]);
    store.clear();

    expect(existsSync(store.filePath)).toBe(false);
    expect(existsSync(store.rotatedPath(1))).toBe(false);
    expect(store.size()).toBe(0);
  });
});
