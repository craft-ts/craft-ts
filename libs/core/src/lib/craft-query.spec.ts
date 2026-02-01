import { Expect, Equal } from 'test-type';
import { inject, ResourceStreamItem, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expectTypeOf, Mock, vi } from 'vitest';
import { craft, CraftFactory } from './craft';
import { mutation } from './mutation';
import { query, QueryOutput } from './query';
import { craftQuery } from './craft-query';
import { craftMutations } from './craft-mutations';
import { insertReactOnMutation } from './insert-react-on-mutation';
import { CraftResourceRef } from './util/craft-resource-ref';

type User = {
  id: string;
  name: string;
  email: string;
};

describe('craftQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('1- Should expose a query resource', () => {
    TestBed.runInInjectionContext(() => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftQuery('user', () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          }),
        ),
      );

      const store = inject(Craft);

      expect(store.user).toBeDefined();
    });
  });

  it('2- should have idle state when query params are undefined', () => {
    TestBed.runInInjectionContext(() => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftQuery('user', () =>
          query({
            params: () => undefined as string | undefined,
            loader: async ({ params }) => {
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          }),
        ),
      );

      const store = inject(Craft);

      expect(store.user.status()).toBe('idle');
    });
  });

  it('3 should have loading state when query params are defined', () => {
    TestBed.runInInjectionContext(() => {
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
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          }),
        ),
      );

      const store = inject(Craft);

      expect(store.user.status()).toBe('loading');
    });
  });

  it('4 should have resolved status when loader completes successfully', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftQuery('user', () =>
          query({
            params: () => '5',
            loader: async ({ params }) => {
              await wait(1000);
              return {
                id: params,
                name: 'John Doe',
                email: 'test@a.com',
              };
            },
          }),
        ),
      );

      const store = inject(Craft);

      expect(store.user.value()).toEqual(undefined);

      // Wait for the query to resolve
      await vi.runAllTimersAsync();

      expect(store.user.status()).toBe('resolved');
      expect(store.user.value()).toEqual({
        id: '5',
        name: 'John Doe',
        email: 'test@a.com',
      });
    });
  });

  it('5 should handle query with resource stream', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftQuery('user', () =>
          query({
            params: () => '5',
            stream: async ({ params }) => {
              type _StreamResponseTypeRetrieved = Expect<
                Equal<typeof params, string>
              >;
              const testSignal = signal<
                ResourceStreamItem<{
                  count: number;
                }>
              >({
                value: {
                  count: 5,
                },
              });

              await wait(50);

              // Update the value after 300ms
              setTimeout(() => {
                testSignal.set({
                  value: {
                    count: 6,
                  },
                });
              }, 100);

              return testSignal.asReadonly();
            },
          }),
        ),
      );

      const store = inject(Craft);

      expect(store.user.value()).toEqual(undefined);
      expect(store.user.status()).toEqual('loading');
      await vi.advanceTimersByTimeAsync(100);

      expect(store.user.status()).toEqual('resolved');
      expect(store.user.value()).toEqual({
        count: 5,
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(store.user.value()).toEqual({
        count: 6,
      });
    });
  });
});

