// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  craftService,
  craftSignal,
  query,
  ɵloopGuardOf,
} from '@craft-ts/core';
import { craftComponent } from './component';
import { div, p } from './hyperscript';
import { renderCraftComponent } from './testing';
import {
  expectPageToSettle,
  expectRouteToSettle,
  judgePageStability,
} from './testing-stability';
import { dismissLoopGuardBanner, provideCraftLoopGuard } from './loop-guard-banner';

let sequence = 0;

/** A page whose function declares a service with a query. */
function sessionsPage() {
  sequence += 1;
  const id = sequence;
  let loads = 0;
  const service = craftService(
    { name: `loopGuardSessions${id}`, providedIn: 'function' },
    function* () {
      yield* query('sessions', {
        params: () => true,
        loader: async () => {
          loads += 1;
          return [1, 2, 3];
        },
      });
    },
  ) as unknown as Record<string, () => Generator<unknown, unknown, unknown>>;
  const Page = craftComponent(`LoopGuardPage${id}`, {}, function* () {
    yield* service[`LoopGuardSessions${id}`]();
    return div([p('sessions')]);
  });
  return { Page, loads: () => loads };
}

/** A page that really loops: its function reads a signal that keeps changing. */
function loopingPage() {
  sequence += 1;
  const id = sequence;
  const tick = craftSignal(0);
  const service = craftService(
    { name: `loopGuardLoop${id}`, providedIn: 'function' },
    function* () {
      yield* query('sessions', { params: () => true, loader: async () => [1] });
    },
  ) as unknown as Record<string, () => Generator<unknown, unknown, unknown>>;
  const Page = craftComponent(`LoopGuardLoop${id}`, {}, function* () {
    tick();
    yield* service[`LoopGuardLoop${id}`]();
    return div([p('looping')]);
  });
  return { Page, tick };
}

afterEach(() => document.body.replaceChildren());

describe('expectPageToSettle', () => {
  it('passes for a page that builds its query once', async () => {
    const { Page } = sessionsPage();
    const report = await expectPageToSettle(Page, { settleMs: 100 });
    expect(report.settled).toBe(true);
    expect(report.activity.some((entry) => entry.name === 'query:sessions')).toBe(true);
  });

  it('fails, naming the primitive, when the page keeps rebuilding it', async () => {
    const { Page, tick } = loopingPage();
    const timer = setInterval(() => tick.update((value) => value + 1), 4);
    try {
      await expect(
        expectPageToSettle(Page, { settleMs: 400, budget: { creations: 5 } }),
      ).rejects.toThrow(/did not settle[\s\S]*query:sessions/);
    } finally {
      clearInterval(timer);
    }
  });

  it('accepts an explicit per-key budget over the general one', async () => {
    const strict = sessionsPage();
    await expect(
      expectPageToSettle(strict.Page, {
        settleMs: 50,
        budget: { creations: 0, loaderRuns: 0 },
      }),
    ).rejects.toThrow(/did not settle/);
    const declared = sessionsPage();
    await expect(
      expectPageToSettle(declared.Page, {
        settleMs: 50,
        budget: {
          creations: 0,
          loaderRuns: 0,
          perKey: { 'query:sessions': { creations: 5, loaderRuns: 5 } },
        },
      }),
    ).resolves.toMatchObject({ settled: true });
  });
});

describe('judgePageStability', () => {
  it('judges creations, loader runs and requests against the budget', () => {
    const activity = [
      { kind: 'instantiation', name: 'query:a', key: 'p / query:a', total: 9, inWindow: 1, perSecond: 0, tripped: false },
      { kind: 'loader-restart', name: 'asyncProcess:follow', key: 'p / asyncProcess:follow', total: 3, inWindow: 3, perSecond: 0, tripped: false },
      { kind: 'http-burst', name: 'GET /api/x', key: 'GET /api/x', total: 4, inWindow: 4, perSecond: 0, tripped: false },
    ] as const;
    const report = judgePageStability(activity, {
      perKey: { 'asyncProcess:follow': { loaderRuns: 3 }, 'query:*': { creations: 9 } },
    });
    expect(report.offences.map((offence) => offence.key)).toEqual(['GET /api/x']);
  });
});

describe('expectRouteToSettle', () => {
  it('mounts the outlet on a url and judges the routed page', async () => {
    const { Page } = sessionsPage();
    const routes = [{ path: 'sessions', component: Page as never }];
    const report = await expectRouteToSettle(routes, '/sessions', { settleMs: 100 });
    expect(report.settled).toBe(true);
  });
});

describe('provideCraftLoopGuard', () => {
  it('shows an alert in the page when a suspicion is raised', async () => {
    const { Page } = sessionsPage();
    const rendered = await renderCraftComponent(Page, {
      providers: provideCraftLoopGuard({
        console: false,
        thresholds: { httpRequests: 3 },
      }) as never,
    });
    const guard = ɵloopGuardOf(rendered.injector)!;
    for (let request = 0; request < 4; request += 1) {
      guard.httpRequested('GET', '/api/sessions');
    }
    const banner = document.querySelector('[data-craft-loop-guard]');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('GET /api/sessions');
    expect(
      (globalThis as { __CRAFT_LOOP_GUARD__?: { reports(): unknown[] } })
        .__CRAFT_LOOP_GUARD__?.reports(),
    ).toHaveLength(1);
    dismissLoopGuardBanner();
    expect(document.querySelector('[data-craft-loop-guard]')).toBeNull();
    rendered.destroy();
  });
});
