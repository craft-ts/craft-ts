// @vitest-environment jsdom
import { runInInjectionContext } from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCraftRouterOutletController } from './craft-router-outlet';
import { provideCraftRouter } from './craft-router';
import { ɵinjectCraftHistory, ɵinjectCraftMatch } from './craft-router-tokens';
import { craftWatch } from './host/craft-signal';

// The outlet publishes a page as several signals (target, component, injector, props)
// and the component that mounts it reads them in ONE template. Effects run
// synchronously, so each separate write wakes that reader on a half-written page.
// Each case below is a witness: an effect that notes what it sees on every run.

class PageA {}
class PageB {}

function history() {
  return TestBed.runInInjectionContext(() => ɵinjectCraftHistory()!);
}

describe('the router outlet publishing a page', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('swaps one page for another in a single observable step', () => {
    TestBed.configureTestingModule({
      providers: [
        provideCraftRouter([
          { path: 'a/:id', component: PageA },
          { path: 'b/:id', component: PageB },
        ]),
      ],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    history().push('/a/1');

    // What the mounting component reads: the target, its inputs, its injector.
    const injectors = new Map<unknown, number>();
    const seen: string[] = [];
    const watch = TestBed.runInInjectionContext(() =>
      craftWatch(() => {
        const target = outlet.displayedTarget();
        const props = outlet.displayedProps();
        const injector = outlet.displayedInjector();
        if (!injectors.has(injector)) injectors.set(injector, injectors.size);
        seen.push(
          `${(target?.component as { name?: string } | undefined)?.name ?? '-'}` +
            `:${String(props['id'])}:i${injectors.get(injector)}`,
        );
      }),
    );
    seen.length = 0;

    history().push('/b/2');

    // One drawing for the navigation. Never page A given B's inputs, or A
    // handed B's injector (which makes the renderer tear A down and build it again).
    expect(seen).toEqual(['PageB:2:i1']);
    watch.destroy();
  });

  it('moves the match and the inputs of a reused page together', () => {
    TestBed.configureTestingModule({
      providers: [provideCraftRouter([{ path: 'a/:id', component: PageA }])],
    });
    const outlet = TestBed.runInInjectionContext(() =>
      createCraftRouterOutletController(),
    );
    history().push('/a/1');

    // The page reads its inputs (displayedProps) and the live match (what
    // injectMatch() hands out) in one template.
    const match = runInInjectionContext(outlet.displayedInjector()!, () =>
      ɵinjectCraftMatch(),
    );
    const seen: string[] = [];
    const watch = TestBed.runInInjectionContext(() =>
      craftWatch(() => {
        const props = outlet.displayedProps();
        const live = match();
        seen.push(`${String(props['id'])}/${String(live?.params['id'])}`);
      }),
    );
    seen.length = 0;

    history().push('/a/2');

    expect(seen).toEqual(['2/2']);
    watch.destroy();
  });
});
