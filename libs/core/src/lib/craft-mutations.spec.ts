import { TestBed } from '@angular/core/testing';
import { inject, ResourceStatus, Signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { craft } from './craft';
import { ResourceByIdRef } from './resource-by-id';
import { craftMutations } from './craft-mutations';
import { mutation } from './mutation';
import { ReadonlySource } from './util/source.type';

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
          method: () => '5',
          loader: async ({ params }) => {
            return returnedUser;
          },
        }),
        userById: mutation({
          method: (params: string) => params,
          identifier: (params) => params,
          loader: async ({ params }) => {
            return returnedUser;
          },
        }),
      })),
    );

    await TestBed.runInInjectionContext(async () => {
      const store = TestBed.inject(Craft);

      expect(store.user).toBeDefined();

      expectTypeOf(store.user).toEqualTypeOf<{
        '~InternalType': 'Used to avoid TS type erasure';
        readonly error: Signal<Error | undefined>;
        readonly value: Signal<User | undefined>;
        readonly safeValue: Signal<User | undefined>;
        readonly status: Signal<ResourceStatus>;
        readonly isLoading: Signal<boolean>;
        hasValue: () => boolean;
        readonly resourceParamsSrc: WritableSignal<string>;
        source: ReadonlySource<string>;
        type: 'resourceLike';
        kind: 'mutation';
      }>();

      expect(store.userById._resourceById).toBeDefined();

      expectTypeOf(store.userById._resourceById).toEqualTypeOf<
        ResourceByIdRef<string, User, string>
      >();

      store.mutateUserById('5');

      await vi.runAllTimersAsync();
      expect(store.userById.select('5')?.value()).toBe(returnedUser);
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
          method: (user: User) => {
            return user;
          },
          identifier: ({ id }) => id,
          loader: async ({ params: user }) => {
            return user;
          },
        }),
      })),
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

  it('6- Should expose all defined mutation in _mutation context', async () => {
    const returnedUser = {
      id: '5',
      name: 'John Doe',
      email: 'test@a.com',
    };
    const { __META_STORE_CONTEXT } = craft(
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
      })),
    );
    expectTypeOf<
      keyof typeof __META_STORE_CONTEXT.context._mutation
    >().toEqualTypeOf<'user'>();
  });
});
