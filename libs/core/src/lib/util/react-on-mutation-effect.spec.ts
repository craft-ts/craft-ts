import { TestBed } from '@angular/core/testing';
import { mutation } from '../mutation';
import { query } from '../query';
import { reactOnMutationEffect } from './react-on-mutation-effect';

describe('reactOnMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to a query to react to a mutation change', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query({
        params: () => '5',
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });
      const mutationRef = mutation({
        method: (payload: { id: string; name: string; email: string }) =>
          payload,
        loader: async ({ params }) => {
          return {
            id: params.id,
            name: params.name,
          };
        },
      });
      reactOnMutationEffect(
        {
          queryTargeted: queryRef,
          mutationTargeted: mutationRef,
        },
        {
          optimisticUpdate: ({ mutationParams }) => mutationParams,
        },
      );
      mutationRef.mutate({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
      await vi.runAllTimersAsync();
      expect(queryRef.value()).toEqual({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
    });
  });

  it('should enable to a query with identifier to react to a mutation change', async () => {
    await TestBed.runInInjectionContext(async () => {
      const queryRef = query({
        params: () => '5',
        identifier: (params) => params,
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'John Doe',
            email: 'test@a.com',
          };
        },
      });
      const mutationRef = mutation({
        method: (payload: { id: string; name: string; email: string }) =>
          payload,
        loader: async ({ params }) => {
          return {
            id: params.id,
            name: params.name,
          };
        },
      });
      reactOnMutationEffect(
        {
          queryTargeted: queryRef,
          mutationTargeted: mutationRef,
        },
        {
          filter: ({ queryIdentifier, mutationParams }) =>
            mutationParams.id === queryIdentifier,
          optimisticUpdate: ({ mutationParams }) => mutationParams,
        },
      );
      mutationRef.mutate({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
      await vi.runAllTimersAsync();
      expect(queryRef.select('5')?.value()).toEqual({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
    });
  });
});
