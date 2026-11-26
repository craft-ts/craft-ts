import { provideCraftRouter } from './craft-router';
import { computed, Signal } from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';
import {
  insertAsyncProcessPipe,
  insertByIdentifierQuery,
  insertMutationPipe,
  insertQueryParamsPipe,
  insertQueryPipe,
  insertStateMachinePipe,
  insertStatePipe,
} from './insert-typed-pipes';
import { asyncProcess } from './async-process';
import { craftComputed } from './craft-computed';
import { craftUse } from './craft-use';
import { insertReactOnMutation } from './insert-react-on-mutation';
import { mutation } from './mutation';
import { query } from './query';
import { queryParams } from './query-params';
import { state } from './state';
import { ɵinjectCraftMethodReplayRegistry } from './craft-method-replay-registry';
import {
  craftStateMachine,
  initStateMachine,
  transitionStep,
} from './craft-state-machine';

describe('typed insertion pipes', () => {
  it('resolves a replay method when host instance ordinals changed after reload', () => {
    const registry = CraftTestBed.runInInjectionContext(() =>
      ɵinjectCraftMethodReplayRegistry(),
    );
    const calls: unknown[][] = [];
    const unregister = registry.register(
      'component:App#1 / component:List#2 / queryParams:pagination / method:nextPage',
      (_receiver, args) => calls.push([...args]),
    );

    registry.invoke(
      'component:App#20 / component:List#53 / queryParams:pagination / method:nextPage',
      undefined,
      [2],
    );

    expect(calls).toEqual([[2]]);
    unregister();
  });

  it('does not guess between replay methods with the same ordinal-free address', () => {
    const registry = CraftTestBed.runInInjectionContext(() =>
      ɵinjectCraftMethodReplayRegistry(),
    );
    const unregisterFirst = registry.register(
      'component:App#1 / component:List#2 / queryParams:pagination / method:nextPage',
      () => undefined,
    );
    const unregisterSecond = registry.register(
      'component:App#1 / component:List#3 / queryParams:pagination / method:nextPage',
      () => undefined,
    );

    expect(() =>
      registry.invoke(
        'component:App#20 / component:List#53 / queryParams:pagination / method:nextPage',
        undefined,
        [2],
      ),
    ).toThrow(/ambiguous/i);
    unregisterFirst();
    unregisterSecond();
  });

  it('reports an unknown replay method instead of invoking an approximate address', () => {
    const registry = CraftTestBed.runInInjectionContext(() =>
      ɵinjectCraftMethodReplayRegistry(),
    );

    expect(() =>
      registry.invoke(
        'component:App#20 / component:List#53 / queryParams:pagination / method:missing',
        undefined,
        [],
      ),
    ).toThrow(/Replay method is not registered/);
  });

  it('composes state insertions, exposes previous outputs, and supports generators', () => {
    CraftTestBed.runInInjectionContext(() => {
      const executionOrder: string[] = [];
      const counter = craftUse(
        state(
          'counter',
          0,
          insertStatePipe(
            function* () {
              executionOrder.push('first');
              return { first: 1 };
            },
            ({ state: value, insertions }) => {
              executionOrder.push('second');
              expectTypeOf(insertions.first).toEqualTypeOf<number>();
              return {
                second: computed(() => craftUse(value()) + insertions.first),
              };
            },
          ),
        ),
      );

      expect(executionOrder).toEqual(['first', 'second']);
      expectTypeOf(counter.first).toEqualTypeOf<number>();
      expectTypeOf(counter.second).toMatchTypeOf<Signal<number>>();
      expect(counter.first).toBe(1);
      expect(craftUse(counter.second())).toBe(1);
    });
  });

  it('composes query insertions without an explicit context', async () => {
    await CraftTestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query(
          'users',
          {
            params: () => 'user-1',
            loader: async () => ({ id: 'user-1' }),
          },
          insertQueryPipe(
            () => ({ first: 'user' }),
            ({ insertions }) => ({ second: `${insertions.first}-query` }),
          ),
        ),
      );

      expectTypeOf(users.first).toEqualTypeOf<string>();
      expectTypeOf(users.second).toEqualTypeOf<string>();
      await Promise.resolve();
      expect(users.first).toBe('user');
      expect(users.second).toBe('user-query');
    });
  });

  it('keeps query types when a pipe contains a mutation reaction', async () => {
    await CraftTestBed.runInInjectionContext(async () => {
      let loads = 0;
      const save = craftUse(
        mutation('saveItem', {
          method: (id: string) => id,
          loader: async ({ params }) => params,
        }),
      );
      const reactionFirst = craftUse(
        query(
          'reactionFirst',
          {
            params: () => 'item',
            loader: async () => ({ id: 'item', load: ++loads }),
          },
          insertQueryPipe(
            insertReactOnMutation(save, {
              reload: { onMutationResolved: true },
            }),
            ({ reload }) => ({ refetch: () => reload() }),
          ),
        ),
      );
      const reactionLast = craftUse(
        query(
          'reactionLast',
          { params: () => 'item', loader: async () => ({ id: 'item' }) },
          insertQueryPipe(
            ({ reload }) => ({ refetch: () => reload() }),
            insertReactOnMutation(save, {
              reload: { onMutationResolved: true },
            }),
          ),
        ),
      );
      const twoReactions = craftUse(
        query(
          'twoReactions',
          { params: () => 'item', loader: async () => ({ id: 'item' }) },
          insertQueryPipe(
            insertReactOnMutation(save, {
              reload: { onMutationResolved: true },
            }),
            insertReactOnMutation(save, {
              reload: { onMutationException: true },
            }),
          ),
        ),
      );
      const threeMembers = craftUse(
        query(
          'threeMembers',
          {
            params: () => 'item',
            loader: function* () {
              return { id: 'item' };
            },
          },
          insertQueryPipe(
            insertReactOnMutation(save, {
              reload: { onMutationResolved: true },
            }),
            ({ reload }) => ({ refetch: () => reload() }),
            function* ({ state: answered, insertions }) {
              expectTypeOf(insertions.refetch).toBeFunction();
              return {
                label: yield* craftComputed('label', function* () {
                  return (yield* answered())?.id ?? '';
                }),
              };
            },
          ),
        ),
      );

      expectTypeOf(craftUse(reactionFirst.value())).toEqualTypeOf<
        { id: string; load: number } | undefined
      >();
      expectTypeOf(reactionFirst.refetch).toBeFunction();
      expectTypeOf(craftUse(reactionLast.value())).toEqualTypeOf<
        { id: string } | undefined
      >();
      expectTypeOf(reactionLast.refetch).toBeFunction();
      expectTypeOf(craftUse(twoReactions.value())).toEqualTypeOf<
        { id: string } | undefined
      >();
      expectTypeOf(craftUse(threeMembers.value())).toEqualTypeOf<
        { id: string } | undefined
      >();
      expectTypeOf(threeMembers.refetch).toBeFunction();
      expectTypeOf(craftUse(threeMembers.label())).toEqualTypeOf<string>();

      await vi.waitFor(() =>
        expect(craftUse(reactionFirst.value())?.load).toBe(1),
      );
      save.mutate('item');
      await vi.waitFor(() =>
        expect(craftUse(reactionFirst.value())?.load).toBe(2),
      );
    });
  });

  it('infers a per-identifier factory in either order of a query pipe', () => {
    CraftTestBed.runInInjectionContext(() => {
      const identifierFirst = craftUse(
        query(
          'inferredIdentifierFirst',
          {
            params: () => 'item',
            identifier: (params: string) => params,
            loader: async () => ({ id: 'item' }),
          },
          insertQueryPipe(
            insertByIdentifierQuery(({ resource }) => ({
              stop: () => resource.cancelLoading(),
            })),
            () => ({ all: () => true }),
          ),
        ),
      );
      const identifierLast = craftUse(
        query(
          'inferredIdentifierLast',
          {
            params: () => 'item',
            identifier: (params: string) => params,
            loader: async () => ({ id: 'item' }),
          },
          insertQueryPipe(
            () => ({ all: () => true }),
            insertByIdentifierQuery(({ resource }) => ({
              stop: () => resource.cancelLoading(),
            })),
          ),
        ),
      );

      expectTypeOf(identifierFirst.all).toBeFunction();
      expectTypeOf(identifierFirst).not.toHaveProperty('stop');
      expectTypeOf(identifierFirst.selectOrCreate('a').stop).toBeFunction();
      expectTypeOf(identifierLast.all).toBeFunction();
      expectTypeOf(identifierLast).not.toHaveProperty('stop');
      expectTypeOf(identifierLast.selectOrCreate('a').stop).toBeFunction();
    });
  });

  it('composes mutation insertions without an explicit context', () => {
    CraftTestBed.runInInjectionContext(() => {
      const save = craftUse(
        mutation(
          'save',
          {
            method: (value: string) => ({ value }),
            loader: async ({ params }) => ({ value: params }),
          },
          insertMutationPipe(
            () => ({ first: 'mutation' }),
            ({ insertions }) => ({ second: insertions.first.length }),
          ),
        ),
      );

      expectTypeOf(save.first).toEqualTypeOf<string>();
      expectTypeOf(save.second).toEqualTypeOf<number>();
      expect(save.first).toBe('mutation');
      expect(save.second).toBe(8);
    });
  });

  it('composes queryParams insertions without an explicit context', () => {
    CraftTestBed.configureTestingModule({ providers: [...provideCraftRouter([])] });
    CraftTestBed.runInInjectionContext(() => {
      const pagination = craftUse(
        queryParams(
          'pagination',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: {
                  decode: (value: string) => Number(value),
                  encode: (value: number) => String(value),
                },
              },
            },
          },
          insertQueryParamsPipe(
            ({ state }) => ({
              currentPage: computed(() => craftUse(state()).page),
            }),
            ({ insertions }) => ({
              nextPage: () => insertions.currentPage() + 1,
            }),
          ),
        ),
      );

      expectTypeOf(pagination.currentPage).toMatchTypeOf<Signal<number>>();
      expectTypeOf(pagination.nextPage).toBeFunction();
      expect(craftUse(pagination.currentPage())).toBe(1);
      expect(craftUse(pagination.nextPage())).toBe(2);
    });
  });

  it('composes asyncProcess insertions without an explicit context', () => {
    CraftTestBed.runInInjectionContext(() => {
      const process = craftUse(
        asyncProcess(
          'process',
          {
            method: (value: string) => value,
            loader: async ({ params }) => ({ value: params }),
          },
          insertAsyncProcessPipe(
            () => ({ first: 'async' }),
            ({ insertions }) => ({ second: insertions.first.length }),
          ),
        ),
      );

      expectTypeOf(process.first).toEqualTypeOf<string>();
      expectTypeOf(process.second).toEqualTypeOf<number>();
      expect(process.first).toBe('async');
      expect(process.second).toBe(5);
    });
  });

  it('registers methods from every stateful primitive insertion for replay', async () => {
    CraftTestBed.configureTestingModule({ providers: [...provideCraftRouter([])] });
    const calls: Array<readonly [string, unknown]> = [];
    const insertion = (primitive: string) => ({
      replayCall: (payload: unknown) => calls.push([primitive, payload]),
    });

    const { registry, before } = CraftTestBed.runInInjectionContext(() => {
      const registry = ɵinjectCraftMethodReplayRegistry();
      const before = new Set(registry.addresses());
      craftUse(state('replay-state', 0, () => insertion('state')));
      craftUse(
        query(
          'replay-query',
          { params: () => 'query', loader: async () => 'query-result' },
          () => insertion('query'),
        ),
      );
      craftUse(
        queryParams(
          'replay-query-params',
          {
            state: {
              page: {
                fallbackValue: 1,
                codec: { decode: Number, encode: String },
              },
            },
          },
          () => insertion('queryParams'),
        ),
      );
      craftUse(
        asyncProcess(
          'replay-async-process',
          {
            method: (payload: string) => payload,
            loader: async ({ params }) => ({ params }),
          },
          () => insertion('asyncProcess'),
        ),
      );
      craftUse(
        mutation(
          'replay-mutation',
          {
            method: (payload: string) => payload,
            loader: async ({ params }) => params,
          },
          () => insertion('mutation'),
        ),
      );
      return { registry, before };
    });

    const addresses = registry.addresses().filter(
      (address) => !before.has(address) && address.includes('method:replayCall'),
    );
    expect(addresses).toHaveLength(5);
    for (const primitive of [
      'state',
      'query',
      'queryParams',
      'asyncProcess',
      'mutation',
    ]) {
      const address = addresses.find((value) =>
        value.includes(`${primitive}:replay-`),
      );
      expect(
        address,
        `missing replay registration for ${primitive}`,
      ).toBeDefined();
      registry.invoke(address!, undefined, [`${primitive}-payload`]);
    }
    expect(calls).toEqual([
      ['state', 'state-payload'],
      ['query', 'query-payload'],
      ['queryParams', 'queryParams-payload'],
      ['asyncProcess', 'asyncProcess-payload'],
      ['mutation', 'mutation-payload'],
    ]);
  });

  it('composes state machine insertions and exposes previous outputs', () => {
    const machine = CraftTestBed.runInInjectionContext(() =>
      craftUse(
        craftStateMachine(
          'pipe-machine',
          function* () {
            return {};
          },
          function* (_context, transit) {
            return {
              idle: transitionStep(function* () {
                yield* initStateMachine(() => transit());
              }),
            };
          },
          function* () {
            return { idle: {} };
          },
          insertStateMachinePipe(
            function* () {
              return { first: 'machine' };
            },
            ({ insertions }) => ({
              second: `${insertions.first}-pipe`,
            }),
          ),
        ),
      ),
    );

    expectTypeOf(machine.first).toEqualTypeOf<string>();
    expectTypeOf(machine.second).toEqualTypeOf<string>();
    expect(machine.first).toBe('machine');
    expect(machine.second).toBe('machine-pipe');
  });
});
