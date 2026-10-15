import { describe, expect, it, vi } from 'vitest';
import {
  CraftLoopGuardError,
  createLoopGuard,
  type LoopGuardOptions,
} from './loop-guard';

const clock = () => {
  let at = 1_000;
  return {
    now: () => at,
    advance: (ms: number) => {
      at += ms;
    },
  };
};

const guardWith = (options: LoopGuardOptions = {}) => {
  const time = clock();
  const guard = createLoopGuard({ now: time.now, console: false, ...options });
  return { guard, time };
};

const create = (
  guard: ReturnType<typeof createLoopGuard>,
  name = 'sessions',
  hostTags: readonly string[] = ['component:SessionsPage#1'],
) => guard.primitiveCreated({ kind: 'query', name, hostTags });

describe('createLoopGuard', () => {
  it('stays silent on a legitimate 5 second poll', () => {
    const { guard, time } = guardWith();
    for (let tick = 0; tick < 12; tick += 1) {
      guard.httpRequested('GET', '/api/sessions');
      time.advance(5_000);
    }
    expect(guard.reports()).toEqual([]);
  });

  it('reports a burst of requests to one URL, naming it and its frequency', () => {
    const { guard, time } = guardWith();
    for (let request = 0; request < 25; request += 1) {
      guard.httpRequested('get', `/api/sessions?page=${request}`);
      time.advance(20);
    }
    const [report] = guard.reports();
    expect(report).toMatchObject({
      kind: 'http-burst',
      name: 'GET /api/sessions',
      threshold: 20,
    });
    expect(report.message).toContain('GET /api/sessions');
    expect(report.message).toContain('/s');
    // One report per key per window, not one per request.
    expect(guard.reports()).toHaveLength(1);
  });

  it('reports a primitive rebuilt over and over, ignoring instance ordinals', () => {
    const { guard, time } = guardWith();
    for (let build = 1; build <= 22; build += 1) {
      create(guard, 'sessions', [`component:SessionsPage#${build}`]);
      time.advance(30);
    }
    const [report] = guard.reports().filter((entry) => entry.kind === 'instantiation');
    expect(report.name).toBe('query:sessions');
    expect(report.key).toBe('component:SessionsPage / query:sessions');
    expect(report.message).toContain('created');
  });

  it('does not take a list drawing many rows at once for a loop', () => {
    const { guard } = guardWith();
    for (let row = 1; row <= 200; row += 1) {
      create(guard, 'detail', [`component:Row#${row}`]);
    }
    expect(guard.reports()).toEqual([]);
    const [entry] = guard.activity();
    expect(entry.total).toBe(200);
    expect(entry.inWindow).toBe(1);
  });

  it('reports instances that are replaced but never destroyed', () => {
    const { guard, time } = guardWith();
    for (let build = 1; build <= 12; build += 1) {
      create(guard);
      time.advance(50);
    }
    const leak = guard.reports().find((entry) => entry.kind === 'leaked-instance');
    expect(leak?.alive).toBeGreaterThanOrEqual(10);
    expect(leak?.message).toContain('not being destroyed');
  });

  it('does not call destroyed replacements a leak', () => {
    const { guard, time } = guardWith();
    for (let build = 1; build <= 15; build += 1) {
      create(guard).release();
      time.advance(50);
    }
    expect(guard.reports().filter((entry) => entry.kind === 'leaked-instance')).toEqual([]);
  });

  it('forgets what falls out of the window', () => {
    const { guard, time } = guardWith();
    for (let build = 0; build < 15; build += 1) {
      guard.httpRequested('GET', '/api/a');
      time.advance(100);
    }
    time.advance(60_000);
    for (let build = 0; build < 15; build += 1) {
      guard.httpRequested('GET', '/api/a');
      time.advance(100);
    }
    expect(guard.reports()).toEqual([]);
  });

  it('honours a declared exception, ignored or with a higher threshold', () => {
    const { guard, time } = guardWith({
      exempt: {
        'GET /api/ticker': 'ignore',
        'GET /api/feed*': { httpRequests: 100 },
      },
    });
    for (let request = 0; request < 50; request += 1) {
      guard.httpRequested('GET', '/api/ticker');
      guard.httpRequested('GET', '/api/feed/1');
      time.advance(20);
    }
    expect(guard.reports()).toEqual([]);
    for (let request = 0; request < 80; request += 1) {
      guard.httpRequested('GET', '/api/feed/1');
      time.advance(20);
    }
    expect(guard.reports().map((entry) => entry.name)).toEqual(['GET /api/feed/1']);
  });

  it('raises the suspicion to its listeners and the console', () => {
    const onSuspected = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { guard, time } = guardWith({ onSuspected, console: true });
    for (let request = 0; request < 21; request += 1) {
      guard.httpRequested('GET', '/api/x');
      time.advance(10);
    }
    expect(onSuspected).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[craft:loop-guard]'));
    error.mockRestore();
  });

  it('stops the loop with the circuit breaker, for creations and requests', () => {
    const { guard, time } = guardWith({ tripBreaker: true });
    let refused: unknown;
    for (let build = 1; build <= 40 && !refused; build += 1) {
      try {
        create(guard, 'sessions', [`component:Page#${build}`]);
      } catch (error) {
        refused = error;
      }
      time.advance(10);
    }
    expect(refused).toBeInstanceOf(CraftLoopGuardError);
    expect(() => create(guard, 'sessions', ['component:Page#99'])).toThrow(
      CraftLoopGuardError,
    );

    for (let request = 0; request < 21; request += 1) {
      try {
        guard.httpRequested('GET', '/api/loop');
      } catch {
        // tripped on the way
      }
      time.advance(10);
    }
    expect(() => guard.httpRequested('GET', '/api/loop')).toThrow(
      CraftLoopGuardError,
    );
    // Other keys keep working.
    expect(() => guard.httpRequested('GET', '/api/other')).not.toThrow();
  });

  it('lists the busiest key first and resets', () => {
    const { guard, time } = guardWith();
    for (let request = 0; request < 5; request += 1) {
      guard.httpRequested('GET', '/api/quiet');
      time.advance(10);
    }
    for (let request = 0; request < 15; request += 1) {
      guard.httpRequested('GET', '/api/busy');
      time.advance(10);
    }
    expect(guard.activity().map((entry) => entry.name)).toEqual([
      'GET /api/busy',
      'GET /api/quiet',
    ]);
    guard.reset();
    expect(guard.activity()).toEqual([]);
  });
});
