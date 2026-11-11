import { describe, expect, it } from 'vitest';
import { replaySessions } from './suite-replay-tool.js';

const answers = (bodies: Record<string, { status: number; body: unknown } | Error>): typeof fetch =>
  (async (url: string) => {
    const id = decodeURIComponent(String(url).split('/sessions/')[1]!.split('/')[0]!);
    const answer = bodies[id]!;
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as typeof fetch;

describe('replaySessions', () => {
  it('passes when every session replays to the end with its clicks proven', async () => {
    const result = await replaySessions(['a', 'b'], answers({
      a: { status: 200, body: { sessionId: 'a', status: 'completed', unprovenInteractions: [], notes: ['long'] } },
      b: { status: 200, body: { sessionId: 'b', status: 'completed', unprovenInteractions: [] } },
    }));
    expect(result).toMatchObject({ passed: true, counts: { completed: 2 } });
    expect(result.results[0]).not.toHaveProperty('notes');
  });

  it('fails on a gap, on a click not proven, on a missing session or an unreachable server', async () => {
    const result = await replaySessions(['gap', 'unproven', 'gone', 'down'], answers({
      gap: { status: 200, body: { status: 'diverged', difference: { missing: ['cart.clear'] } } },
      unproven: { status: 200, body: { status: 'completed', unprovenInteractions: ['[Interaction non prouvée] …'] } },
      gone: { status: 404, body: { error: 'Session not found.' } },
      down: new Error('ECONNREFUSED'),
    }));
    expect(result.passed).toBe(false);
    expect(result.counts).toEqual({ diverged: 1, completed: 1, 'not-found': 1, unreachable: 1 });
    expect(result.results[0]).toMatchObject({ sessionId: 'gap', difference: { missing: ['cart.clear'] } });
  });
});
