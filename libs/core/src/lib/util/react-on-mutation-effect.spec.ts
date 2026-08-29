import { mutation } from '../mutation';
import { query } from '../query';
import { reactOnMutationEffect } from './react-on-mutation-effect';
import { resourceById } from '../resource-by-id';
import { craftUse } from '../craft-use';
import { rawReactiveFacade } from '../reactive-read';
import {
  flushCraftTest,
  setupCraftServiceTest,
} from '../setup-craft-service-test';

describe('reactOnMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should enable to a query to react to a mutation change', async () => {
    const { injector } = setupCraftServiceTest();
    await injector.run(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => '5',
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      );
      const mutationRef = craftUse(
        mutation('mutationRef', {
          method: (payload: { id: string; name: string; email: string }) =>
            payload,
          loader: async ({ params }) => {
            return {
              id: params.id,
              name: params.name,
            };
          },
        }),
      );
      reactOnMutationEffect(
        {
          queryTargeted: rawReactiveFacade(queryRef),
          mutationTargeted: rawReactiveFacade(mutationRef),
        } as any,
        {
          optimisticUpdate: ({ mutationParams }: any) => mutationParams,
        } as any,
      );
      mutationRef.mutate({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
      await vi.runAllTimersAsync();
      await flushCraftTest(injector);
      expect(craftUse(queryRef.value())).toEqual({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
    });
  });

  it('should enable to a query with identifier to react to a mutation change', async () => {
    const { injector } = setupCraftServiceTest();
    await injector.run(async () => {
      const queryRef = craftUse(
        query('queryRef', {
          params: () => '5',
          identifier: (params: string) => params,
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            };
          },
        }),
      );
      const mutationRef = craftUse(
        mutation('mutationRef', {
          method: (payload: { id: string; name: string; email: string }) =>
            payload,
          loader: async ({ params }) => {
            return {
              id: params.id,
              name: params.name,
            };
          },
        }),
      );
      reactOnMutationEffect(
        {
          queryTargeted: rawReactiveFacade(queryRef),
          mutationTargeted: rawReactiveFacade(mutationRef),
        } as any,
        {
          filter: ({ queryIdentifier, mutationParams }: any) =>
            mutationParams.id === queryIdentifier,
          optimisticUpdate: ({ mutationParams }: any) => mutationParams,
        } as any,
      );
      await vi.runAllTimersAsync();
      mutationRef.mutate({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
      await flushCraftTest(injector);
      expect(craftUse(queryRef.select('5')?.value())).toEqual({
        id: '5',
        name: 'Jane Doe',
        email: '',
      });
    });
  });

  it.todo(
    'should enable to a query with identifier to react to a mutation change that rely on a fromResourceById',
    async () => {
      const { injector } = setupCraftServiceTest();
      await injector.run(async () => {
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

        const mutationRef = craftUse(
          mutation('mutationRef', {
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
          }),
        );

        const queryRef = craftUse(
          query('queryRef', {
            params: () => '1',
            identifier: (params: string) => params,
            loader: async ({ params }) => {
              return [
                {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                },
              ];
            },
          }),
        );
        reactOnMutationEffect(
          {
            queryTargeted: rawReactiveFacade(queryRef),
            mutationTargeted: rawReactiveFacade(mutationRef),
          } as any,
          {
            filter: ({ queryIdentifier, mutationParams, queryResource }: any) =>
              queryResource
                .value()
                ?.some((item: any) => item.id === mutationParams.id) === true &&
              mutationParams.id === queryIdentifier,
            optimisticUpdate: ({ mutationParams, queryResource }: any) => [
              ...(queryResource.value() ?? []),
              mutationParams,
            ],
          } as any,
        );

        await vi.runAllTimersAsync();
        console.log(
          'queryRef.select(.value()',
          craftUse(queryRef.select('1')?.value()),
        );
        expect(craftUse(queryRef.select('1')?.value())).toEqual({
          id: '1',
          name: 'Jane Doe',
          email: '',
        });
      });
    },
  );
});
