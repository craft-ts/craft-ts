import { TestBed } from './host/craft-test-bed';
import { craftWatch } from './host/craft-signal';
import { queryParams } from './query-params';
import { craftUse } from './craft-use';
import { provideCraftRouter } from './craft-router';
import { ɵinjectCraftRouterRuntime } from './craft-router-tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The state of queryParams and its parse exceptions both come from the URL, and are
// written from it one after the other. Effects run synchronously, so a reader of both
// (a page showing its filter and a banner about a bad one) was woken on a mixture: the
// previous page number next to the exception of the new URL.
describe('queryParams following the URL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
    TestBed.configureTestingModule({ providers: [provideCraftRouter([])] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the state and its parse exceptions together', async () => {
    await TestBed.runInInjectionContext(async () => {
      const router = ɵinjectCraftRouterRuntime()!;
      const filters = craftUse(
        queryParams('filters', {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: (value: string) => {
                  const page = Number(value);
                  if (Number.isNaN(page)) throw new Error('not a page');
                  return page;
                },
                encode: (value: number) => String(value),
              },
            },
          },
        }),
      );
      await router.navigateByUrl('/?page=2');
      const seen: string[] = [];
      const watch = craftWatch(() => {
        seen.push(
          `${craftUse(filters.page())}|${craftUse(filters.exceptions()).list.length}`,
        );
      });
      seen.length = 0;

      await router.navigateByUrl('/?page=oops');

      // The fallback page next to the one exception it comes from: never page 2 beside
      // the exception of a URL that is not page 2 any more.
      expect(seen).toEqual(['1|1']);
      watch.destroy();
    });
  });
});
