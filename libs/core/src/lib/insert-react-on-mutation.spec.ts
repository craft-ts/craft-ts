import { insertReactOnMutation } from './insert-react-on-mutation';
import { mutation } from './mutation';
import { query } from './query';
import { craftUse } from './craft-use';
import { setupCraftServiceTest } from './setup-craft-service-test';

describe('insertReactOnMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  const runCraft = <T>(fn: () => T | Promise<T>) => {
    const { injector } = setupCraftServiceTest();
    return injector.run(fn);
  };
  it('a query can use insertReactOnMutation', async () => {
    await runCraft(async () => {
      const mutationRef = craftUse(
        mutation('mutationRef', {
          method: (payload: { name: string }) => payload,
          loader: async ({ params }) => params,
        }),
      );

      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () => '5',
            loader: async ({ params }) => ({
              id: params,
              name: 'John',
            }),
          },
          insertReactOnMutation(mutationRef, {
            patch: {
              name: ({ mutationParams }) => mutationParams.name,
            },
          }),
        ),
      );

      await vi.runAllTimersAsync();

      mutationRef.mutate({ name: 'new name' });

      await vi.runAllTimersAsync();
      expect(craftUse(queryRef.value())?.name).toBe('new name');
    });
  });

  it('a query with identifier can use insertReactOnMutation', async () => {
    await runCraft(async () => {
      const mutationRef = craftUse(
        mutation('mutationRef', {
          method: (payload: { name: string; id: string }) => payload,
          loader: async ({ params }) => params,
        }),
      );

      const queryRef = craftUse(
        query(
          'queryRef',
          {
            params: () => '5',
            identifier: (params) => params,
            loader: async ({ params }) => ({
              id: params,
              name: 'John',
            }),
          },
          insertReactOnMutation(mutationRef, {
            filter: ({ queryIdentifier, mutationParams }) =>
              mutationParams.id === queryIdentifier,
            patch: {
              name: ({ mutationParams }) => mutationParams.name,
            },
          }),
        ),
      );

      await vi.runAllTimersAsync();

      mutationRef.mutate({ name: 'new name', id: '5' });

      await vi.runAllTimersAsync();
      const selected = queryRef.select('5');
      expect(selected ? craftUse(selected.value())?.name : undefined).toBe(
        'new name',
      );
    });
  });
});
