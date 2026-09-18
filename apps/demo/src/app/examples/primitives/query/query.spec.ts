// @vitest-environment jsdom
import {
  ComponentTemplateOf,
  TemplateRendersNamedElementWhen,
} from '@craft-ts/component';
import type { ExtractDeps, GetServiceDependencies } from '@craft-ts/core';
import {
  setupCraftServiceTestingByRegister,
  craftUse,
  type GetServiceOutput,
} from '@craft-ts/core';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import GlobalQuery, { GlobalQueryView, provideGlobalQueryView } from './query';
import { ApiService } from './api.service';

// A handler that calls a service method with arguments leaves no trace in the
// template's type: the contract can no longer name the member behind a click.
// What the element renders is still asserted above.
describe('Query template', () => {
  type QueryLogic = GetServiceOutput<typeof GlobalQueryView>;
  type QueryTemplate = ComponentTemplateOf<typeof GlobalQuery>;

  type _UserQueryDependsOnApiService = Expect<
    Equal<
      'ApiService' extends keyof ExtractDeps<QueryLogic['userQuery']>
        ? true
        : false,
      true
    >
  >;

  type _UserQueryDependsOnStoragePersister = Expect<
    Equal<
      'StoragePersister' extends keyof ExtractDeps<QueryLogic['userQuery']>
        ? true
        : false,
      true
    >
  >;

  type _ApiServiceDependencyIsTracked = Expect<
    Equal<
      ExtractDeps<
        QueryLogic['userQuery']
      >['ApiService'] extends GetServiceDependencies<typeof ApiService>
        ? true
        : false,
      true
    >
  >;

  type _ApiServiceGetItemByIdIsTracked = Expect<
    Equal<
      ExtractDeps<QueryLogic['userQuery']>['ApiService'] extends {
        derivedPropertiesUsed: infer Used extends object;
      }
        ? 'getItemById' extends keyof Used
          ? true
          : false
        : false,
      true
    >
  >;

  type _ExposesUserQueryAndNavigationMethods = Expect<
    Equal<
      QueryLogic extends {
        userQuery: unknown;
        navigatePrevious: unknown;
        navigateNext: unknown;
      }
        ? true
        : false,
      true
    >
  >;

  type _DisplayPreviousUserButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:button:GoToPreviousUser'
      >,
      true
    >
  >;

  type _DisplayNextUserButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:button:GoToNextUser'
      >,
      true
    >
  >;

  type _DisplayQueryValueWhenTheQueryHasAValue = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:pre:QueryValue',
        { when: { hasUser: true } }
      >,
      true
    >
  >;

  type _DoNotDisplayQueryValueWhenTheQueryHasNoValue = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:pre:QueryValue',
        { when: { hasUser: false } }
      >,
      false
    >
  >;

  it('keeps the component template contract type-safe', () => {
    expect(true).toBe(true);
  });
});

describe('Query logic', () => {
  async function setup(currentUserId = '3') {
    const getItemById = vi.fn(function* (userId: string) {
      return { id: userId, name: `User ${userId}` };
    });
    const navigate = vi.fn();
    const values = new Map<string, string>();
    const storage = {
      addQueryToPersist: vi.fn(),
      addQueryByIdToPersist: vi.fn(),
      clearQuery: vi.fn(),
      clearQueryBy: vi.fn(),
      clearAllQueries: vi.fn(),
      clearAllQueriesById: vi.fn(),
      clearAllCache: vi.fn(),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear()),
      key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
      length: vi.fn(() => values.size),
    };
    const result = await setupCraftServiceTestingByRegister(
      GlobalQueryView,
      {
        globalQueryView: provideGlobalQueryView(),
        ApiService: { getItemById },
        CraftRouter: { navigate },
        StoragePersister: storage,
      } as never,
      {
        bindings: {
          userId: function* () {
            return currentUserId;
          },
        },
      } as never,
    );

    await vi.waitFor(() =>
      expect(getItemById).toHaveBeenCalledWith(currentUserId),
    );

    return { ...result, getItemById, navigate, storage };
  }

  it('navigates to the previous user with a decremented id', async () => {
    const { sut, navigate, injector } = await setup('3');

    try {
      sut.navigatePrevious();

      expect(navigate).toHaveBeenCalledWith({
        to: 'query/:userId',
        params: { userId: '2' },
      });
    } finally {
      injector.destroy();
    }
  });

  it('loads the current user through ApiService.getItemById', async () => {
    const { sut, getItemById, injector } = await setup('3');

    try {
      expect(getItemById).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(craftUse(sut.userQuery.value())).toEqual({
          id: '3',
          name: 'User 3',
        }),
      );
    } finally {
      injector.destroy();
    }
  });

  it('uses the StoragePersister dependency for cache access', async () => {
    const { storage, injector } = await setup('3');

    try {
      expect(storage.addQueryToPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      );
    } finally {
      injector.destroy();
    }
  });
});
