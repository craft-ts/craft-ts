import { TestBed } from '@angular/core/testing';
import { Expect, Equal } from 'test-type';
import { inject, InjectionToken } from '@angular/core';
import { vi } from 'vitest';
import { craft } from './craft';
import { craftMutations } from './craft-mutations';
import { mutation } from './mutation';
import { craftQuery } from './craft-query';
import { query, QueryOutput } from './query';
import { ResourceByIdRef } from './resource-by-id';

type User = {
  id: string;
  name: string;
  email: string;
};

describe('craftMutationById', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });
  it('1- Should expose a mutation resource with a record of resource by id', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          params: () => '5',
          identifier: (params) => params,
          loader: async ({ params }) => {
            return returnedUser as User;
          },
        }),
      }))
    );

    await TestBed.runInInjectionContext(async () => {
      const store = TestBed.inject(Craft);

      expect(store.user).toBeDefined();

      await vi.runAllTimersAsync();
      expect(store.user.select('5')?.value()).toBe(returnedUser);

      type ExpectUserQueryToBeAnObjectWithResourceByIdentifier = Expect<
        Equal<
          typeof store.user._resourceById,
          ResourceByIdRef<string, NoInfer<User>, string>
        >
      >;
    });
  });

  it('5- Should trigger multiples resource creation in same cycle, when calling method', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft, injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        user: mutation({
          method: (user: User) => user,
          loader: async ({ params: user }) => {
            return user;
          },
          identifier: ({ id }) => id,
        }),
      }))
    );
    await TestBed.runInInjectionContext(async () => {
      const c = injectCraft();
      c.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      const store = inject(Craft);

      await vi.runAllTimersAsync();

      store.mutateUser({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUser({
        id: '6',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUser({
        id: '7',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUser({
        id: '8',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(store.user.select('5')?.status()).toEqual('resolved');
      expect(store.user.select('6')?.status()).toEqual('resolved');
      expect(store.user.select('7')?.status()).toEqual('resolved');
      expect(store.user.select('8')?.status()).toEqual('resolved');
    });
  });

  type InferServerStateResult<T> = T extends InjectionToken<infer U>
    ? U
    : never;

  it('#1- Should expose private query type', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftQuery('user', () =>
        query({
          params: () => '5',
          loader: async ({ params }) => {
            await wait(10);
            return returnedUser as User;
          },
          identifier: (params) => params,
        })
      )
    );

    type StoreFeatureQueryType = InferServerStateResult<typeof Craft>;

    type ExpectStoreFeatureQueryTypeToBeFullyRetrieved = Expect<
      Equal<
        StoreFeatureQueryType,
        {
          user: QueryOutput<
            NoInfer<User>,
            string,
            unknown,
            unknown,
            string,
            {}
          >;
        }
      >
    >;
  });
});

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
