import { describe, expect, it } from 'vitest';
import { createSendContextSession } from '@craft-ts/core';
import { validateReplayExport, createRecordedResponseResolver, createReplayController } from './debug-session-replay';

describe('debug session replay format', () => {
  it('rejects invalid, incompatible and truncated exports', () => {
    expect(validateReplayExport('{')).toMatchObject({ ok: false });
    expect(validateReplayExport('{"format":"other","version":1}')).toMatchObject({ ok: false });
    expect(validateReplayExport('{"format":"craft-debug-session","version":1,"startUrl":"/","exportedAt":0,"truncated":true,"events":[],"clips":[]}')).toMatchObject({ ok: false });
  });

  it('exports complete versioned, redacted sessions', () => {
    const session = createSendContextSession();
    session.capture('dom', 'emitted', { name: 'click', payload: { token: 'secret' } });
    const exported = session.exportSessionJson();
    expect(validateReplayExport(exported)).toMatchObject({ ok: true });
    expect(exported).toContain('[REDACTED]');
  });

  it('matches only recorded HTTP requests and never falls through', async () => {
    const started = { id: 'start', sequence: 1, timestamp: 1, kind: 'http', phase: 'started', operationId: 'op', payload: { method: 'GET', url: 'https://example.test/api' } } as const;
    const finished = { id: 'end', sequence: 2, timestamp: 2, kind: 'http', phase: 'succeeded', operationId: 'op', response: { data: [1] } } as const;
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session', version: 1, startUrl: 'https://example.test/', exportedAt: 2,
      truncated: false, events: [started, finished], clips: [],
    });
    const response = await resolver(new Request('http://localhost/api'));
    expect(await response?.json()).toEqual({ data: [1] });
    expect(await resolver(new Request('http://localhost/unrecorded'))).toBeUndefined();
  });

  it('advances the virtual clock one recorded interaction at a time', async () => {
    document.body.innerHTML = '<button id="replay-target">Go</button>';
    const target = document.querySelector('#replay-target')!;
    let clicks = 0;
    target.addEventListener('click', () => clicks++);
    const session = {
      format: 'craft-debug-session' as const, version: 1 as const,
      startUrl: 'http://localhost/', exportedAt: 2_000, truncated: false,
      clips: [],
      events: [1_000, 2_000].map((timestamp, index) => ({
        id: `e${index}`, sequence: index + 1, timestamp, kind: 'dom' as const, phase: 'emitted' as const,
        payload: { selector: '#replay-target', action: 'click' },
      })),
    };
    const replay = createReplayController(session);
    let timerRan = false;
    replay.clock.schedule(() => { timerRan = true; }, 500);
    await replay.step();
    expect(clicks).toBe(1);
    expect(timerRan).toBe(false);
    expect(replay.clock.now()).toBe(1_000);
    await replay.step();
    expect(clicks).toBe(2);
    expect(timerRan).toBe(true);
    expect(replay.clock.now()).toBe(2_000);
    replay.stop();
  });
});