describe('Declarative server state, craftQuery and craftMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('1- craftQuery should handle optimistic updates', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                type _StreamResponseTypeRetrieved = Expect<
                  Equal<typeof params, string>
                >;
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              optimisticUpdate: ({ queryResource, mutationParams }) => {
                return {
                  ...queryResource.value(),
                  email: mutationParams.email,
                };
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');

      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });
      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('local');
      expect(store.user.value()?.email).toBe('mutated@test.com');
    });
  });

  it('2- craftQuery should reload on mutation error', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              throw new Error('Error during mutation');
              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                type _StreamResponseTypeRetrieved = Expect<
                  Equal<typeof params, string>
                >;
                await wait(10000);
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              reload: {
                onMutationError: true,
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');

      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.userEmail.status()).toBe('error');
      expect(store.user.status()).toBe('reloading');
    });
  });
  it('3- craftQuery should reload on mutation error if mutation params id is "error"', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              await wait(1000);
              console.log('b reject');
              await Promise.reject(new Error('Error during mutation'));
              console.log('a reject');

              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                type _StreamResponseTypeRetrieved = Expect<
                  Equal<typeof params, string>
                >;
                await wait(10000);
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              reload: {
                onMutationError: ({ mutationParams }) =>
                  mutationParams.id === 'error',
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');

      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(store.userEmail.status()).toBe('error');
      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');

      store.mutateUserEmail({
        id: 'error',
        email: 'mutated@test.com',
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.userEmail.status()).toBe('error');
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.user.status()).toBe('reloading');
      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');
    });
  });

  it('4- craftQuery should handle optimisticPatch', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                await wait(10000);
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              optimisticPatch: {
                email: ({ mutationParams }) => {
                  return mutationParams?.email;
                },
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');
      console.log('will mutate');
      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('local');
      expect(store.user.value()?.email).toBe('mutated@test.com');
    });
  });

  it('5- Should handle craftMutation reactions effect', async () => {
    let userQuery5ReloadSpy!: Mock<() => boolean>;
    await TestBed.runInInjectionContext(async () => {
      const returnedUser = (id: string) => ({
        id: `${id}`,
        name: 'John Doe',
        email: 'test@a.com',
      });
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userMutation: mutation({
            method(user: User) {
              return user;
            },
            identifier: (params) => params.id,
            loader: async ({ params }) => {
              await wait(1000);
              return params;
            },
          }),
        })),
        craftQuery('user', ({ userMutation }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                await wait(10000);
                return returnedUser(params);
              },
            },
            insertReactOnMutation(userMutation, {
              filter: ({ mutationIdentifier, queryResource }) =>
                queryResource.hasValue()
                  ? queryResource.value().id === mutationIdentifier
                  : false,
              reload: {
                onMutationLoading: true,
                onMutationResolved: true,
              },
            }),
            ({ resource }) => {
              userQuery5ReloadSpy = vi.spyOn(resource, 'reload');
              return {};
            },
          ),
        ),
      );

      const store = inject(Craft);
      const userQuery = store.user;
      await vi.runAllTimersAsync();
      expect(userQuery.value()).toEqual(returnedUser('5'));
      store.mutateUserMutation({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });

      await vi.runAllTimersAsync();
      expect(userQuery5ReloadSpy.mock.calls.length).toBe(2);
      vi.restoreAllMocks();
    });
  });

  it('6- craftQuery should handle updates', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                type _StreamResponseTypeRetrieved = Expect<
                  Equal<typeof params, string>
                >;
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              update: ({ queryResource, mutationParams }) => {
                console.log('update queryResource', !!queryResource);
                return {
                  ...queryResource.value(),
                  email: mutationParams.email,
                };
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');
      console.log('mutateUserEmail');
      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });
      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('local');
      expect(store.user.value()?.email).toBe('mutated@test.com');
    });
  });
  it('7- craftQuery should handle patch', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userEmail: mutation({
            method: ({ id, email }: { id: string; email: string }) => ({
              id,
              email,
            }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: params.email,
              } satisfies User;
            },
          }),
        })),
        craftQuery('user', ({ userEmail }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                await wait(10000);
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                };
              },
            },
            insertReactOnMutation(userEmail, {
              patch: {
                email: ({ mutationParams }) => {
                  console.log('mutationParams', mutationParams);
                  return mutationParams?.email;
                },
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('resolved');
      store.mutateUserEmail({
        id: '5',
        email: 'mutated@test.com',
      });

      await vi.runAllTimersAsync();
      expect(store.user.status()).toBe('local');
      expect(store.user.value()?.email).toBe('mutated@test.com');
    });
  });
  it('8- Should handle craftMutation update', async () => {
    await TestBed.runInInjectionContext(async () => {
      const returnedUser = (id: string) => ({
        id: `${id}`,
        name: 'John Doe',
        email: 'test@a.com',
      });
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userMutation: mutation({
            method(user: User) {
              return user;
            },
            identifier: (params) => params.id,
            loader: async ({ params }) => {
              await wait(1000);
              return params;
            },
          }),
        })),
        craftQuery('user', ({ userMutation }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                await wait(10000);
                return returnedUser(params);
              },
            },
            insertReactOnMutation(userMutation, {
              filter: ({ mutationIdentifier, queryResource }) =>
                queryResource.hasValue()
                  ? queryResource.value().id === mutationIdentifier
                  : false,
              update: ({ queryResource, mutationResource }) => {
                return {
                  ...queryResource.value(),
                  ...mutationResource.value(),
                };
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);
      const userQuery = store.user;
      await vi.runAllTimersAsync();
      expect(userQuery?.value()).toEqual(returnedUser('5'));
      store.mutateUserMutation({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });

      await vi.runAllTimersAsync();
      expect(userQuery?.value()).toEqual({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });
      vi.restoreAllMocks();
    });
  });
  it('9- Should handle craftMutation patch', async () => {
    await TestBed.runInInjectionContext(async () => {
      const returnedUser = (id: string) => ({
        id: `${id}`,
        name: 'John Doe',
        email: 'test@a.com',
      });
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userMutation: mutation({
            method(user: User) {
              return user;
            },
            identifier: (params) => params.id,
            loader: async ({ params }) => {
              await wait(1000);
              return params;
            },
          }),
        })),
        craftQuery('user', ({ userMutation }) =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                await wait(10000);
                return returnedUser(params);
              },
            },
            insertReactOnMutation(userMutation, {
              filter: ({ mutationIdentifier, queryResource }) =>
                queryResource.hasValue()
                  ? queryResource.value().id === mutationIdentifier
                  : false,
              patch: {
                email: ({ mutationResource }) => mutationResource.value().email,
              },
            }),
          ),
        ),
      );

      const store = inject(Craft);
      const userQuery = store.user;
      await vi.runAllTimersAsync();
      expect(userQuery?.value()).toEqual(returnedUser('5'));
      store.mutateUserMutation({
        id: '5',
        name: 'Updated User',
        email: 'updated.doe@example.com',
      });

      await vi.runAllTimersAsync();
      expect(userQuery?.value()).toEqual({
        id: '5',
        name: 'John Doe',
        email: 'updated.doe@example.com',
      });
      vi.restoreAllMocks();
    });
  });

  it('should accept an Insertions output, that appear in the store', () => {
    TestBed.runInInjectionContext(() => {
      const { Craft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftQuery('user', () =>
          query(
            {
              params: () => '5',
              loader: async ({ params }) => {
                return {
                  id: params,
                  name: 'John Doe',
                  email: 'test@a.com',
                } satisfies User;
              },
            },
            (data) => {
              console.log('data', data);
              return {
                pagination: {
                  page: 1,
                },
              };
            },
          ),
        ),
      );
      const store = inject(Craft);
      expectTypeOf(store.user.pagination).toEqualTypeOf<{
        page: number;
      }>();
      expect(store.user.pagination).toBeDefined();
    });
  });
});

