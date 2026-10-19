import { Injector } from './host/craft-compat';
import { describe, expect, it, vi } from 'vitest';
import {
  executeCraftHttpTrace,
  ɵadvanceCraftHttpReplay,
  ɵinstallCraftHttpReplay,
  provideCraftHttpTrace,
} from './craft-http-trace';
import { provideCraftProduction } from './craft-runtime-mode';
import { ɵsetCraftReplayMode } from './craft-replay';

describe('craft http trace', () => {
  it('never sends an unmatched Craft HTTP request to the live transport during replay', async () => {
    const next = vi.fn(async () => 'live response');
    ɵsetCraftReplayMode(true);
    try {
      await expect(
        executeCraftHttpTrace(
          Injector.create({ providers: [] }),
          { method: 'GET', url: '/unrecorded' },
          next,
        ),
      ).rejects.toThrow('no recorded Craft HTTP result');
      expect(next).not.toHaveBeenCalled();
    } finally {
      ɵsetCraftReplayMode(false);
    }
  });

  it('keeps the no-live-request guarantee in production mode', async () => {
    const next = vi.fn(async () => 'live response');
    ɵsetCraftReplayMode(true);
    try {
      await expect(
        executeCraftHttpTrace(
          Injector.create({ providers: [provideCraftProduction()] }),
          { method: 'GET', url: '/unrecorded' },
          next,
        ),
      ).rejects.toThrow('no recorded Craft HTTP result');
      expect(next).not.toHaveBeenCalled();
    } finally {
      ɵsetCraftReplayMode(false);
    }
  });

  it('wraps a CraftHttpClient request and preserves its result', async () => {
    const calls: string[] = [];

    const injector = Injector.create({
      providers: [
        provideCraftHttpTrace(async (context, next) => {
          calls.push(JSON.stringify(context));
          return next();
        }),
      ],
    });

    await expect(
      executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/users' },
        async () => ({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls).toEqual(['{"method":"GET","url":"/users"}']);
  });

  it('skips trace wrappers in production mode', async () => {
    const calls: string[] = [];
    const injector = Injector.create({
      providers: [
        provideCraftProduction(),
        provideCraftHttpTrace(async (_context, next) => {
          calls.push('trace');
          return next();
        }),
      ],
    });

    await expect(
      executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/users' },
        async () => 'ok',
      ),
    ).resolves.toBe('ok');

    expect(calls).toEqual([]);
  });

  it('replays the recorded decoded response at its recorded timeline position', async () => {
    const restore = ɵinstallCraftHttpReplay([
      {
        context: {
          method: 'POST',
          url: '/users',
          payload: { id: 7 },
        },
        elapsedMs: 80,
        phase: 'succeeded',
        response: { user: { id: 7, name: 'Ada' } },
      },
    ]);
    const next = vi.fn(async () => ({ user: { id: 7, name: 'live' } }));
    try {
      let settled = false;
      const result = executeCraftHttpTrace(
        Injector.create({ providers: [] }),
        { method: 'POST', url: '/users', payload: { id: 7 } },
        next,
      ).then((value) => {
        settled = true;
        return value;
      });

      ɵadvanceCraftHttpReplay(79);
      await Promise.resolve();
      expect(settled).toBe(false);
      ɵadvanceCraftHttpReplay(80);

      await expect(result).resolves.toEqual({ user: { id: 7, name: 'Ada' } });
      expect(next).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('replays a recorded HTTP failure without calling the live transport', async () => {
    const restore = ɵinstallCraftHttpReplay([
      {
        context: { method: 'GET', url: '/failure' },
        elapsedMs: 25,
        phase: 'failed',
        response: { message: 'Recorded server failure' },
      },
    ]);
    const next = vi.fn(async () => 'live response');
    try {
      const request = executeCraftHttpTrace(
        Injector.create({ providers: [] }),
        { method: 'GET', url: '/failure' },
        next,
      );
      ɵadvanceCraftHttpReplay(24);
      await Promise.resolve();
      ɵadvanceCraftHttpReplay(25);

      await expect(request).rejects.toThrow('Recorded server failure');
      expect(next).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('keeps identical concurrent requests paired when their results finish out of order', async () => {
    const context = { method: 'GET', url: '/same-request' };
    const restore = ɵinstallCraftHttpReplay([
      {
        context,
        elapsedMs: 100,
        phase: 'succeeded',
        response: { result: 'first request' },
      },
      {
        context,
        elapsedMs: 50,
        phase: 'succeeded',
        response: { result: 'second request' },
      },
    ]);
    const next = vi.fn(async () => ({ result: 'live response' }));
    try {
      const injector = Injector.create({ providers: [] });
      let firstSettled = false;
      const first = executeCraftHttpTrace(injector, context, next).then(
        (response) => {
          firstSettled = true;
          return response;
        },
      );
      const second = executeCraftHttpTrace(injector, context, next);

      ɵadvanceCraftHttpReplay(50);
      await expect(second).resolves.toEqual({ result: 'second request' });
      expect(firstSettled).toBe(false);
      expect(next).not.toHaveBeenCalled();

      ɵadvanceCraftHttpReplay(100);
      await expect(first).resolves.toEqual({ result: 'first request' });
      expect(next).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('uses replay keys to match identical concurrent requests when their start order changes', async () => {
    const restore = ɵinstallCraftHttpReplay([
      {
        context: {
          method: 'GET',
          url: '/same-request',
          replayKey: 'profile-a',
        },
        elapsedMs: 100,
        phase: 'succeeded',
        response: { profile: 'A' },
      },
      {
        context: {
          method: 'GET',
          url: '/same-request',
          replayKey: 'profile-b',
        },
        elapsedMs: 50,
        phase: 'succeeded',
        response: { profile: 'B' },
      },
    ]);
    const next = vi.fn(async () => ({ profile: 'live' }));
    try {
      const injector = Injector.create({ providers: [] });
      const profileB = executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/same-request', replayKey: 'profile-b' },
        next,
      );
      const profileA = executeCraftHttpTrace(
        injector,
        { method: 'GET', url: '/same-request', replayKey: 'profile-a' },
        next,
      );

      ɵadvanceCraftHttpReplay(50);
      await expect(profileB).resolves.toEqual({ profile: 'B' });
      ɵadvanceCraftHttpReplay(100);
      await expect(profileA).resolves.toEqual({ profile: 'A' });
      expect(next).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('does not consume a recorded response for a different request payload', async () => {
    const restore = ɵinstallCraftHttpReplay([
      {
        context: { method: 'POST', url: '/users', payload: { id: 7 } },
        elapsedMs: 0,
        phase: 'succeeded',
        response: { user: 'Ada' },
      },
    ]);
    try {
      ɵsetCraftReplayMode(true);
      const next = vi.fn(async () => ({ user: 'live' }));
      await expect(
        executeCraftHttpTrace(
          Injector.create({ providers: [] }),
          { method: 'POST', url: '/users', payload: { id: 8 } },
          next,
        ),
      ).rejects.toThrow('no recorded Craft HTTP result');
      expect(next).not.toHaveBeenCalled();
    } finally {
      ɵsetCraftReplayMode(false);
      restore();
    }
  });
});
