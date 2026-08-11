import '@angular/compiler';
import { computed, type Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { asyncProcess } from './async-process';
import { craftUse } from './craft-use';
import { craftPipe } from './craft-pipe';
import { insertSelect } from './insert-select';
import {
  insertAsyncProcessSelect,
  insertMutationSelect,
  insertQuerySelect,
  insertSelectResource,
} from './insert-select-resource';
import { insertQueryPipe } from './insert-typed-pipes';
import { mutation } from './mutation';
import { injectPrimitiveMethodRuntimeContext } from './primitive-method-runtime-context';
import { query } from './query';

type User = {
  id: string;
  name: string;
  profile: {
    displayName: string;
  };
};

type ProfileInsertions = {
  displayNameSignal: Signal<string>;
  rename: (displayName: string) => User['profile'];
};

type UserInsertions = {
  rename: (name: string) => User;
  currentName: Signal<string>;
};

type UserRuntimeInsertions = UserInsertions & {
  kind: () => string | undefined;
};

type ProfileRuntimeInsertions = {
  rename: (displayName: string) => User['profile'];
  kind: () => string | undefined;
};

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('insertSelectResource types', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preserves array item and nested object types for query', () => {
    TestBed.runInInjectionContext(() => {
      const _users = craftUse(
        query(
          'users',
          {
            params: () => 'users',
            loader: async () =>
              [
                {
                  id: '1',
                  name: 'Ada',
                  profile: { displayName: 'Ada Lovelace' },
                },
              ] satisfies User[],
          },
          insertSelectResource('user', (userContext) =>
            craftPipe(
              userContext,
              ({ state }) => ({
                label: computed(() => state().name),
              }),
              insertSelect('profile', ({ update }) => ({
                rename: (displayName: string) =>
                  update((profile) => ({ ...profile, displayName })),
              })),
            ),
          ),
        ),
      );

      type UserSelection = NonNullable<ReturnType<typeof _users.selectUser>>;
      type ProfileSelection = ReturnType<UserSelection['selectProfile']>;
      expectTypeOf<UserSelection['id']>().toEqualTypeOf<string>();
      expectTypeOf<UserSelection['label']>().toMatchTypeOf<Signal<string>>();
      expectTypeOf<ProfileSelection['rename']>().toBeFunction();
      expectTypeOf<ProfileSelection['displayName']>().toMatchTypeOf<string>();
    });
  });

  it('preserves object property types for mutation', () => {
    TestBed.runInInjectionContext(() => {
      const _saveUser = craftUse(
        mutation(
          'saveUser',
          {
            method: (user: User) => user,
            loader: async ({ params }) => params,
          },
          insertSelectResource<User, 'profile', ProfileInsertions>(
            'profile',
            ({ state, update }) => ({
              displayNameSignal: computed(() => state().displayName),
              rename: (displayName: string) =>
                update((profile) => ({ ...profile, displayName })),
            }),
          ),
        ),
      );

      type ProfileSelection = ReturnType<typeof _saveUser.selectProfile>;
      expectTypeOf<ProfileSelection['displayNameSignal']>().toMatchTypeOf<
        Signal<string>
      >();
      expectTypeOf<ProfileSelection['rename']>().toBeFunction();
    });
  });

  it('preserves array item types for asyncProcess', () => {
    TestBed.runInInjectionContext(() => {
      const _processUsers = craftUse(
        asyncProcess(
          'processUsers',
          {
            method: (users: User[]) => users,
            loader: async ({ params }) => params,
          },
          insertSelectResource<User[], 'user', UserInsertions>(
            'user',
            ({ state, update }) => ({
              rename: (name: string) => update((user) => ({ ...user, name })),
              currentName: computed(() => state().name),
            }),
          ),
        ),
      );

      type UserSelection = NonNullable<
        ReturnType<typeof _processUsers.selectUser>
      >;
      expectTypeOf<UserSelection['name']>().toEqualTypeOf<string>();
      expectTypeOf<UserSelection['currentName']>().toMatchTypeOf<
        Signal<string>
      >();
      expectTypeOf<UserSelection['rename']>().toBeFunction();
    });
  });

  it('updates a selected query array item and keeps the query runtime kind', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        query(
          'runtimeUsers',
          {
            method: (run: string) => run,
            loader: async () =>
              [
                {
                  id: '1',
                  name: 'Ada',
                  profile: { displayName: 'Ada Lovelace' },
                },
              ] satisfies User[],
          },
          insertQueryPipe(
            ({ set }) => ({
              initialize: () =>
                set([
                  {
                    id: '1',
                    name: 'Ada',
                    profile: { displayName: 'Ada Lovelace' },
                  },
                ]),
            }),
            insertSelectResource<User[], 'user', UserRuntimeInsertions>(
              'user',
              ({ update }) => ({
                rename: (name: string) => update((user) => ({ ...user, name })),
                currentName: computed(() => 'unused'),
                kind: () => injectPrimitiveMethodRuntimeContext()?.kind,
              }),
            ),
          ),
        ),
      );

      users.initialize();
      expect(users.value()).toEqual([
        {
          id: '1',
          name: 'Ada',
          profile: { displayName: 'Ada Lovelace' },
        },
      ]);
      const selected = users.selectUser(0);
      expect(selected?.name).toBe('Ada');
      expect(selected).toBeDefined();
      if (!selected) throw new Error('Expected a selected user');
      expect(craftUse(selected.kind())).toBe('query');
      craftUse(selected.rename('Grace'));
      expect(users.value()?.[0].name).toBe('Grace');
    });
  });

  it('updates a selected mutation object property and keeps the mutation runtime kind', async () => {
    await TestBed.runInInjectionContext(async () => {
      const saveUser = craftUse(
        mutation(
          'runtimeSaveUser',
          {
            method: (user: User) => user,
            loader: async ({ params }) => params,
          },
          insertSelectResource<User, 'profile', ProfileRuntimeInsertions>(
            'profile',
            ({ update }) => ({
              rename: (displayName: string) =>
                update((profile) => ({ ...profile, displayName })),
              kind: () => injectPrimitiveMethodRuntimeContext()?.kind,
            }),
          ),
        ),
      );

      saveUser.mutate({
        id: '1',
        name: 'Ada',
        profile: { displayName: 'Ada Lovelace' },
      });
      await vi.runAllTimersAsync();
      expect(saveUser.value()?.profile.displayName).toBe('Ada Lovelace');
      const selected = saveUser.selectProfile();
      expect(craftUse(selected.kind())).toBe('mutation');
      craftUse(selected.rename('Grace Hopper'));
      expect(saveUser.value()?.profile.displayName).toBe('Grace Hopper');
    });
  });

  it('updates a selected asyncProcess array item and keeps the asyncProcess runtime kind', async () => {
    await TestBed.runInInjectionContext(async () => {
      const processUsers = craftUse(
        asyncProcess(
          'runtimeProcessUsers',
          {
            method: (users: User[]) => users,
            loader: async ({ params }) => params,
          },
          insertSelectResource<User[], 'user', UserRuntimeInsertions>(
            'user',
            ({ update }) => ({
              rename: (name: string) => update((user) => ({ ...user, name })),
              currentName: computed(() => 'unused'),
              kind: () => injectPrimitiveMethodRuntimeContext()?.kind,
            }),
          ),
        ),
      );

      processUsers.method([
        {
          id: '1',
          name: 'Ada',
          profile: { displayName: 'Ada Lovelace' },
        },
      ]);
      await vi.runAllTimersAsync();
      const selected = processUsers.selectUser(0);
      expect(selected).toBeDefined();
      if (!selected) throw new Error('Expected a selected user');
      expect(craftUse(selected.kind())).toBe('asyncProcess');
      craftUse(selected.rename('Grace'));
      expect(selected?.name).toBe('Grace');
    });
  });

  it('does not accept grouped resources until per-resource selection is defined', () => {
    TestBed.runInInjectionContext(() => {
      expect(() =>
        craftUse(
          query(
            'groupedUsers',
            {
              params: () => '1',
              identifier: (id) => id,
              loader: async ({ params }) => ({
                id: params,
                name: 'Ada',
              }),
            },
            // @ts-expect-error insertSelectResource intentionally targets one resource, not resourceById.
            insertSelectResource('name', ({ state }) => ({
              upper: computed(() => state().toUpperCase()),
            })),
          ),
        ),
      ).toThrowError(
        'insertSelectResource does not support grouped resources; select the resource instance first.',
      );
    });
  });
});

