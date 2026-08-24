import type { ConsoleServiceApi } from '@craft-ts/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLogForwarder,
  type ForwardedLogEntry,
  type LogForwarder,
} from './log-forwarder';

type SentBatch = {
  payload: { clientId: string; entries: readonly ForwardedLogEntry[] };
  options: { beacon: boolean };
};

function craftMetadata(overrides: Record<string, unknown> = {}) {
  return {
    from: ['App', 'UserCard'],
    tags: [],
    trace: 'at UserCard',
    correlationId: { lastCorrelationId: 'corr-1', mayCorrelatedIds: [] },
    timestamp: 'Tue, 01 Jan 2030 00:00:00 GMT',
    route: 'http://localhost/users',
    ...overrides,
  };
}

describe('createLogForwarder', () => {
  let sent: SentBatch[];
  let target: ConsoleServiceApi;
  let forwarder: LogForwarder;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    target = {
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      group: vi.fn(),
      groupCollapsed: vi.fn(),
      groupEnd: vi.fn(),
      time: vi.fn(),
      timeEnd: vi.fn(),
    };
    forwarder = createLogForwarder({
      clientId: 'client-1',
      target,
      send: (payload, options) => {
        sent.push({ payload, options });
      },
    });
  });

  afterEach(() => {
    forwarder.stop();
    vi.useRealTimers();
  });

  it('still prints to the underlying console', () => {
    forwarder.console.log('hello', craftMetadata());

    expect(target.log).toHaveBeenCalledWith('hello', craftMetadata());
  });

  it('extracts the craft metadata out of the arguments', () => {
    forwarder.console.error('boom', { id: 7 }, craftMetadata());
    forwarder.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.clientId).toBe('client-1');
    expect(sent[0]?.payload.entries[0]).toMatchObject({
      level: 'error',
      message: 'boom {"id":7}',
      args: ['boom', { id: 7 }],
      from: ['App', 'UserCard'],
      trace: 'at UserCard',
      route: 'http://localhost/users',
      timestamp: 'Tue, 01 Jan 2030 00:00:00 GMT',
    });
  });

  it('keeps plain arguments when there is no craft metadata', () => {
    forwarder.console.warn('raw call');
    forwarder.flush();

    expect(sent[0]?.payload.entries[0]).toMatchObject({
      level: 'warn',
      message: 'raw call',
      args: ['raw call'],
    });
    expect(sent[0]?.payload.entries[0]?.from).toBeUndefined();
  });

  it('forwards every metadata-carrying level', () => {
    for (const level of ['debug', 'info', 'log', 'warn', 'error'] as const) {
      forwarder.console[level](level, craftMetadata());
    }
    forwarder.flush();

    expect(sent[0]?.payload.entries.map((entry) => entry.level)).toEqual([
      'debug',
      'info',
      'log',
      'warn',
      'error',
    ]);
  });

  it('does not forward the non-metadata console methods', () => {
    forwarder.console.trace('t');
    forwarder.console.group('g');
    forwarder.console.groupEnd();
    forwarder.console.time('a');
    forwarder.console.timeEnd('a');
    forwarder.flush();

    expect(sent).toEqual([]);
    expect(target.trace).toHaveBeenCalledWith('t');
    expect(target.groupEnd).toHaveBeenCalled();
  });

  it('flushes on the interval', () => {
    forwarder.console.log('a', craftMetadata());
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(1000);

    expect(sent).toHaveLength(1);
  });

  it('flushes immediately once the batch size is reached', () => {
    const batched = createLogForwarder({
      clientId: 'c',
      target,
      batchSize: 2,
      send: (payload, options) => {
        sent.push({ payload, options });
      },
    });

    batched.console.log('a', craftMetadata());
    expect(sent).toEqual([]);
    batched.console.log('b', craftMetadata());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.entries).toHaveLength(2);

    batched.stop();
  });

  it('sends nothing when the buffer is empty', () => {
    vi.advanceTimersByTime(5000);

    expect(sent).toEqual([]);
  });

  it('drops the oldest entries beyond maxBufferSize', () => {
    const bounded = createLogForwarder({
      clientId: 'c',
      target,
      batchSize: 1000,
      maxBufferSize: 2,
      send: (payload, options) => {
        sent.push({ payload, options });
      },
    });

    bounded.console.log('a', craftMetadata());
    bounded.console.log('b', craftMetadata());
    bounded.console.log('c', craftMetadata());
    bounded.flush();

    expect(sent[0]?.payload.entries.map((entry) => entry.message)).toEqual([
      'b',
      'c',
    ]);
    bounded.stop();
  });

  it('marks a beacon flush', () => {
    forwarder.console.log('a', craftMetadata());
    forwarder.flush({ beacon: true });

    expect(sent[0]?.options).toEqual({ beacon: true });
  });

  it('never lets a failing transport break the caller', () => {
    const failing = createLogForwarder({
      clientId: 'c',
      target,
      send: () => {
        throw new Error('offline');
      },
    });

    failing.console.log('a', craftMetadata());
    expect(() => failing.flush()).not.toThrow();
    // The batch is dropped rather than retried forever.
    expect(failing.pending).toEqual([]);

    failing.stop();
  });

  it('serialises errors, cycles and functions safely', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic['self'] = cyclic;

    forwarder.console.error(
      new Error('boom'),
      cyclic,
      () => undefined,
      craftMetadata(),
    );
    forwarder.flush();

    const [errorArg, cyclicArg, fnArg] = sent[0]?.payload.entries[0]?.args ?? [];
    expect(errorArg).toMatchObject({ name: 'Error', message: 'boom' });
    expect(cyclicArg).toMatchObject({ name: 'root', self: '[Circular]' });
    expect(String(fnArg)).toContain('[Function');
  });

  it('flushes what is buffered on stop', () => {
    forwarder.console.log('a', craftMetadata());
    forwarder.stop();

    expect(sent).toHaveLength(1);
  });
});
