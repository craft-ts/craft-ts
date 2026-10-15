import {
  provideCraftRouter,
  provideLoopGuard,
  ɵinjectCraftRouterRuntime,
  ɵloopGuardOf,
  type CraftLoopGuardGlobal,
  type LoopActivity,
  type LoopGuard,
} from '@craft-ts/core';
import { runInInjectionContext } from './host-runtime';
import { CraftRouterOutlet } from './craft-router-outlet';
import { renderCraftComponent } from './testing';

/**
 * "The page settles": mount a page, watch it for a few seconds, fail if the
 * work it does exceeds an explicit budget.
 *
 * Nothing else makes a test fail when a page keeps re-instantiating, keeps
 * reloading or keeps hammering one URL — the assertions on what is drawn all
 * pass while the page loops underneath. This counts what the loop guard sees
 * (see `provideLoopGuard`), per primitive and per URL, and compares it with a
 * budget the test states.
 */

/** What one primitive or URL may do while the page settles. */
export interface PageStabilityBudget {
  /** Times a primitive may be created (a list drawing 20 rows needs 20). */
  readonly creations?: number;
  /** Times a loader may start. */
  readonly loaderRuns?: number;
  /** Requests to one method + URL (query string ignored). */
  readonly requests?: number;
}

export interface PageStabilityOptions {
  /** How long to watch after the page is mounted. Defaults to 1500 ms. */
  readonly settleMs?: number;
  /** Per-key defaults: 5 creations, 5 loader runs, 3 requests. */
  readonly budget?: PageStabilityBudget & {
    /**
     * Budgets for one key (`asyncProcess:follow`, `GET /api/sessions`, a
     * trailing `*` matches any suffix). A looping `asyncProcess` is declared
     * here: its budget is the number of iterations the test allows.
     */
    readonly perKey?: Readonly<Record<string, PageStabilityBudget>>;
  };
  /** Waits `ms`. Pass `(ms) => vi.advanceTimersByTimeAsync(ms)` under fake timers. */
  readonly wait?: (ms: number) => Promise<void>;
}

export interface PageStabilityOffence {
  readonly key: string;
  readonly measure: 'creations' | 'loaderRuns' | 'requests';
  readonly count: number;
  readonly budget: number;
}

export interface PageStabilityReport {
  readonly settled: boolean;
  readonly offences: readonly PageStabilityOffence[];
  readonly activity: readonly LoopActivity[];
}

const DEFAULT_BUDGET = { creations: 5, loaderRuns: 5, requests: 3 } as const;

const MEASURE_OF = {
  instantiation: 'creations',
  'loader-restart': 'loaderRuns',
  'http-burst': 'requests',
} as const;

const matches = (pattern: string, value: string): boolean =>
  pattern.endsWith('*')
    ? value.startsWith(pattern.slice(0, -1))
    : pattern === value;

/** Judges raw activity against a budget. Pure, so both runners share it. */
export function judgePageStability(
  activity: readonly LoopActivity[],
  budget: PageStabilityOptions['budget'] = {},
): PageStabilityReport {
  const offences: PageStabilityOffence[] = [];
  for (const entry of activity) {
    if (entry.kind === 'leaked-instance') continue;
    const measure = MEASURE_OF[entry.kind];
    const own = Object.entries(budget.perKey ?? {}).find(
      ([pattern]) => matches(pattern, entry.name) || matches(pattern, entry.key),
    )?.[1];
    const allowed =
      own?.[measure] ?? budget[measure] ?? DEFAULT_BUDGET[measure];
    if (entry.total > allowed) {
      offences.push({
        key: entry.name === entry.key ? entry.name : entry.key,
        measure,
        count: entry.total,
        budget: allowed,
      });
    }
  }
  return { settled: offences.length === 0, offences, activity };
}

export function describePageStability(report: PageStabilityReport): string {
  if (report.settled) return 'The page settled within its budget.';
  const lines = report.offences.map(
    (offence) =>
      `  - ${offence.key}: ${offence.count} ${offence.measure} (budget ${offence.budget})`,
  );
  return (
    'The page did not settle. Over budget:\n' +
    lines.join('\n') +
    '\nA count that keeps growing is a loop (remount, reload, polling without sleep); ' +
    'a count that is legitimately high needs an explicit budget in `budget.perKey`.'
  );
}

const realWait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Providers that make the page's work countable without ever firing the
 * breaker's report: thresholds are the budgets, so a runaway loop is stopped
 * (and the test fails) instead of freezing the runner.
 */
