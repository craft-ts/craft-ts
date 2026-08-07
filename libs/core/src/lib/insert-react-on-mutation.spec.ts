import { TestBed } from '@angular/core/testing';
import { insertReactOnMutation } from './insert-react-on-mutation';
import { mutation } from './mutation';
import { query } from './query';
import { craftUse } from './craft-use';

describe('insertReactOnMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('a query can use insertReactOnMutation', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (payload: { name: string }) => payload,
          loader: async ({ params }) => params,
        }),
      );

      const queryRef = craftUse(query(
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
      expect(queryRef.value()?.name).toBe('new name');
    });
  });

  it('a query with identifier can use insertReactOnMutation', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mutationRef = craftUse(mutation('mutationRef', {
          method: (payload: { name: string; id: string }) => payload,
          loader: async ({ params }) => params,
        }),
      );

      const queryRef = craftUse(query(
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
      expect(queryRef.select('5')?.value()?.name).toBe('new name');
    });
  });
});
