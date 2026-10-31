// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { craftService, query, ɵloopGuardOf } from '@craft-ts/core';
import { craftComponent } from './component';
import { withComponentProviders } from './composition';
import { div, p } from './hyperscript';
import { renderCraftComponent } from './testing';
import {
  expectPageToSettle,
  expectRouteToSettle,
  judgePageStability,
} from './testing-stability';
import {
  dismissLoopGuardBanner,
  provideCraftLoopGuard,
} from './loop-guard-banner';

let sequence = 0;

/** A page whose function declares a service with a query. */
function sessionsPage() {
  sequence += 1;
  const id = sequence;
  let loads = 0;
  const serviceName = `loopGuardSessions${id}`;
  const capitalizedServiceName =
    serviceName[0]!.toUpperCase() + serviceName.slice(1);
  const serviceApi = craftService(
    { name: serviceName, providedIn: 'toProvide' },
    function* () {
      yield* query('sessions', {
        params: () => true,
        loader: async () => {
          loads += 1;
          return [1, 2, 3];
        },
      });
    },
  ) as unknown as Record<string, unknown>;
  const service = serviceApi[capitalizedServiceName] as () => Generator<
    unknown,
    unknown,
    unknown
  >;
  const provideService = serviceApi[
    `provide${capitalizedServiceName}`
  ] as () => unknown;
  const Page = craftComponent(`LoopGuardPage${id}`, {}, function* () {
    yield* service();
    return div([p('sessions')]);
  }).pipe(withComponentProviders(() => [provideService()] as never));
  return { Page, loads: () => loads };
}

afterEach(() => document.body.replaceChildren());

describe('expectPageToSettle', () => {
  it('passes for a page that builds its query once', async () => {
    const { Page } = sessionsPage();
    const report = await expectPageToSettle(Page, { settleMs: 100 });
    expect(report.settled).toBe(true);
    expect(
      report.activity.some((entry) => entry.name === 'query:sessions'),
    ).toBe(true);
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
      {
        kind: 'instantiation',
        name: 'query:a',
        key: 'p / query:a',
        total: 9,
        inWindow: 1,
        perSecond: 0,
        tripped: false,
      },
      {
        kind: 'loader-restart',
        name: 'asyncProcess:follow',
        key: 'p / asyncProcess:follow',
        total: 3,
        inWindow: 3,
        perSecond: 0,
        tripped: false,
      },
      {
        kind: 'http-burst',
        name: 'GET /api/x',
        key: 'GET /api/x',
        total: 4,
        inWindow: 4,
        perSecond: 0,
        tripped: false,
      },
    ] as const;
    const report = judgePageStability(activity, {
      perKey: {
        'asyncProcess:follow': { loaderRuns: 3 },
        'query:*': { creations: 9 },
      },
    });
    expect(report.offences.map((offence) => offence.key)).toEqual([
      'GET /api/x',
    ]);

    const overBudget = judgePageStability(activity.slice(1, 2), {
      perKey: { 'asyncProcess:follow': { loaderRuns: 2 } },
    });
    expect(overBudget.settled).toBe(false);
    expect(overBudget.offences.map(({ key }) => key)).toEqual([
      'p / asyncProcess:follow',
    ]);
  });
});

describe('expectRouteToSettle', () => {
  it('mounts the outlet on a url and judges the routed page', async () => {
    const { Page } = sessionsPage();
    const routes = [{ path: 'sessions', component: Page as never }];
    const report = await expectRouteToSettle(routes, '/sessions', {
      settleMs: 100,
    });
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
      (
        globalThis as { __CRAFT_LOOP_GUARD__?: { reports(): unknown[] } }
      ).__CRAFT_LOOP_GUARD__?.reports(),
    ).toHaveLength(1);
    dismissLoopGuardBanner();
    expect(document.querySelector('[data-craft-loop-guard]')).toBeNull();
    rendered.destroy();
  });
});
