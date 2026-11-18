import { afterEach, expect, it } from 'vitest';
import { craftService, craftUse, CraftTestBed, query } from '../index';

afterEach(() => CraftTestBed.resetTestingModule());

it('does not load a dependent query during injector teardown (#23)', async () => {
  const loads: string[] = [];
  const { Pair, providePair } = craftService(
    { name: 'Pair', providedIn: 'toProvide' },
    function* () {
      const first = yield* query('first', {
        params: () => 'first',
        loader: async () => {
          loads.push('first');
          return { ready: true };
        },
      });
      yield* query('second', {
        params: function* () {
          return { ready: (yield* first.value())?.ready ?? false };
        },
        loader: async ({ params }) => {
          loads.push(`second:${String(params.ready)}`);
          return params.ready;
        },
      });
    },
  );
  CraftTestBed.configureTestingModule({ providers: [providePair()] });
  CraftTestBed.runInInjectionContext(() => craftUse(Pair()));
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    CraftTestBed.flushEffects();
  }
  expect(loads).toEqual(['first', 'second:false', 'second:true']);
  const before = loads.length;
  CraftTestBed.resetTestingModule();
  await Promise.resolve();
  expect(loads.slice(before)).toEqual([]);
});
