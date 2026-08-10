// @vitest-environment jsdom
import '@angular/compiler';
import { provideRouter } from '@angular/router';
import {
  ComponentLogicOutputOf,
  ComponentTemplateOf,
  TemplateRendersNamedElementWhen,
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
} from '@craft-ng/component';
import type { ExtractDeps, GetServiceDependencies } from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import ListWithPagination from './list-with-pagination';
import { ApiService, type User } from './api.service';

type ListLogic = ComponentLogicOutputOf<typeof ListWithPagination>;
type ListTemplate = ComponentTemplateOf<typeof ListWithPagination>;

type _UsersQueryDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<ListLogic['usersQuery']>
      ? true
      : false,
    true
  >
>;

type _UsersQueryDependsOnStoragePersister = Expect<
  Equal<
      'StoragePersister' extends keyof ExtractDeps<ListLogic['usersQuery']>
      ? true
      : false,
    true
  >
>;

type _ApiServiceDependencyIsTracked = Expect<
  Equal<
    ExtractDeps<
      ListLogic['usersQuery']
    >['ApiService'] extends GetServiceDependencies<typeof ApiService>
      ? true
      : false,
    true
  >
>;

type _ApiServiceGetDataListIsTracked = Expect<
  Equal<
    ExtractDeps<ListLogic['usersQuery']>['ApiService'] extends {
      derivedPropertiesUsed: infer Used extends object;
    }
      ? 'getDataList' extends keyof Used
        ? true
        : false
      : false,
    true
  >
>;

type _ExposesPaginationAndUsersQuery = Expect<
  Equal<
    ListLogic extends {
      pagination: unknown;
      usersQuery: unknown;
      updatePageSize: (event: Event) => unknown;
    }
      ? true
      : false,
    true
  >
>;

type _DisplayPageSizeSelect = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      ListTemplate,
      'ListWithPagination:select:PageSize'
    >,
    true
  >
>;

type _DisplayPreviousPageButton = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      ListTemplate,
      'ListWithPagination:button:PreviousPage'
    >,
    true
  >
>;

type _DisplayNextPageButton = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      ListTemplate,
      'ListWithPagination:button:NextPage'
    >,
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

function createTemplateContext(users: User[]) {
  const paginationState = { page: 1, pageSize: 4 };
  const previousPage = vi.fn(() => {
    paginationState.page = Math.max(1, paginationState.page - 1);
  });
  const nextPage = vi.fn(() => {
    paginationState.page += 1;
  });
  const updatePageSize = vi.fn((pageSize: number) => {
    paginationState.pageSize = pageSize;
    paginationState.page = 1;
  });
  const pagination = Object.assign(
    vi.fn(() => ({ ...paginationState })),
    { previousPage, nextPage, updatePageSize },
  );
  const usersQuery = {
    currentPageData: vi.fn(() => users),
    currentPageStatus: vi.fn(() => 'resolved' as const),
    isCurrentPageResolved: vi.fn(() => true),
  };
  const updatePageSizeFromEvent = vi.fn((event: Event) => {
    updatePageSize(Number((event.target as HTMLSelectElement).value));
  });

  return {
    context: {
      pagination,
      usersQuery,
      updatePageSize: updatePageSizeFromEvent,
    },
    pagination,
    previousPage,
    nextPage,
    updatePageSize,
    updatePageSizeFromEvent,
  };
}

describe('primitive list with pagination template', () => {
  it('renders user names and current pagination values', async () => {
    const result = createTemplateContext([
      { id: '1', name: 'Romain' },
      { id: '2', name: 'Geffrault' },
    ]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPagination,
      { context: result.context, register: {} },
    );

    try {
      expect(template.nativeElement.textContent).toContain('Romain');
      expect(template.nativeElement.textContent).toContain('Geffrault');
      expect(
        template.nativeElement.querySelector<HTMLSelectElement>('select')
          ?.value,
      ).toBe('4');
      expect(
        template.nativeElement.querySelector('.current-page')?.textContent,
      ).toContain('1');
    } finally {
      template.destroy();
    }
  });

  it('delegates page-size changes to updatePageSize', async () => {
    const result = createTemplateContext([{ id: '1', name: 'Romain' }]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPagination,
      { context: result.context, register: {} },
    );

    try {
      const select =
        template.nativeElement.querySelector<HTMLSelectElement>('select');
      select!.value = '8';
      select!.dispatchEvent(new Event('change', { bubbles: true }));

      await vi.waitFor(() =>
        expect(result.updatePageSizeFromEvent).toHaveBeenCalledTimes(1),
      );
      expect(result.updatePageSize).toHaveBeenCalledWith(8);
    } finally {
      template.destroy();
    }
  });

  it('delegates Previous and Next clicks to pagination', async () => {
    const result = createTemplateContext([{ id: '1', name: 'Romain' }]);
    const template = await setupCraftComponentTemplateTest.byRegister(
      ListWithPagination,
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

describe('primitive list with pagination logic', () => {
  async function setupLogic() {
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
    const result = await setupCraftComponentLogicTest.byRegister(
      ListWithPagination,
      {
        register: {
          Router: 'real',
          ApiService: { getDataList },
          StoragePersister: storage,
        },
        providers: [provideRouter([])],
      },
    );

    await vi.waitFor(() =>
      expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 4 }),
    );

    return { ...result, getDataList, storage, users };
  }

  it('loads the first page through ApiService.getDataList', async () => {
    const { context, getDataList, destroy } = await setupLogic();

    try {
      expect(context.pagination()).toEqual({ page: 1, pageSize: 4 });
      expect(context.usersQuery.currentPageData()).toEqual([
        { id: '1', name: 'Romain' },
        { id: '2', name: 'Geffrault' },
        { id: '3', name: 'Rom1' },
        { id: '4', name: 'Daniel' },
      ]);
      expect(getDataList).toHaveBeenCalledTimes(1);
    } finally {
      destroy();
    }
  });

  it('reloads the query with the right params when pagination changes', async () => {
    const { context, getDataList, destroy } = await setupLogic();

    try {
      context.pagination.nextPage();
      await vi.waitFor(() =>
        expect(getDataList).toHaveBeenCalledWith({ page: 2, pageSize: 4 }),
      );
      expect(context.pagination()).toEqual({ page: 2, pageSize: 4 });
      expect(context.usersQuery.currentPageData()).toEqual([
        { id: '5', name: 'Toto' },
        { id: '6', name: 'Julien' },
      ]);

      context.pagination.previousPage();
      await vi.waitFor(() =>
        expect(context.pagination()).toEqual({ page: 1, pageSize: 4 }),
      );
      expect(context.usersQuery.currentPageData()).toEqual([
        { id: '1', name: 'Romain' },
        { id: '2', name: 'Geffrault' },
        { id: '3', name: 'Rom1' },
        { id: '4', name: 'Daniel' },
      ]);

      context.pagination.updatePageSize(2);
      await vi.waitFor(() =>
        expect(getDataList).toHaveBeenCalledWith({ page: 1, pageSize: 2 }),
      );
      expect(context.pagination()).toEqual({ page: 1, pageSize: 2 });
      expect(context.usersQuery.currentPageData()).toEqual([
        { id: '1', name: 'Romain' },
        { id: '2', name: 'Geffrault' },
      ]);
    } finally {
      destroy();
    }
  });
});
