import { describe, expect, it, vi } from 'vitest';
import {
  createSendContextSession,
  type SendContextReplayExport,
} from '@craft-ts/core';
import {
  validateReplayExport,
  validateDebugSessionExport,
  createRecordedResponseResolver,
  createReplayController,
  installReplayNetworkGuard,
} from './debug-session-replay';

describe('debug session replay format', () => {
  it('rejects invalid, incompatible and truncated exports', () => {
    expect(validateReplayExport('{')).toMatchObject({ ok: false });
    expect(
      validateReplayExport('{"format":"other","version":1}'),
    ).toMatchObject({ ok: false });
    expect(
      validateReplayExport(
        '{"format":"craft-debug-session","version":1,"startUrl":"/","exportedAt":0,"truncated":true,"events":[],"clips":[]}',
      ),
    ).toMatchObject({ ok: false });
  });

  it('exports complete versioned, redacted sessions', () => {
    const session = createSendContextSession();
    session.capture('dom', 'emitted', {
      name: 'click',
      payload: { token: 'secret', selector: '#button', action: 'click' },
    });
    const exported = session.exportSessionJson();
    expect(validateReplayExport(exported)).toMatchObject({ ok: true });
    expect(JSON.parse(exported)).toMatchObject({ version: 2 });
    expect(exported).toContain('[REDACTED]');
  });

  it('continues to import complete v1 fixtures', () => {
    const fixture = JSON.stringify({
      format: 'craft-debug-session',
      version: 1,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [],
      clips: [],
    });
    expect(validateReplayExport(fixture)).toMatchObject({
      ok: true,
      session: { version: 1 },
    });
  });

  it('accepts sessions with more than 10,000 events without dropping entries', () => {
    const events = Array.from({ length: 10_001 }, (_, index) => ({
      id: `event-${index + 1}`,
      sequence: index + 1,
      timestamp: index + 1,
      kind: 'craft',
      phase: 'started',
    }));
    const validation = validateDebugSessionExport(
      JSON.stringify({
        format: 'craft-debug-session',
        version: 2,
        startUrl: 'http://localhost/',
        exportedAt: 10_001,
        truncated: false,
        events,
        clips: [],
      }),
    );

    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.session.events).toHaveLength(10_001);
  });

  it('accepts recorded viewport metadata and rejects invalid dimensions', () => {
    const session = {
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [],
      clips: [],
      viewport: { width: 1280, height: 720 },
    };

    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: true,
      session: { viewport: { width: 1280, height: 720 } },
    });
    expect(
      validateReplayExport(
        JSON.stringify({ ...session, viewport: { width: 0, height: 720 } }),
      ),
    ).toMatchObject({ ok: false });
  });

  it('rejects replay actions without a selector or action', () => {
    const session = {
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      events: [
        {
          id: 'event-1',
          sequence: 1,
          timestamp: 1,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '[', action: '' },
        },
      ],
      clips: [],
    };

    expect(validateReplayExport(JSON.stringify(session))).toMatchObject({
      ok: false,
      error: expect.stringContaining('invalid selector or action'),
    });
  });

  it('stops safely when an imported selector is syntactically invalid', async () => {
    const errors: string[] = [];
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'invalid-selector',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '[', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      onError: (message) => errors.push(message),
    });

    await expect(replay.step()).resolves.toBeUndefined();

    expect(errors[0]).toContain('selector is invalid or not found');
    expect(replay.index()).toBe(0);
  });

  it('matches only recorded HTTP requests and never falls through', async () => {
    const started = {
      id: 'start',
      sequence: 1,
      timestamp: 1,
      kind: 'http',
      phase: 'started',
      operationId: 'op',
      payload: { method: 'GET', url: 'https://example.test/api' },
    } as const;
    const finished = {
      id: 'end',
      sequence: 2,
      timestamp: 2,
      kind: 'http',
      phase: 'succeeded',
      operationId: 'op',
      response: { data: [1] },
    } as const;
    const resolver = createRecordedResponseResolver({
      format: 'craft-debug-session',
      version: 1,
      startUrl: 'https://example.test/',
      exportedAt: 2,
      truncated: false,
      events: [started, finished],
      clips: [],
    });
    const response = await resolver(new Request('http://localhost/api'));
    expect(await response?.json()).toEqual({ data: [1] });
    expect(
      await resolver(new Request('http://localhost/unrecorded')),
    ).toBeUndefined();
  });

  it('rejects unknown live requests during replay', async () => {
    let unmatched = false;
    const restore = installReplayNetworkGuard(
      async () => undefined,
      () => {
        unmatched = true;
      },
    );
    try {
      await expect(fetch('http://localhost/unrecorded')).rejects.toThrow(
        /no recorded response/,
      );
      expect(unmatched).toBe(true);
    } finally {
      restore();
    }
  });

  it('advances the virtual clock one recorded interaction at a time', async () => {
    document.body.innerHTML = '<button id="replay-target">Go</button>';
    const target = document.querySelector('#replay-target')!;
    let clicks = 0;
    target.addEventListener('click', () => clicks++);
    const session = {
      format: 'craft-debug-session' as const,
      version: 1 as const,
      startUrl: 'http://localhost/',
      exportedAt: 2_000,
      truncated: false,
      clips: [],
      events: [1_000, 2_000].map((timestamp, index) => ({
        id: `e${index}`,
        sequence: index + 1,
        timestamp,
        kind: 'dom' as const,
        phase: 'emitted' as const,
        payload: { selector: '#replay-target', action: 'click' },
      })),
    };
    const replay = createReplayController(session);
    let timerRan = false;
    replay.clock.schedule(() => {
      timerRan = true;
    }, 500);
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

  it('restores the recorded page scroll before replaying a click', async () => {
    document.body.innerHTML =
      '<div id="replay-scroller"><button id="scrolled-replay">Save</button></div>';
    const target = document.querySelector('#scrolled-replay')!;
    const scroller = document.querySelector<HTMLElement>('#replay-scroller')!;
    let scrollTopAtClick = 0;
    target.addEventListener('click', () => {
      scrollTopAtClick = scroller.scrollTop;
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const recordedInteraction = {
      id: 'scroll-click',
      sequence: 1,
      timestamp: 1_000,
      kind: 'dom' as const,
      phase: 'emitted' as const,
      payload: {
        selector: '#scrolled-replay',
        action: 'click',
        clientX: 150,
        clientY: 80,
        scrollX: 0,
        scrollY: 640,
        scrollAncestors: [
          {
            selector: '#replay-scroller',
            scrollLeft: 0,
            scrollTop: 321,
          },
        ],
      },
    };
    const onInteraction = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 2,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [recordedInteraction],
      },
      { onInteraction },
    );

    await replay.step();

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 640,
      behavior: 'instant',
    });
    expect(scrollTopAtClick).toBe(321);
    expect(onInteraction).toHaveBeenCalledWith(recordedInteraction, target);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('replays standalone viewport scroll steps without waiting for a click', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    const scrollStep = {
      id: 'standalone-scroll',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'scroll' as const,
      phase: 'emitted' as const,
      name: 'Viewport scroll',
      payload: { target: 'viewport', scrollX: 0, scrollY: 420 },
    };
    const onScroll = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 2,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [scrollStep],
      },
      { onScroll },
    );

    await replay.step();

    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 420,
      behavior: 'instant',
    });
    expect(onScroll).toHaveBeenCalledWith(scrollStep);
    expect(replay.index()).toBe(1);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('replays viewport size changes in order and awaits each resize', async () => {
    const portrait = {
      id: 'viewport-portrait',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 390, height: 844 },
    };
    const landscape = {
      id: 'viewport-landscape',
      sequence: 2,
      timestamp: 1_000,
      elapsedMs: 125,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 844, height: 390 },
    };
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [portrait, landscape],
    };
    const onViewport = vi.fn(async () => undefined);
    const onProgress = vi.fn();
    const replay = createReplayController(session, { onViewport, onProgress });

    await replay.step();
    await replay.step();

    expect(onViewport.mock.calls).toEqual([[portrait], [landscape]]);
    expect(replay.index()).toBe(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'completed');
    replay.stop();
  });

  it('reports a viewport resize failure without leaving the replay promise rejected', async () => {
    const viewportStep = {
      id: 'viewport-timeout',
      sequence: 1,
      timestamp: 1_000,
      elapsedMs: 50,
      kind: 'viewport' as const,
      phase: 'emitted' as const,
      payload: { width: 390, height: 844 },
    };
    const onError = vi.fn();
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 2,
        startUrl: 'http://localhost/',
        exportedAt: 1_000,
        truncated: false,
        clips: [],
        events: [viewportStep],
      },
      {
        onViewport: async () => {
          throw new Error('viewport resize timed out');
        },
        onError,
      },
    );

    await expect(replay.step()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith('viewport resize timed out');
    expect(replay.index()).toBe(0);
  });

  it('replays a standalone nested scroll before the next interaction', async () => {
    document.body.innerHTML =
      '<div id="nested-scroller"><button id="after-scroll">Continue</button></div>';
    const scroller = document.querySelector<HTMLElement>('#nested-scroller')!;
    const target = document.querySelector<HTMLButtonElement>('#after-scroll')!;
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        scroller.dispatchEvent(new Event('scroll'));
      },
    });
    let observedScrollAtClick = 0;
    target.addEventListener('click', () => {
      observedScrollAtClick = scroller.scrollTop;
    });
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'nested-scroll',
          sequence: 1,
          timestamp: 1_000,
          elapsedMs: 0,
          kind: 'scroll',
          phase: 'emitted',
          payload: {
            target: 'element',
            selector: '#nested-scroller',
            scrollLeft: 0,
            scrollTop: 260,
          },
        },
        {
          id: 'following-click',
          sequence: 2,
          timestamp: 1_500,
          elapsedMs: 500,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-scroll', action: 'click' },
        },
      ],
    });

    await replay.step();
    await replay.step();

    expect(observedScrollAtClick).toBe(260);
    expect(replay.index()).toBe(2);
    replay.stop();
  });

  it('waits for scroll-triggered actions before dispatching the recorded click', async () => {
    document.body.innerHTML =
      '<button id="load-after-scroll">Continue</button>';
    const target = document.querySelector('#load-after-scroll')!;
    const order: string[] = [];
    const onScroll = () => order.push('scroll-triggered-load');
    window.addEventListener('scroll', onScroll, { once: true });
    target.addEventListener('click', () => order.push('recorded-click'));
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      window.setTimeout(() => {
        window.dispatchEvent(new Event('scroll'));
      }, 0);
    });
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'scroll-before-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#load-after-scroll',
            action: 'click',
            scrollX: 0,
            scrollY: 640,
          },
        },
      ],
    });

    await replay.step();

    expect(order).toEqual(['scroll-triggered-load', 'recorded-click']);
    window.removeEventListener('scroll', onScroll);
    replay.stop();
    scrollTo.mockRestore();
  });

  it('waits for actions triggered by a scrolled container before clicking', async () => {
    document.body.innerHTML =
      '<div id="lazy-list"><button id="lazy-item">Open</button></div>';
    const scroller = document.querySelector<HTMLElement>('#lazy-list')!;
    const target = document.querySelector('#lazy-item')!;
    const order: string[] = [];
    let scrollTop = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
        window.setTimeout(() => scroller.dispatchEvent(new Event('scroll')), 0);
      },
    });
    scroller.addEventListener('scroll', () => order.push('lazy-load'), {
      once: true,
    });
    target.addEventListener('click', () => order.push('recorded-click'));
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'container-scroll-before-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#lazy-item',
            action: 'click',
            scrollAncestors: [
              { selector: '#lazy-list', scrollLeft: 0, scrollTop: 255 },
            ],
          },
        },
      ],
    });

    await replay.step();

    expect(order).toEqual(['lazy-load', 'recorded-click']);
    replay.stop();
  });

  it('does not reapply scroll positions that are already current', async () => {
    document.body.innerHTML = '<button id="already-scrolled">Continue</button>';
    const target = document.querySelector('#already-scrolled')!;
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const replay = createReplayController({
      format: 'craft-debug-session',
      version: 2,
      startUrl: 'http://localhost/',
      exportedAt: 1_000,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'same-scroll-click',
          sequence: 1,
          timestamp: 1_000,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#already-scrolled',
            action: 'click',
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          },
        },
      ],
    });

    await replay.step();

    expect(scrollTo).not.toHaveBeenCalled();
    replay.stop();
    scrollTo.mockRestore();
  });

  it('compares named Craft call phases in recorded order', async () => {
    document.body.innerHTML = '<button id="ordered-replay">Run</button>';
    const target = document.querySelector('#ordered-replay')!;
    const observed: Array<Record<string, unknown>> = [];
    target.addEventListener('click', () => {
      observed.push({
        id: 'actual-start',
        sequence: 2,
        timestamp: 1,
        kind: 'craft',
        phase: 'started',
        name: 'saveUser',
        payload: { comparable: true },
      });
      observed.push({
        id: 'actual-end',
        sequence: 3,
        timestamp: 2,
        kind: 'craft',
        phase: 'succeeded',
        name: 'saveUser',
        payload: { comparable: true },
      });
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#ordered-replay', action: 'click' },
        },
        {
          id: 'expected-start',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'craft',
          phase: 'started',
          name: 'saveUser',
          payload: { comparable: true },
        },
        {
          id: 'expected-end',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'craft',
          phase: 'succeeded',
          name: 'saveUser',
          payload: { comparable: true },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      observedEvents: () => observed as never,
    });
    expect(await replay.step()).toBeUndefined();
    expect(observed).toHaveLength(2);
    replay.stop();
  });

  it('reports the first primitive checkpoint mismatch', async () => {
    document.body.innerHTML = '<button id="state-replay">Run</button>';
    const target = document.querySelector('#state-replay')!;
    target.addEventListener('click', () => undefined);
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#state-replay', action: 'click' },
        },
        {
          id: 'checkpoint',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
    });
    expect(await replay.step()).toMatchObject({
      eventId: 'checkpoint',
      expected: { count: 1 },
      actual: { count: 2 },
    });
    replay.stop();
  });

  it('continues when a checkpoint contains primitives from a different route lifecycle', async () => {
    document.body.innerHTML =
      '<button id="route-change">Navigate</button><button id="after-route-change">Continue</button>';
    let continued = false;
    document
      .querySelector('#after-route-change')!
      .addEventListener('click', () => {
        continued = true;
      });
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'route-change-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#route-change', action: 'click' },
        },
        {
          id: 'route-change-checkpoint',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { shared: { value: 1 }, 'old-route/users': [{ id: 3 }] },
        },
        {
          id: 'continue-dom',
          sequence: 3,
          timestamp: 12,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-route-change', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ shared: { value: 1 }, 'new-route/query': 'loading' }),
    });

    expect(await replay.step()).toBeUndefined();
    expect(await replay.step()).toBeUndefined();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('forces the recorded href and checkpoint, then continues at the next interaction', async () => {
    document.body.innerHTML =
      '<button id="force-replay">Navigate</button><button id="after-force">Continue</button>';
    let continued = false;
    document.querySelector('#after-force')!.addEventListener('click', () => {
      continued = true;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'dom-navigation',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: {
            selector: '#force-replay',
            action: 'click',
            href: 'http://localhost/expected-route',
          },
        },
        {
          id: 'expected-checkpoint',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { route: '/expected-route' },
        },
        {
          id: 'dom-continue',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-force', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const forceRecovery = vi.fn();
    const replay = createReplayController(session, {
      readState: () => ({ route: '/actual-route' }),
      forceRecovery,
    });

    const difference = await replay.step();
    expect(difference?.recovery).toEqual({
      href: 'http://localhost/expected-route',
      state: { route: '/expected-route' },
    });
    expect(replay.index()).toBe(0);

    await replay.forceAndContinue();
    expect(forceRecovery).toHaveBeenCalledWith({
      href: 'http://localhost/expected-route',
      state: { route: '/expected-route' },
    });
    expect(replay.index()).toBe(1);
    await replay.step();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('offers an explicit checkpoint skip and records the interval', async () => {
    document.body.innerHTML =
      '<button id="skip-replay">Diverge</button><button id="after-skip">Continue</button>';
    document
      .querySelector('#skip-replay')!
      .addEventListener('click', () => undefined);
    let continued = false;
    document.querySelector('#after-skip')!.addEventListener('click', () => {
      continued = true;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'skip-dom',
          sequence: 1,
          timestamp: 10,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#skip-replay', action: 'click' },
        },
        {
          id: 'mismatch',
          sequence: 2,
          timestamp: 11,
          elapsedMs: 1,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'resume-checkpoint',
          sequence: 3,
          timestamp: 12,
          elapsedMs: 2,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'continue-dom',
          sequence: 4,
          timestamp: 13,
          elapsedMs: 3,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#after-skip', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const forceRecovery = vi.fn();
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
      forceRecovery,
    });

    const difference = await replay.step();
    expect(difference?.skip).toEqual({
      checkpointEventId: 'resume-checkpoint',
      index: 1,
    });
    const skipped = await replay.skipToCheckpoint();
    expect(skipped).toEqual({
      from: 1,
      to: 1,
      checkpointEventId: 'resume-checkpoint',
    });
    expect(forceRecovery).toHaveBeenCalledWith({ state: { count: 3 } });
    expect(replay.index()).toBe(1);
    await replay.step();
    expect(continued).toBe(true);
    replay.stop();
  });

  it('does not offer a checkpoint skip across an open operation boundary', async () => {
    document.body.innerHTML = '<button id="blocked-skip">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'blocked-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#blocked-skip', action: 'click' },
        },
        {
          id: 'blocked-difference',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'open-http',
          sequence: 3,
          timestamp: 12,
          kind: 'http',
          phase: 'started',
          operationId: 'http-1',
        },
        {
          id: 'blocked-checkpoint',
          sequence: 4,
          timestamp: 13,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'blocked-next-dom',
          sequence: 5,
          timestamp: 14,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#blocked-skip', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
      forceRecovery: vi.fn(),
    });
    const difference = await replay.step();
    expect(difference?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it.each([
    {
      name: 'when the checkpoint has no registry identity in common',
      checkpoint: { anotherPrimitive: 3 },
      nextInteraction: true,
    },
    {
      name: 'when the checkpoint is the final interaction',
      checkpoint: { count: 3 },
      nextInteraction: false,
    },
    {
      name: 'when no later checkpoint exists',
      checkpoint: undefined,
      nextInteraction: true,
    },
  ])('does not offer a skip $name', async (scenario) => {
    document.body.innerHTML = '<button id="ineligible-skip">Run</button>';
    const events: SendContextReplayExport['events'][number][] = [
      {
        id: 'ineligible-dom',
        sequence: 1,
        timestamp: 10,
        kind: 'dom',
        phase: 'emitted',
        payload: { selector: '#ineligible-skip', action: 'click' },
      },
      {
        id: 'ineligible-difference',
        sequence: 2,
        timestamp: 11,
        kind: 'primitive',
        phase: 'emitted',
        state: { count: 1 },
      },
    ];
    if (scenario.checkpoint) {
      events.push({
        id: 'ineligible-checkpoint',
        sequence: 3,
        timestamp: 12,
        kind: 'snapshot',
        phase: 'emitted',
        state: scenario.checkpoint,
      });
    }
    if (scenario.nextInteraction) {
      events.push({
        id: 'ineligible-next-dom',
        sequence: events.length + 1,
        timestamp: 13,
        kind: 'dom',
        phase: 'emitted',
        payload: { selector: '#ineligible-skip', action: 'click' },
      });
    }
    const replay = createReplayController(
      {
        format: 'craft-debug-session',
        version: 2,
        startUrl: 'http://localhost/',
        exportedAt: 14,
        truncated: false,
        clips: [],
        events,
      },
      {
        readState: () => ({ count: 2 }),
        forceRecovery: vi.fn(),
      },
    );

    expect((await replay.step())?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it('refuses to skip across a started Craft operation without an identity', async () => {
    document.body.innerHTML = '<button id="anonymous-craft">Run</button>';
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 10,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'anonymous-dom',
          sequence: 1,
          timestamp: 10,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#anonymous-craft', action: 'click' },
        },
        {
          id: 'anonymous-difference',
          sequence: 2,
          timestamp: 11,
          kind: 'primitive',
          phase: 'emitted',
          state: { count: 1 },
        },
        {
          id: 'anonymous-start',
          sequence: 3,
          timestamp: 12,
          kind: 'craft',
          phase: 'started',
        },
        {
          id: 'anonymous-checkpoint',
          sequence: 4,
          timestamp: 13,
          kind: 'snapshot',
          phase: 'emitted',
          state: { count: 3 },
        },
        {
          id: 'anonymous-next-dom',
          sequence: 5,
          timestamp: 14,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#anonymous-craft', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      readState: () => ({ count: 2 }),
      forceRecovery: vi.fn(),
    });

    expect((await replay.step())?.skip).toBeUndefined();
    expect(await replay.skipToCheckpoint()).toBeUndefined();
    replay.stop();
  });

  it('uses relative monotonic offsets from v2 for playback timing', async () => {
    document.body.innerHTML = '<button id="relative-replay">Run</button>';
    const target = document.querySelector('#relative-replay')!;
    target.addEventListener('click', () => undefined);
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1000,
      truncated: false,
      clips: [],
      events: [0, 250].map((elapsedMs, index) => ({
        id: `relative-${index}`,
        sequence: index + 1,
        timestamp: 9000 + index,
        elapsedMs,
        kind: 'dom' as const,
        phase: 'emitted' as const,
        payload: { selector: '#relative-replay', action: 'click' },
      })),
    };
    const replay = createReplayController(session);
    await replay.step();
    expect(replay.clock.now()).toBe(0);
    await replay.step();
    expect(replay.clock.now()).toBe(250);
    replay.stop();
  });

  it('plays interactions after their relative delays and can pause', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<button id="timed-replay">Run</button>';
      const target = document.querySelector('#timed-replay')!;
      let clicks = 0;
      target.addEventListener('click', () => clicks++);
      const session = {
        format: 'craft-debug-session' as const,
        version: 2 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [0, 250].map((elapsedMs, index) => ({
          id: `timed-${index}`,
          sequence: index + 1,
          timestamp: 5000 + index,
          elapsedMs,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: { selector: '#timed-replay', action: 'click' },
        })),
      };
      const playbackUpdates: Array<readonly [number, number, string, number?]> =
        [];
      const replay = createReplayController(session, {
        onProgress: (index, total, state, nextDelayMs) =>
          playbackUpdates.push([index, total, state, nextDelayMs]),
      });
      replay.play();
      expect(playbackUpdates[0]).toEqual([0, 2, 'playing', 0]);
      await vi.advanceTimersByTimeAsync(0);
      expect(clicks).toBe(1);
      expect(playbackUpdates.at(-1)).toEqual([1, 2, 'playing', 250]);
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      replay.pause();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks).toBe(1);
      replay.play();
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add Craft-event settling time on top of recorded playback delays', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<button id="settled-replay">Run</button>';
      const target = document.querySelector('#settled-replay')!;
      const observed: Array<Record<string, unknown>> = [];
      let clicks = 0;
      target.addEventListener('click', () => {
        clicks += 1;
        if (clicks !== 1) return;
        setTimeout(() => {
          observed.push({
            id: 'actual-start',
            sequence: 2,
            timestamp: 100,
            elapsedMs: 100,
            kind: 'craft',
            phase: 'started',
            name: 'loadData',
          });
        }, 100);
        setTimeout(() => {
          observed.push({
            id: 'actual-end',
            sequence: 3,
            timestamp: 150,
            elapsedMs: 150,
            kind: 'craft',
            phase: 'succeeded',
            name: 'loadData',
          });
        }, 150);
      });
      const session = {
        format: 'craft-debug-session' as const,
        version: 2 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'first-click',
            sequence: 1,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#settled-replay', action: 'click' },
          },
          {
            id: 'query-start',
            sequence: 2,
            timestamp: 5100,
            elapsedMs: 100,
            kind: 'craft',
            phase: 'started',
            name: 'loadData',
          },
          {
            id: 'query-end',
            sequence: 3,
            timestamp: 5150,
            elapsedMs: 150,
            kind: 'craft',
            phase: 'succeeded',
            name: 'loadData',
          },
          {
            id: 'second-click',
            sequence: 4,
            timestamp: 5200,
            elapsedMs: 200,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#settled-replay', action: 'click' },
          },
        ],
      } as const satisfies SendContextReplayExport;
      const replay = createReplayController(session, {
        observedEvents: () => observed as never,
      });

      replay.play();
      await vi.advanceTimersByTimeAsync(199);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts recorded delays after replay preparation finishes', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML =
        '<button id="prepared-timing-replay">Run</button>';
      const target = document.querySelector('#prepared-timing-replay')!;
      let clicks = 0;
      target.addEventListener('click', () => clicks++);
      const session = {
        format: 'craft-debug-session' as const,
        version: 2 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [0, 250].map((elapsedMs, index) => ({
          id: `prepared-timing-${index}`,
          sequence: index + 1,
          timestamp: 5000 + elapsedMs,
          elapsedMs,
          kind: 'dom' as const,
          phase: 'emitted' as const,
          payload: {
            selector: '#prepared-timing-replay',
            action: 'click',
          },
        })),
      } as const satisfies SendContextReplayExport;
      const replay = createReplayController(session, {
        prepare: () => new Promise((resolve) => setTimeout(resolve, 1000)),
      });

      replay.play();
      await vi.advanceTimersByTimeAsync(1000);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(249);
      expect(clicks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(clicks).toBe(2);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a delayed query result hidden until its recorded completion time', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML =
        '<button id="query-timing-replay">Load</button>';
      const target = document.querySelector('#query-timing-replay')!;
      const observed: Array<Record<string, unknown>> = [];
      let resultVisible = false;
      let replay: ReturnType<typeof createReplayController>;
      target.addEventListener('click', () => {
        observed.push({
          id: 'query-start-actual',
          sequence: 1,
          timestamp: 0,
          elapsedMs: 0,
          kind: 'craft',
          phase: 'started',
          name: 'userQuery',
        });
        replay.clock.schedule(() => {
          resultVisible = true;
          observed.push({
            id: 'query-success-actual',
            sequence: 2,
            timestamp: 2000,
            elapsedMs: 2000,
            kind: 'craft',
            phase: 'succeeded',
            name: 'userQuery',
          });
        }, 2000);
      });
      const session = {
        format: 'craft-debug-session' as const,
        version: 2 as const,
        startUrl: 'http://localhost/',
        exportedAt: 1000,
        truncated: false,
        clips: [],
        events: [
          {
            id: 'query-button-click',
            sequence: 1,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'dom',
            phase: 'emitted',
            payload: { selector: '#query-timing-replay', action: 'click' },
          },
          {
            id: 'query-start',
            sequence: 2,
            timestamp: 5000,
            elapsedMs: 0,
            kind: 'craft',
            phase: 'started',
            name: 'userQuery',
          },
          {
            id: 'query-success',
            sequence: 3,
            timestamp: 7000,
            elapsedMs: 2000,
            kind: 'craft',
            phase: 'succeeded',
            name: 'userQuery',
          },
        ],
      } as const satisfies SendContextReplayExport;
      replay = createReplayController(session, {
        observedEvents: () => observed as never,
      });

      replay.play();
      await vi.advanceTimersByTimeAsync(1999);
      expect(resultVisible).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resultVisible).toBe(true);
      replay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('prepares a start snapshot before dispatching the first interaction', async () => {
    document.body.innerHTML = '<button id="prepared-replay">Run</button>';
    const target = document.querySelector('#prepared-replay')!;
    let restored = false;
    let clickedWithRestoredState = false;
    target.addEventListener('click', () => {
      clickedWithRestoredState = restored;
    });
    const session = {
      format: 'craft-debug-session' as const,
      version: 2 as const,
      startUrl: 'http://localhost/',
      exportedAt: 1,
      truncated: false,
      clips: [],
      events: [
        {
          id: 'prepared-dom',
          sequence: 1,
          timestamp: 1,
          elapsedMs: 0,
          kind: 'dom',
          phase: 'emitted',
          payload: { selector: '#prepared-replay', action: 'click' },
        },
      ],
    } as const satisfies SendContextReplayExport;
    const replay = createReplayController(session, {
      prepare: () => {
        restored = true;
      },
    });
    await replay.step();
    expect(clickedWithRestoredState).toBe(true);
    replay.stop();
  });
});
