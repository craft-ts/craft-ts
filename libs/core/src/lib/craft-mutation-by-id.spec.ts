import { TestBed } from '@angular/core/testing';
import { delay, lastValueFrom, of } from 'rxjs';
import { Expect, Equal } from 'test-type';
import { inject, InjectionToken } from '@angular/core';
import { vi } from 'vitest';
import { craft } from './craft';
import { craftMutationById } from './craft-mutation-by-id';
import { mutationById } from '../mutation-by-id';
import { ResourceByIdRef } from '../resource-by-id';
import { craftQueryById } from './craft-query-by-id';
import { queryById } from '../query-by-id';
import { MergeObject } from '../types/util.type';

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
      craftMutationById('user', () =>
        mutationById({
          params: () => '5',
          loader: ({ params }) => {
            return lastValueFrom(of<User>(returnedUser));
          },
          identifier: (params) => params,
        })
      )
    );

    await TestBed.runInInjectionContext(async () => {
      const store = TestBed.inject(Craft);

      expect(store.userMutationById).toBeDefined();

      await vi.runAllTimersAsync();
      expect(store.userMutationById()['5']?.value()).toBe(returnedUser);

      type ExpectUserQueryToBeAnObjectWithResourceByIdentifier = Expect<
        Equal<
          typeof store.userMutationById,
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
      craftMutationById('user', () =>
        mutationById({
          method: (user: User) => user,
          loader: ({ params: user }) => {
            return lastValueFrom(of(user));
          },
          identifier: ({ id }) => id,
        })
      )
    );
    await TestBed.runInInjectionContext(async () => {
      const c = injectCraft();
      c.mutateUserById({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      const store = inject(Craft);

      await vi.runAllTimersAsync();

      store.mutateUserById({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUserById({
        id: '6',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUserById({
        id: '7',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      store.mutateUserById({
        id: '8',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      await vi.runAllTimersAsync();
      expect(store.userMutationById()['5']?.status()).toEqual('resolved');
      expect(store.userMutationById()['6']?.status()).toEqual('resolved');
      expect(store.userMutationById()['7']?.status()).toEqual('resolved');
      expect(store.userMutationById()['8']?.status()).toEqual('resolved');
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
      craftQueryById('user', () =>
        queryById({
          params: () => '5',
          loader: ({ params }) => {
            return lastValueFrom(of<User>(returnedUser).pipe(delay(10)));
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
          userQueryById: MergeObject<
            ResourceByIdRef<string, NoInfer<User>, string>,
            unknown
          >;
        }
      >
    >;
  });
});
