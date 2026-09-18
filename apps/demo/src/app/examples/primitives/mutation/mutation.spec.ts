// @vitest-environment jsdom
import { craftSignal as signal, type GetServiceOutput } from '@craft-ts/core';
import {
  ComponentTemplateOf,
  TemplateRendersNamedElementWhen,
  setupCraftComponentTemplateTest,
} from '@craft-ts/component';
import {
  setupCraftServiceTestingByRegister,
  markYieldableMethod,
  markYieldableValue,
  type ExtractDeps,
  type GetServiceDependencies,
} from '@craft-ts/core';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import MutationDemoComponent, {
  MutationDemoView,
  provideMutationDemoView,
} from './mutation';
import { ApiService, type User } from './api.service';

type MutationLogic = GetServiceOutput<typeof MutationDemoView>;
type MutationTemplate = ComponentTemplateOf<typeof MutationDemoComponent>;

type _UserQueryDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<MutationLogic['userQuery']>
      ? true
      : false,
    true
  >
>;

type _UserQueryDependsOnStoragePersister = Expect<
  Equal<
    'StoragePersister' extends keyof ExtractDeps<MutationLogic['userQuery']>
      ? true
      : false,
    true
  >
>;

type _UpdateMutationDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<MutationLogic['updateUserName']>
      ? true
      : false,
    true
  >
>;

type _UpdateItemIsTracked = Expect<
  Equal<
    ExtractDeps<MutationLogic['updateUserName']>['ApiService'] extends {
      derivedPropertiesUsed: infer Used extends object;
    }
      ? 'updateItem' extends keyof Used
        ? true
        : false
      : false,
    true
  >
>;

type _ApiServiceDependencyMatches = Expect<
  Equal<
    ExtractDeps<
      MutationLogic['updateUserName']
    >['ApiService'] extends GetServiceDependencies<typeof ApiService>
      ? true
      : false,
    true
  >
>;

type _UserValueIsVisibleWhenQueryHasAValue = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      MutationTemplate,
      'MutationDemoComponent:pre:UserValue',
      { when: { hasUser: true } }
    >,
    true
  >
>;

type _UserValueIsNotVisibleWhenQueryHasNoValue = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      MutationTemplate,
      'MutationDemoComponent:pre:UserValue',
      { when: { hasUser: false } }
    >,
    false
  >
>;

type _ComponentExposesMutationAndActions = Expect<
  Equal<
    MutationLogic extends {
      userQuery: unknown;
      updateUserName: unknown;
      update: (name: string) => unknown;
      goTo: (offset: number) => unknown;
    }
      ? true
      : false,
    true
  >
>;

function createStorageMock() {
  const values = new Map<string, string>();

  return {
    addQueryToPersist: vi.fn(),
    addQueryByIdToPersist: vi.fn(),
    clearQuery: vi.fn(),
    clearQueryBy: vi.fn(),
    clearAllQueries: vi.fn(),
    clearAllQueriesById: vi.fn(),
    clearAllCache: vi.fn(),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    length: vi.fn(() => values.size),
  };
}

function createTemplateContext(
  user: User | undefined,
  mutationLoading = false,
) {
  const name = signal('');
  const updateSpy = vi.fn();
  // A craft method runs when it is called: the fakes are plain functions.
  const update = markYieldableMethod(
    vi.fn((newName: string | undefined) => {
      updateSpy(newName);
    }),
  );
  const setName = markYieldableMethod(
    vi.fn((newName: string) => {
      name.set(newName);
    }),
  );
  const goTo = vi.fn();
  const userQuery = {
    status: markYieldableValue(
      vi.fn(() => (user ? ('resolved' as const) : ('idle' as const))),
      'status',
    ),
    hasUser: markYieldableValue(signal(user !== undefined), 'hasUser'),
    value: markYieldableValue(
      vi.fn(() => user),
      'value',
    ),
  };
  const updateUserName = {
    isLoading: markYieldableValue(
      vi.fn(() => mutationLoading),
      'isLoading',
    ),
    status: markYieldableValue(
      vi.fn(() => (mutationLoading ? ('loading' as const) : ('idle' as const))),
      'status',
    ),
  };

  return {
    context: {
      userQuery,
      updateUserName,
      update,
      goTo,
      // A service member is read with `yield*`, so the fake is a reader too.
      nameInput: markYieldableValue(
        vi.fn(function* () {
          return name();
        }),
        'nameInput',
      ),
      setName,
    },
    update: updateSpy,
    goTo,
  };
}

