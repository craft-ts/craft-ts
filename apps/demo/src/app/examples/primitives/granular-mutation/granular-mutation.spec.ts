// @vitest-environment jsdom
import { setupCraftComponentTemplateTest } from '@craft-ts/component';
import {
  setupCraftServiceTestingByRegister,
  craftSleep,
  craftUse,
  deepYieldable,
  markYieldableMethod,
  markYieldableValue,
  provideCraftRouter as provideRouter,
  type ExtractDeps,
  type GetServiceDependencies,
  type GetServiceOutput,
} from '@craft-ts/core';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import GranularMutation, {
  GranularMutationView,
  provideGranularMutationView,
} from './granular-mutation';
import { ApiService, type User } from './api.service';

type GranularLogic = GetServiceOutput<typeof GranularMutationView>;

type _UsersQueryDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<GranularLogic['usersQuery']>
      ? true
      : false,
    true
  >
>;

type _UsersQueryDependsOnStoragePersister = Expect<
  Equal<
    'StoragePersister' extends keyof ExtractDeps<GranularLogic['usersQuery']>
      ? true
      : false,
    true
  >
>;

type _ApiServiceGetDataListIsTracked = Expect<
  Equal<
    ExtractDeps<GranularLogic['usersQuery']>['ApiService'] extends {
      derivedPropertiesUsed: infer Used extends object;
    }
      ? 'getDataList' extends keyof Used
        ? true
        : false
      : false,
    true
  >
>;

type _ApiServiceUpdateItemIsTracked = Expect<
  Equal<
    ExtractDeps<GranularLogic['updateUserName']>['ApiService'] extends {
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
      GranularLogic['updateUserName']
    >['ApiService'] extends GetServiceDependencies<typeof ApiService>
      ? true
      : false,
    true
  >
>;

type _ComponentExposesPaginationMutationAndPageSizeMethod = Expect<
  Equal<
    GranularLogic extends {
      pagination: unknown;
      updateUserName: unknown;
      usersQuery: unknown;
      updatePageSize: (event: Event) => unknown;
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
  users: User[],
  loadingUserIds = new Set<string>(),
) {
  const paginationState = { page: 1, pageSize: 4 };
  const pagination = deepYieldable(
    Object.assign(
      vi.fn(function* () {
        return { ...paginationState };
      }),
      {
        previousPage: markYieldableMethod(vi.fn()),
        nextPage: markYieldableMethod(vi.fn()),
        updatePageSize: markYieldableMethod(
          vi.fn((pageSize: number) => {
            paginationState.pageSize = pageSize;
          }),
        ),
      },
    ),
  );
  const mutate = markYieldableMethod(
    vi.fn(function* (user: User) {
      return user;
    }),
  );
  const select = vi.fn((userId: string) => ({
    isLoading: function* () {
      return loadingUserIds.has(userId);
    },
  }));
  const selectOrCreate = vi.fn((userId: string) => ({
    status: function* () {
      return loadingUserIds.has(userId)
        ? ('loading' as const)
        : ('idle' as const);
    },
  }));
  const updateUserName = { mutate, select, selectOrCreate };
  function* isUpdatePending(user: User) {
    const pending = updateUserName.select(user.id);
    return pending ? yield* pending.isLoading() : false;
  }
  const usersQuery = {
    currentPageData: markYieldableValue(
      vi.fn(() => users),
      'currentPageData',
    ),
    currentPageStatus: markYieldableValue(
      vi.fn(() => 'resolved' as const),
      'currentPageStatus',
    ),
  };

  return {
    context: {
      pagination,
      updateUserName,
      usersQuery,
      isUpdatePending,
      updatePageSize: (event: Event) => {
        pagination.updatePageSize(
          Number((event.target as HTMLSelectElement).value),
        );
      },
    },
    mutate,
  };
}

describe('primitive granular mutation template', () => {
  it('renders one update button per user and calls mutate with that user', async () => {
    const user = { id: '1', name: 'Romain' };
    const result = createTemplateContext([user]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      GranularMutation,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          granularMutationView: result.context,
        },
      },
    );

    try {
      const button =
        template.nativeElement.querySelector<HTMLButtonElement>('.action-btn');
      expect(button).not.toBeNull();

      button!.click();

      await vi.waitFor(() => expect(result.mutate).toHaveBeenCalledWith(user));
    } finally {
      template.destroy();
    }
  });

  it('does not render update buttons when currentPageData is empty', async () => {
    const result = createTemplateContext([]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      GranularMutation,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          granularMutationView: result.context,
        },
      },
    );

    try {
      expect(template.nativeElement.querySelector('.action-btn')).toBeNull();
    } finally {
      template.destroy();
    }
  });

  it('disables the user update button while its mutation is loading', async () => {
    const user = { id: '1', name: 'Romain' };
    const result = createTemplateContext([user], new Set([user.id]));
    const template = await setupCraftComponentTemplateTest.byRegister(
      GranularMutation,
      {
        inputs: {},
        register: {
          ApiService: 'notReached',
          StoragePersister: 'notReached',
          statusView: 'notReached',
          granularMutationView: result.context,
        },
      },
    );

    try {
      const button =
        template.nativeElement.querySelector<HTMLButtonElement>('.action-btn');
      expect(button?.disabled).toBe(true);
    } finally {
      template.destroy();
    }
  });
});

describe('primitive granular mutation logic', () => {
  async function setupLogic(updateDelayMs = 0) {
    const users: User[] = [
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
      { id: '3', name: 'Rom1' },
      { id: '4', name: 'Daniel' },
    ];
    const getDataList = vi.fn(function* ({
      page,
      pageSize,
    }: {
      page: number;
      pageSize: number;
    }) {
      return users.slice((page - 1) * pageSize, page * pageSize);
    });
    const updateItem = vi.fn(function* (user: User) {
      if (updateDelayMs > 0) {
        yield* craftSleep(updateDelayMs);
      }
      return user;
    });
    const storage = createStorageMock();
    const result = await setupCraftServiceTestingByRegister(
      GranularMutationView,
      {
        granularMutationView: provideGranularMutationView(),
        ApiService: { getDataList, updateItem },
        StoragePersister: storage,
      } as never,
      { providers: [provideRouter([])] } as never,
    );

    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 4 }),
    );

    return { ...result, getDataList, storage, updateItem };
  }

  it('optimistically updates the current query while the mutation is pending', async () => {
    const { sut, updateItem, injector } = await setupLogic(10_000);

    try {
      await vi.waitFor(() =>
        expect(craftUse(sut.usersQuery.currentPageData())).toHaveLength(4),
      );
      const user = craftUse(sut.usersQuery.currentPageData())[0];

      sut.updateUserName.mutate(user);

      await vi.waitFor(() => {
        expect(updateItem).toHaveBeenCalledWith({
          ...user,
          name: `${user.name}-`,
        });
        expect(craftUse(sut.updateUserName.select(user.id)?.isLoading())).toBe(
          true,
        );
        expect(craftUse(sut.usersQuery.currentPageData())[0]).toEqual({
          ...user,
          name: `${user.name}-`,
        });
      });
    } finally {
      injector.destroy();
    }
  });

  it('updates pagination through updatePageSize', async () => {
    const { sut, getDataList, injector } = await setupLogic();

    try {
      sut.updatePageSize({
        target: { value: '8' },
      } as unknown as Event);

      await vi.waitFor(() =>
        expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 8 }),
      );
    } finally {
      injector.destroy();
    }
  });
});