// Typing test👇

type InferServerStateFeatureReturnedType<
  T extends CraftFactory<[any], any, any, any>,
> = T extends CraftFactory<any, any, infer R, any> ? R : never;

describe('craftQuery typing', () => {
  it('Should be well typed', () => {
    TestBed.runInInjectionContext(() => {
      const queryByIdTest = craftQuery('user', () =>
        query({
          params: () => '5',
          loader: async ({ params }) => {
            return {
              id: params,
              name: 'John Doe',
              email: 'test@a.com',
            } satisfies User;
          },
        }),
      );
      type ResultType = InferServerStateFeatureReturnedType<
        typeof queryByIdTest
      >;
      type PropsKeys = keyof ResultType['props'];

      type _ExpectTheResourceNameAndQueriesTypeRecord = Expect<
        Equal<PropsKeys, 'user'>
      >;

      type _ExpectThePropsToHaveARecordWithResourceRef = Expect<
        Equal<
          ReturnType<ResultType['props']['user']['value']>,
          User | undefined
        >
      >;

      type _ExpectThePropsToHaveARecordCraftQueryNameAndHisType = Expect<
        Equal<
          ResultType['props'],
          {
            user: QueryOutput<
              NoInfer<{
                id: string;
                name: string;
                email: string;
              }>,
              string,
              unknown,
              unknown,
              unknown,
              {}
            >;
          }
        >
      >;
    });
  });

  it('Should react to mutation changes', async () => {
    await TestBed.runInInjectionContext(async () => {
      const { injectCraft } = craft(
        {
          name: '',
          providedIn: 'root',
        },
        craftMutations(() => ({
          userName: mutation({
            method: (id: string) => ({ id }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: 'er@d',
              } satisfies User;
            },
          }),
          userEmail: mutation({
            method: (id: string) => ({ id }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: 'er@d',
                lol: 5,
              } satisfies User & { lol: number };
            },
          }),
          userTest: mutation({
            method: (id: string) => ({ id }),
            loader: async ({ params }) => {
              return {
                id: params.id,
                name: 'Updated Name',
                email: 'er@d',
                lol: 5,
              } satisfies User & { lol: number };
            },
          }),
        })),
        craftQuery('user', ({ userName }) =>
          query(
            {
              params: () => ({ id: '5' }),
              loader: async ({ params }) => {
                return {
                  id: params.id,
                  name: 'John Doe',
                  email: '',
                } satisfies User;
              },
            },
            insertReactOnMutation(userName, {
              optimisticUpdate: ({
                queryResource,
                mutationResource: _mutationResource,
                mutationParams: _mutationParams,
              }) => {
                type _ExpectQueryResourceToBeTyped = Expect<
                  Equal<
                    typeof queryResource,
                    CraftResourceRef<
                      NoInfer<{
                        id: string;
                        name: string;
                        email: string;
                      }>,
                      NoInfer<{
                        id: string;
                      }>
                    >
                  >
                >;
                type _ExpectMutationParamsToBeTyped = Expect<
                  Equal<typeof _mutationParams, { id: string }>
                >;
                type _ExpectMutationResourceToBeTyped = Expect<
                  Equal<
                    typeof _mutationResource,
                    CraftResourceRef<
                      NoInfer<{
                        id: string;
                        name: string;
                        email: string;
                      }>,
                      NoInfer<{
                        id: string;
                      }>
                    >
                  >
                >;
                return queryResource.value();
              },
              reload: {
                onMutationError: true,
                onMutationResolved: true,
                onMutationLoading: ({
                  mutationParams,
                  mutationResource,
                  queryResource,
                }) => {
                  type _ExpectQueryResourceToBeTyped = Expect<
                    Equal<
                      typeof queryResource,
                      CraftResourceRef<
                        NoInfer<{
                          id: string;
                          name: string;
                          email: string;
                        }>,
                        NoInfer<{
                          id: string;
                        }>
                      >
                    >
                  >;
                  type _ExpectMutationParamsToBeTyped = Expect<
                    Equal<typeof mutationParams, { id: string }>
                  >;
                  type _ExpectMutationResourceToBeTyped = Expect<
                    Equal<
                      typeof mutationResource,
                      CraftResourceRef<
                        NoInfer<{
                          id: string;
                          name: string;
                          email: string;
                        }>,
                        NoInfer<{
                          id: string;
                        }>
                      >
                    >
                  >;
                  return true;
                },
              },
              optimisticPatch: {
                name: ({
                  mutationParams,
                  mutationResource,
                  queryResource,
                  targetedState,
                }) => {
                  type _ExpectQueryResourceToBeTyped = Expect<
                    Equal<
                      typeof queryResource,
                      CraftResourceRef<
                        NoInfer<{
                          id: string;
                          name: string;
                          email: string;
                        }>,
                        NoInfer<{
                          id: string;
                        }>
                      >
                    >
                  >;
                  type _ExpectMutationParamsToBeTyped = Expect<
                    Equal<typeof mutationParams, { id: string }>
                  >;
                  type _ExpectMutationResourceToBeTyped = Expect<
                    Equal<
                      typeof mutationResource,
                      CraftResourceRef<
                        NoInfer<{
                          id: string;
                          name: string;
                          email: string;
                        }>,
                        NoInfer<{
                          id: string;
                        }>
                      >
                    >
                  >;
                  type _ExpectTargetedStateToBeTyped = Expect<
                    Equal<typeof targetedState, string | undefined>
                  >;
                  return targetedState ?? '';
                },
              },
            }),
          ),
        ),
      );
      const result = injectCraft();
      result.mutateUserEmail('newEmail');
      result.mutateUserName('newName');
      result.mutateUserTest('newName');
    });
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
