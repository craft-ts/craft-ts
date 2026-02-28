import { TestBed } from '@angular/core/testing';
import { mutation } from '../mutation';
import { query } from '../query';
import { reactOnMutationEffect } from './react-on-mutation-effect';
import { resourceById } from '../resource-by-id';

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

  it.todo(
    'should enable to a query with identifier to react to a mutation change that rely on a fromResourceById',
    async () => {
      await TestBed.runInInjectionContext(async () => {
        const resourceByIdRef = resourceById({
          params: () => '1',
          identifier: (params) => params,
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: '',
            };
          },
        });
        resourceByIdRef.addById('1', {
          defaultValue: { id: '1', name: 'John Doe', email: '' },
        });
        resourceByIdRef.addById('2', {
          defaultValue: { id: '2', name: 'Jane Doe2', email: '' },
        });

        const mutationRef = mutation({
          fromResourceById: resourceByIdRef,
          params: (resource) => {
            if (!resource) {
            }
            return resource?.hasValue() ? resource?.value() : undefined;
          },
          loader: async ({ params }) => {
            return {
              id: params.id,
              name: params.name,
            };
          },
        });

        const queryRef = query({
          params: () => '1',
          identifier: (params) => params,
          loader: async ({ params }) => {
            return [
              {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              },
            ];
          },
        });
        reactOnMutationEffect(
          {
            queryTargeted: queryRef,
            mutationTargeted: mutationRef,
          },
          {
            filter: ({ queryIdentifier, mutationParams, queryResource }) =>
              queryResource
                .value()
                .some((item) => item.id === mutationParams.id) &&
              mutationParams.id === queryIdentifier,
            optimisticUpdate: ({ mutationParams, queryResource }) => [
              ...queryResource.value(),
              mutationParams,
            ],
          },
        );

        await vi.runAllTimersAsync();
        console.log('queryRef.select(.value()', queryRef.select('1')?.value());
        expect(queryRef.select('1')?.value()).toEqual({
          id: '1',
          name: 'Jane Doe',
          email: '',
        });
      });
    },
  );
});
