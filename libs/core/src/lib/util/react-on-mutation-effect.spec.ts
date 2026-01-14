import { TestBed } from '@angular/core/testing';
import { mutation } from '../mutation';
import { query } from '../query';
import { reactOnMutationEffect } from './react-on-mutation-effect';

describe('reactOnMutation', () => {
  it('should enable to a query to react to a mutation change', () => {
    TestBed.runInInjectionContext(() => {
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
        method: (payload: { id: string; name: string }) => payload,
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
          optimisticUpdate: ({ queryResource, mutationParams }) => ({
            ...queryResource.value(),
          }),
        },
      );
    });
  });
});