function stabilityProviders(budget: PageStabilityOptions['budget'], settleMs: number) {
  const ceiling = Math.max(
    budget?.creations ?? 0,
    budget?.requests ?? 0,
    budget?.loaderRuns ?? 0,
    ...Object.values(budget?.perKey ?? {}).flatMap((entry) => [
      entry.creations ?? 0,
      entry.requests ?? 0,
      entry.loaderRuns ?? 0,
    ]),
    DEFAULT_BUDGET.creations,
  );
  return provideLoopGuard({
    console: false,
    tripBreaker: true,
    thresholds: {
      windowMs: settleMs * 4 + 60_000,
      // Well above any budget: the breaker is there to stop a runaway loop
      // that would starve the runner's timers, not to judge the budget.
      instantiations: ceiling * 20 + 100,
      httpRequests: ceiling * 20 + 100,
      loaderRestarts: ceiling * 20 + 100,
      leakedInstances: ceiling * 20 + 100,
    },
  });
}

type RenderOptions = NonNullable<Parameters<typeof renderCraftComponent>[1]>;

/**
 * Mounts a component and fails if it does more than its budget allows while
 * settling.
 *
 * ```ts
 * await expectPageToSettle(SessionsPage, {
 *   providers: [...mockHttp],
 *   budget: { perKey: { 'asyncProcess:follow': { loaderRuns: 2 } } },
 * });
 * ```
 */
export async function expectPageToSettle(
  component: Parameters<typeof renderCraftComponent>[0],
  options: PageStabilityOptions &
    Pick<RenderOptions, 'props' | 'providers'> & {
      /** Runs once mounted, before the watch starts (a click, a navigation). */
      readonly act?: (rendered: Awaited<ReturnType<typeof renderCraftComponent>>) => Promise<void>;
    } = {},
): Promise<PageStabilityReport> {
  const settleMs = options.settleMs ?? 1500;
  const wait = options.wait ?? realWait;
  const rendered = await renderCraftComponent(component, {
    ...(options.props ? { props: options.props } : {}),
    providers: [
      ...(options.providers ?? []),
      ...(stabilityProviders(options.budget, settleMs) as never[]),
    ],
  });
  try {
    await options.act?.(rendered);
    await rendered.flush();
    await wait(settleMs);
    await rendered.flush();
    const guard: LoopGuard | null = ɵloopGuardOf(rendered.injector);
    const report = judgePageStability(guard?.activity() ?? [], options.budget);
    if (!report.settled) throw new Error(describePageStability(report));
    return report;
  } finally {
    rendered.destroy();
  }
}

/**
 * Mounts the router outlet on `url` and fails if the routed page does more
 * than its budget allows while settling. The architecture rule
 * `route-needs-stability-test` reads the `url` to know which route is covered.
 */
export async function expectRouteToSettle(
  routes: Parameters<typeof provideCraftRouter>[0],
  url: string,
  options: PageStabilityOptions & Pick<RenderOptions, 'providers'> = {},
): Promise<PageStabilityReport> {
  return expectPageToSettle(CraftRouterOutlet as never, {
    ...options,
    providers: [
      ...(provideCraftRouter(routes) as never[]),
      ...(options.providers ?? []),
    ],
    act: async (rendered) => {
      const router = runInInjectionContext(rendered.injector, () =>
        ɵinjectCraftRouterRuntime(),
      );
      if (!router) throw new Error('expectRouteToSettle: no router is provided.');
      await router.navigateByUrl(url);
    },
  });
}

// ─── in a real browser (Playwright) ─────────────────────────────────────────

/** The part of a Playwright `Page` the browser runner uses. */
export interface StabilityBrowserPage {
  goto(url: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<Result>(fn: () => Result): Promise<Result>;
  on(
    event: 'request',
    listener: (request: {
      url(): string;
      method(): string;
      resourceType(): string;
    }) => void,
  ): unknown;
}

/**
 * Opens `url` in a browser, watches network requests (and the loop guard's
 * activity when the app installed `provideLoopGuard()`), and fails over
 * budget. Network counting needs nothing from the app; the guard adds
 * creations and loader runs.
 */
export async function expectPageToSettleInBrowser(
  page: StabilityBrowserPage,
  url: string,
  options: PageStabilityOptions = {},
): Promise<PageStabilityReport> {
  const settleMs = options.settleMs ?? 3000;
  const requests = new Map<string, number>();
  page.on('request', (request) => {
    const type = request.resourceType();
    if (type !== 'fetch' && type !== 'xhr') return;
    const key = `${request.method()} ${request.url().split(/[?#]/, 1)[0]}`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
  });
  await page.goto(url);
  await page.waitForTimeout(settleMs);

  const guarded = await page.evaluate(() => {
    const bridge = (globalThis as Record<string, unknown>)[
      '__CRAFT_LOOP_GUARD__'
    ] as CraftLoopGuardGlobal | undefined;
    return bridge ? [...bridge.activity()] : [];
  });
  const fromNetwork: LoopActivity[] = [...requests].map(([key, total]) => ({
    kind: 'http-burst',
    name: key,
    key,
    total,
    inWindow: total,
    perSecond: total / (settleMs / 1000),
    tripped: false,
  }));
  const report = judgePageStability(
    [...guarded.filter((entry) => entry.kind !== 'http-burst'), ...fromNetwork],
    options.budget,
  );
  if (!report.settled) throw new Error(describePageStability(report));
  return report;
}
