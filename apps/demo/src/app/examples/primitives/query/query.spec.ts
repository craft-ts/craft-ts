// @vitest-environment jsdom
import '@angular/compiler';
import {
  ComponentLogicOutputOf,
  ComponentTemplateOf,
  TemplateNamedElementDelegatesToContext,
  TemplateRendersNamedElementWhen,
  setupCraftComponentLogicTest,
  type Input,
} from '@craft-ng/component';
import type {
  ExtractDeps,
  GetServiceDependencies, craftUse } from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import GlobalQuery from './query';
import { ApiService } from './api.service';

describe('Query template', () => {
  type QueryLogic = ComponentLogicOutputOf<typeof GlobalQuery>;
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

  type _PreviousUserClickDelegatesToPreviousNavigation = Expect<
    Equal<
      TemplateNamedElementDelegatesToContext<
        QueryTemplate,
        'GlobalQuery:button:GoToPreviousUser',
        'click',
        'navigatePrevious'
      >,
      true
    >
  >;

  type _NextUserClickDelegatesToNextNavigation = Expect<
    Equal<
      TemplateNamedElementDelegatesToContext<
        QueryTemplate,
        'GlobalQuery:button:GoToNextUser',
        'click',
        'navigateNext'
      >,
      true
    >
  >;

  type _DisplayQueryValueWhenTheQueryHasAValue = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:pre:QueryValue',
        { when: { 'userQuery.hasUser': true } }
      >,
      true
    >
  >;

  type _DoNotDisplayQueryValueWhenTheQueryHasNoValue = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'GlobalQuery:pre:QueryValue',
        { when: { 'userQuery.hasUser': false } }
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
    const result = await setupCraftComponentLogicTest(GlobalQuery, {
      args: [
        (function* () {
          return currentUserId;
        }) as Input<string | undefined>,
      ],
      register: {
        ApiService: { getItemById },
        CraftRouter: { navigate },
        StoragePersister: storage,
      },
    });

    await vi.waitFor(() =>
      expect(getItemById).toHaveBeenCalledWith(currentUserId),
    );

    return { ...result, getItemById, navigate, storage };
  }

  it('navigates to the previous user with a decremented id', async () => {
    const { context, navigate, destroy } = await setup('3');

    try {
      context.navigatePrevious();

      expect(navigate).toHaveBeenCalledWith({
        to: 'query/:userId',
        params: { userId: '2' },
      });
    } finally {
      destroy();
    }
  });

  it('loads the current user through ApiService.getItemById', async () => {
    const { context, getItemById, destroy } = await setup('3');

    try {
      expect(getItemById).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(craftUse(context.userQuery.value())).toEqual({
          id: '3',
          name: 'User 3',
        }),
      );
    } finally {
      destroy();
    }
  });

  it('uses the StoragePersister dependency for cache access', async () => {
    const { storage, destroy } = await setup('3');

    try {
      expect(storage.addQueryToPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          storeName: 'demo-app',
          key: 'user-query',
        }),
      );
    } finally {
      destroy();
    }
  });
});
