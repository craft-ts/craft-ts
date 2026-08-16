// @vitest-environment jsdom
import {
  ComponentLogicOutputOf,
  setupCraftComponentTemplateTest,
} from '@craft-ng/component';
import type {
  ExtractDeps,
  GetServiceDependencies,
  ResolvedServiceOutput,
} from '@craft-ng/core';
import { craftUse, setupCraftServiceTestingByRegister } from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import ListWithPaginationCraft, {
  UserList,
  provideUserList,
} from './list-with-pagination';
import { ApiService, type User } from './api.service';

type ListLogic = ComponentLogicOutputOf<typeof ListWithPaginationCraft>;
type UserListOutput = ResolvedServiceOutput<
  typeof UserList,
  Record<never, never>
>;

type _UsersDependOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<UserListOutput['users']>
      ? true
      : false,
    true
  >
>;

type _ApiServiceDependencyIsTracked = Expect<
  Equal<
    ExtractDeps<
      UserListOutput['users']
    >['ApiService'] extends GetServiceDependencies<typeof ApiService>
      ? true
      : false,
    true
  >
>;

type _ApiServiceGetDataListIsTracked = Expect<
  Equal<
    ExtractDeps<UserListOutput['users']>['ApiService'] extends {
      derivedPropertiesUsed: infer Used extends object;
    }
      ? 'getDataList' extends keyof Used
        ? true
        : false
      : false,
    true
  >
>;

type _PaginationDependsOnRouter = Expect<
  Equal<
    'Router' extends keyof ExtractDeps<UserListOutput['pagination']>
      ? true
      : false,
    true
  >
>;

type _ListLogicExposesPaginationAndUsers = Expect<
  Equal<
    ListLogic extends {
      store: { pagination: unknown; users: unknown };
      updatePageSize: unknown;
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

function createUserListMock(users: User[]) {
  const paginationState = { page: 1, pageSize: 4 };
  const previousPage = vi.fn();
  const nextPage = vi.fn();
  const updatePageSize = vi.fn((pageSize: number) => {
    paginationState.pageSize = pageSize;
  });
  const pagination = Object.assign(
    vi.fn(() => ({ ...paginationState })),
    { previousPage, nextPage, updatePageSize },
  );
  const store = {
    pagination,
    users: {
      currentPageData: () => users,
      currentPageStatus: () => 'resolved' as const,
      total: () => users.length,
    },
  };
  const userList = vi.fn(() => ({
    ...store,
  }));

  return {
    userList,
    store,
    pagination,
    previousPage,
    nextPage,
    updatePageSize,
  };
}

function setupComponent(users: User[] = [{ id: '1', name: 'Romain' }]) {
  const mock = createUserListMock(users);
  const context = {
    store: mock.store,
    updatePageSize: function* (event: Event) {
      mock.updatePageSize(Number((event.target as HTMLSelectElement).value));
    },
  };

  return { context, ...mock };
}

describe('list with pagination template', () => {
  it('renders user names and the current pagination values', async () => {
    const result = await setupComponent([
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
    ]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPaginationCraft,
      { context: result.context, register: {} },
    );

    try {
      expect(template.nativeElement.textContent).toContain('Romain');
      expect(template.nativeElement.textContent).toContain('Geffrault');
      expect(template.nativeElement.textContent).toContain('2 on page');
      expect(
        template.nativeElement.querySelector<HTMLSelectElement>('select')
          ?.value,
      ).toBe('4');
    } finally {
      template.destroy();
    }
  });

  it('delegates page-size changes to UserList.pagination.updatePageSize', async () => {
    const result = await setupComponent();
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPaginationCraft,
      { context: result.context, register: {} },
    );

    try {
      const select =
        template.nativeElement.querySelector<HTMLSelectElement>('select');
      select!.value = '8';
      select!.dispatchEvent(new Event('change', { bubbles: true }));

      await vi.waitFor(() =>
        expect(result.updatePageSize).toHaveBeenCalledWith(8),
      );
    } finally {
      template.destroy();
    }
  });

  it('delegates Previous and Next clicks to pagination', async () => {
    const result = await setupComponent();
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPaginationCraft,
      { context: result.context, register: {} },
    );

    try {
      const buttons = Array.from(
        template.nativeElement.querySelectorAll('button'),
      );
      buttons
        .find((button) => button.textContent?.trim() === 'Previous')!
        .click();
      buttons.find((button) => button.textContent?.trim() === 'Next')!.click();

      expect(result.previousPage).toHaveBeenCalledTimes(1);
      expect(result.nextPage).toHaveBeenCalledTimes(1);
    } finally {
      template.destroy();
    }
  });
});

describe('list with pagination logic', () => {
  async function setupStore() {
    const users: User[] = [
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
      { id: '3', name: 'Rom1' },
      { id: '4', name: 'Daniel' },
      { id: '5', name: 'Toto' },
      { id: '6', name: 'Julien' },
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
    const storage = createStorageMock();
    const result = await setupCraftServiceTestingByRegister(
      UserList,
      {
        UserList: provideUserList(),
        ApiService: { getDataList },
        StoragePersister: storage,
        Router: 'real',
      } as never,
      {
        providers: [provideRouter([])],
      },
    );

    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 4 }),
    );

    return { ...result, getDataList, storage, users };
  }

  it('loads the first page through ApiService.getDataList', async () => {
    const { sut, getDataList } = await setupStore();

    expect(craftUse(sut.pagination())).toEqual({ page: 1, pageSize: 4 });
    expect(craftUse(sut.users.currentPageData())).toEqual([
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
      { id: '3', name: 'Rom1' },
      { id: '4', name: 'Daniel' },
    ]);
    expect(getDataList).toHaveBeenCalledTimes(1);
  });

  it('reloads the query with the right params when pagination changes', async () => {
    const { sut, getDataList } = await setupStore();

    sut.pagination.nextPage();
    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 2, pageSize: 4 }),
    );
    expect(craftUse(sut.pagination())).toEqual({ page: 2, pageSize: 4 });
    expect(craftUse(sut.users.currentPageData())).toEqual([
      { id: '5', name: 'Toto' },
      { id: '6', name: 'Julien' },
    ]);

    sut.pagination.previousPage();
    await vi.waitFor(() =>
      expect(craftUse(sut.pagination())).toEqual({ page: 1, pageSize: 4 }),
    );
    expect(craftUse(sut.users.currentPageData())).toEqual([
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
      { id: '3', name: 'Rom1' },
      { id: '4', name: 'Daniel' },
    ]);

    sut.pagination.updatePageSize(2);
    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 2 }),
    );
    expect(craftUse(sut.pagination())).toEqual({ page: 1, pageSize: 2 });
    expect(craftUse(sut.users.currentPageData())).toEqual([
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
    ]);
  });
});
