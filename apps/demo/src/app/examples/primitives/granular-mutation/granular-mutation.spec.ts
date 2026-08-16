// @vitest-environment jsdom
import {
  ComponentLogicOutputOf,
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
} from '@craft-ng/component';
import { craftSleep, craftUse, provideCraftRouter as provideRouter, type ExtractDeps, type GetServiceDependencies } from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import GranularMutation from './granular-mutation';
import { ApiService, type User } from './api.service';

type GranularLogic = ComponentLogicOutputOf<typeof GranularMutation>;

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
  const pagination = Object.assign(
    vi.fn(() => ({ ...paginationState })),
    {
      previousPage: vi.fn(),
      nextPage: vi.fn(),
      updatePageSize: vi.fn((pageSize: number) => {
        paginationState.pageSize = pageSize;
      }),
    },
  );
  const mutate = vi.fn(function* (user: User) {
    return user;
  });
  const select = vi.fn((userId: string) => ({
    isLoading: vi.fn(() => loadingUserIds.has(userId)),
  }));
  const selectOrCreate = vi.fn((userId: string) => ({
    status: vi.fn(() =>
      loadingUserIds.has(userId) ? ('loading' as const) : ('idle' as const),
    ),
  }));
  const updateUserName = { mutate, select, selectOrCreate };
  const usersQuery = {
    currentPageData: vi.fn(() => users),
    currentPageStatus: vi.fn(() => 'resolved' as const),
  };

  return {
    context: {
      pagination,
      updateUserName,
      usersQuery,
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
      { context: result.context, register: {} },
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
      { context: result.context, register: {} },
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
      { context: result.context, register: {} },
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
    const result = await setupCraftComponentLogicTest.byRegister(
      GranularMutation,
      {
        register: {
          ApiService: { getDataList, updateItem },
          StoragePersister: storage,
        },
        providers: [provideRouter([])],
      },
    );

    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 4 }),
    );

    return { ...result, getDataList, storage, updateItem };
  }

  it('optimistically updates the current query while the mutation is pending', async () => {
    const { context, updateItem, destroy } = await setupLogic(10_000);

    try {
      await vi.waitFor(() =>
        expect(craftUse(context.usersQuery.currentPageData())).toHaveLength(
          4,
        ),
      );
      const user = craftUse(context.usersQuery.currentPageData())[0];

      context.updateUserName.mutate(user);

      await vi.waitFor(() => {
        expect(updateItem).toHaveBeenCalledWith({
          ...user,
          name: `${user.name}-`,
        });
        expect(
          craftUse(context.updateUserName.select(user.id)?.isLoading()),
        ).toBe(true);
        expect(craftUse(context.usersQuery.currentPageData())[0]).toEqual({
          ...user,
          name: `${user.name}-`,
        });
      });
    } finally {
      destroy();
    }
  });

  it('updates pagination through updatePageSize', async () => {
    const { context, getDataList, destroy } = await setupLogic();

    try {
      context.updatePageSize({
        target: { value: '8' },
      } as unknown as Event);

      await vi.waitFor(() =>
        expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 8 }),
      );
    } finally {
      destroy();
    }
  });
});