describe('primitive mutation template', () => {
  it('updates the user with the name entered in the input', async () => {
    const result = createTemplateContext({ id: '1', name: 'Romain' });
    const template = await setupCraftComponentTemplateTest.byRegister(
      MutationDemoComponent,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          CraftRouter: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          mutationDemoView: result.context,
        },
      },
    );

    try {
      const input = template.nativeElement.querySelector<HTMLInputElement>(
        'input[placeholder="New name"]',
      );
      const button =
        template.nativeElement.querySelector<HTMLButtonElement>(
          '.update-user-name',
        );
      input!.value = 'Alice';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      button!.click();

      expect(result.update).toHaveBeenCalledWith('Alice');
    } finally {
      template.destroy();
    }
  });

  it('renders the user value only when the query has a value', async () => {
    const withUser = createTemplateContext({ id: '1', name: 'Romain' });
    const withUserTemplate = await setupCraftComponentTemplateTest.byRegister(
      MutationDemoComponent,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          CraftRouter: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          mutationDemoView: withUser.context,
        },
      },
    );

    try {
      expect(
        withUserTemplate.nativeElement.querySelector('pre'),
      ).not.toBeNull();
    } finally {
      withUserTemplate.destroy();
    }

    const withoutUser = createTemplateContext(undefined);
    const withoutUserTemplate =
      await setupCraftComponentTemplateTest.byRegister(MutationDemoComponent, {
        inputs: {},
        register: {
          ApiService: 'notReached',
          CraftRouter: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          mutationDemoView: withoutUser.context,
        },
      });

    try {
      expect(withoutUserTemplate.nativeElement.querySelector('pre')).toBeNull();
    } finally {
      withoutUserTemplate.destroy();
    }
  });

  it('disables the update button while the mutation is loading', async () => {
    const result = createTemplateContext({ id: '1', name: 'Romain' }, true);
    const template = await setupCraftComponentTemplateTest.byRegister(
      MutationDemoComponent,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          CraftRouter: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          mutationDemoView: result.context,
        },
      },
    );

    try {
      expect(
        template.nativeElement.querySelector<HTMLButtonElement>(
          '.update-user-name',
        )?.disabled,
      ).toBe(true);
    } finally {
      template.destroy();
    }
  });
});

describe('primitive mutation logic', () => {
  async function setupLogic() {
    const user = { id: '1', name: 'Romain' };
    const getItemById = vi.fn(function* (userId: string) {
      return { ...user, id: userId };
    });
    const updateItem = vi.fn(function* (updatedUser: User) {
      return updatedUser;
    });
    const navigate = vi.fn();
    const storage = createStorageMock();
    const result = await setupCraftServiceTestingByRegister(
      MutationDemoView,
      {
        mutationDemoView: provideMutationDemoView(),
        ApiService: { getItemById, updateItem },
        StoragePersister: storage,
        CraftRouter: { navigate },
      } as never,
      {
        bindings: {
          userId: function* () {
            return user.id;
          },
        },
      } as never,
    );

    await vi.waitFor(() => expect(getItemById).toHaveBeenCalledWith(user.id));

    return { ...result, getItemById, updateItem, navigate, storage, user };
  }

  it('loads the user and updates its name through the mutation', async () => {
    const { sut, updateItem, user, injector } = await setupLogic();

    try {
      sut.update('Alice');

      await vi.waitFor(() =>
        expect(updateItem).toHaveBeenCalledWith({
          id: user.id,
          name: 'Alice',
        }),
      );
    } finally {
      injector.destroy();
    }
  });

  it('navigates to the relative user from goTo', async () => {
    const { sut, navigate, injector } = await setupLogic();

    try {
      sut.goTo(-1);

      expect(navigate).toHaveBeenCalledWith({
        to: 'mutation/:userId',
        params: { userId: '0' },
      });
    } finally {
      injector.destroy();
    }
  });
});
