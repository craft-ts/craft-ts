// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftService,
  provideCraftRouter,
  query,
  ɵinjectCraftRouterRuntime,
} from '@craft-ts/core';
import { craftComponent } from '../component';
import { withComponentProviders } from '../composition';
import { CraftRouterOutlet } from '../craft-router-outlet';
import { div, p } from '../hyperscript';
import { renderCraftComponent } from '../testing';
import { runInInjectionContext } from '../host-runtime';
import { provideSendContextToAi } from './send-context-to-ai';

/**
 * A primitive is observed while the function that declares it runs inside a
 * computation. An observer that reads the primitive used to subscribe that
 * computation to it, so the first state change re-ran the page, which built a
 * new function-scoped service, which built a new query, which was observed
 * again — silently, forever, with no error and no navigation.
 */
const RUN_BUDGET = 50;
let sequence = 0;

async function mountSessionsPage(
  ai: ReturnType<typeof provideSendContextToAi> | [],
) {
  sequence += 1;
  const id = sequence;
  let serviceRuns = 0;
  let loads = 0;
  const serviceName = `sessionsList${id}`;
  const capitalizedServiceName =
    serviceName[0]!.toUpperCase() + serviceName.slice(1);
  const serviceApi = craftService(
    { name: serviceName, providedIn: 'toProvide' },
    function* () {
      serviceRuns += 1;
      if (serviceRuns > RUN_BUDGET) throw new Error('remount loop');
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
  const Page = craftComponent(`SessionsPage${id}`, {}, function* () {
    yield* service();
    return div([p('sessions')]);
  }).pipe(withComponentProviders(() => [provideService()] as never));
  const rendered = await renderCraftComponent(CraftRouterOutlet as never, {
    providers: [
      ...provideCraftRouter([{ path: '', component: Page as never }]),
      ...ai,
    ] as never,
  });
  const router = runInInjectionContext(
    rendered.injector,
    () => ɵinjectCraftRouterRuntime()!,
  );
  await router.navigateByUrl('/');
  await rendered.flush();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await rendered.flush();
  const result = { serviceRuns, loads };
  rendered.destroy();
  return result;
}

describe('provideSendContextToAi on a page that declares a query', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('settles once the query has loaded, while recording', async () => {
    const result = await mountSessionsPage(
      provideSendContextToAi({ recording: true }),
    );
    expect(result.serviceRuns).toBeLessThanOrEqual(3);
    expect(result.loads).toBeLessThanOrEqual(3);
  });

  it('settles once the query has loaded, without recording', async () => {
    const result = await mountSessionsPage(
      provideSendContextToAi({ recording: false }),
    );
    expect(result.serviceRuns).toBeLessThanOrEqual(3);
    expect(result.loads).toBeLessThanOrEqual(3);
  });
});
