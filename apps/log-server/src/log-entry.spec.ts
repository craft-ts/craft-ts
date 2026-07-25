import { describe, expect, it } from 'vitest';
import { normalizeEntry, parseBatch } from './log-entry.js';

describe('normalizeEntry', () => {
  it('rejects payloads without a known level', () => {
    expect(normalizeEntry({ message: 'a' })).toBeUndefined();
    expect(normalizeEntry({ level: 'fatal', message: 'a' })).toBeUndefined();
    expect(normalizeEntry(null)).toBeUndefined();
    expect(normalizeEntry('log')).toBeUndefined();
  });

  it('keeps the craft Console metadata', () => {
    const entry = normalizeEntry({
      level: 'error',
      message: 'boom',
      from: ['App', 'UserCard'],
      tags: [{ name: 'user' }],
      trace: 'at UserCard',
      correlationId: { lastCorrelationId: 'abc' },
      route: 'http://localhost/users',
      timestamp: 'Tue, 01 Jan 2030 00:00:00 GMT',
    });

    expect(entry).toMatchObject({
      level: 'error',
      from: ['App', 'UserCard'],
      trace: 'at UserCard',
      route: 'http://localhost/users',
    });
  });

  it('falls back to the batch clientId', () => {
    expect(normalizeEntry({ level: 'log', message: 'a' }, 'client-1')?.clientId).toBe(
      'client-1',
    );
    expect(
      normalizeEntry({ level: 'log', message: 'a', clientId: 'own' }, 'client-1')
        ?.clientId,
    ).toBe('own');
  });
});

describe('parseBatch', () => {
  it('accepts a { clientId, entries } envelope', () => {
    const entries = parseBatch({
      clientId: 'client-1',
      entries: [
        { level: 'log', message: 'a' },
        { level: 'warn', message: 'b' },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.clientId === 'client-1')).toBe(true);
  });

  it('accepts a bare array and a single entry', () => {
    expect(parseBatch([{ level: 'log', message: 'a' }])).toHaveLength(1);
    expect(parseBatch({ level: 'log', message: 'a' })).toHaveLength(1);
  });

  it('drops invalid entries instead of rejecting the batch', () => {
    const entries = parseBatch({
      entries: [{ level: 'log', message: 'ok' }, { level: 'nope' }, null],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe('ok');
  });

  it('returns nothing for unusable payloads', () => {
    expect(parseBatch(null)).toEqual([]);
    expect(parseBatch('hello')).toEqual([]);
  });
});