describe('resource select aliases', () => {
  it('keeps the selector factory type on all aliases', () => {
    TestBed.runInInjectionContext(() => {
      const users = craftUse(
        query(
          'querySelectAlias',
          {
            params: () => 'users',
            loader: async () => [] as User[],
          },
          insertQuerySelect('user', ({ update }) => ({
            rename: (name: string) => update((user) => ({ ...user, name })),
          })),
        ),
      );
      expectTypeOf<
        NonNullable<ReturnType<typeof users.selectUser>>['rename']
      >().toBeFunction();

      const saveUser = craftUse(
        mutation(
          'mutationSelectAlias',
          {
            method: (user: User) => user,
            loader: async ({ params }) => params,
          },
          insertMutationSelect<User, 'profile', ProfileInsertions>(
            'profile',
            ({ update }) => ({
              displayNameSignal: computed(() => 'unused'),
              rename: (displayName: string) =>
                update((profile) => ({ ...profile, displayName })),
            }),
          ),
        ),
      );
      expectTypeOf<
        ReturnType<typeof saveUser.selectProfile>['rename']
      >().toBeFunction();

      const processUsers = craftUse(
        asyncProcess(
          'asyncProcessSelectAlias',
          {
            method: (users: User[]) => users,
            loader: async ({ params }) => params,
          },
          insertAsyncProcessSelect<User[], 'user', UserInsertions>(
            'user',
            ({ update }) => ({
              rename: (name: string) => update((user) => ({ ...user, name })),
              currentName: computed(() => 'unused'),
            }),
          ),
        ),
      );
      expectTypeOf<
        NonNullable<ReturnType<typeof processUsers.selectUser>>['rename']
      >().toBeFunction();
    });
  });
});
