// @vitest-environment jsdom
import {
  ComponentTemplateOf,
  TemplateRendersNamedElementWhen,
} from '@craft-ts/component';
import {
  setupCraftServiceTestingByRegister,
  type ExtractDeps,
  type GetServiceDependencies,
  type GetServiceOutput,
} from '@craft-ts/core';
import type { Equal, Expect } from '@craft-ts/dev-tools/testing';
import { describe, expect, it, vi } from 'vitest';
import CraftGlobalQuery, {
  CraftGlobalQueryView,
  provideCraftGlobalQueryView,
} from './query';
import { ApiService } from './api.service';

// A handler that calls a service method with arguments leaves no trace in the
// template's type: the contract can no longer name the member behind a click.
// What the element renders is still asserted above.
describe('Craft query template', () => {
  type QueryLogic = GetServiceOutput<typeof CraftGlobalQueryView>;
  type QueryTemplate = ComponentTemplateOf<typeof CraftGlobalQuery>;

  type _UserQueryDependsOnApiService = Expect<
    Equal<
      'ApiService' extends keyof ExtractDeps<QueryLogic['user']> ? true : false,
      true
    >
  >;

  type _UserQueryDependsOnStoragePersister = Expect<
    Equal<
      'StoragePersister' extends keyof ExtractDeps<QueryLogic['user']>
        ? true
        : false,
      true
    >
  >;

  type _ApiServiceDependencyIsTracked = Expect<
    Equal<
      ExtractDeps<
        QueryLogic['user']
      >['ApiService'] extends GetServiceDependencies<typeof ApiService>
        ? true
        : false,
      true
    >
  >;

  type _ApiServiceGetItemByIdIsTracked = Expect<
    Equal<
      ExtractDeps<QueryLogic['user']>['ApiService'] extends {
        derivedPropertiesUsed: infer Used extends object;
      }
        ? 'getItemById' extends keyof Used
          ? true
          : false
        : false,
      true
    >
  >;

  type _ExposesUserAndNavigationMethod = Expect<
    Equal<
      QueryLogic extends {
        user: unknown;
        hasUser: unknown;
        navigate: unknown;
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
        'CraftGlobalQuery:button:GoToPreviousUser'
      >,
      true
    >
  >;

  type _DisplayNextUserButton = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'CraftGlobalQuery:button:GoToNextUser'
      >,
      true
    >
  >;

  type _DisplayQueryValueWhenTheUserExists = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'CraftGlobalQuery:pre:QueryValue',
        { when: { hasUser: true } }
      >,
      true
    >
  >;

  type _DoNotDisplayQueryValueWhenTheUserDoesNotExist = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        QueryTemplate,
        'CraftGlobalQuery:pre:QueryValue',
        { when: { hasUser: false } }
      >,
      false
    >
  >;

  it('keeps the component template contract type-safe', () => {
    expect(true).toBe(true);
  });
});

describe('Craft query logic', () => {
  async function setup(currentUserId = '3') {
    const navigate = vi.fn();
    const user = {
      status: () => 'resolved',
      hasValue: () => true,
      value: () => ({ id: currentUserId, name: `User ${currentUserId}` }),
    };
    const userQuery = vi.fn((_: { userId: () => string | undefined }) => user);
    const result = await setupCraftServiceTestingByRegister(
      CraftGlobalQueryView,
      {
        craftGlobalQueryView: provideCraftGlobalQueryView(),
        UserQuery: { $self: userQuery },
        ApiService: 'notReached',
        ConsoleService: 'notReached',
        StoragePersister: 'notReached',
        CraftRouter: { navigate },
      } as never,
      {
        bindings: {
          userId: function* () {
            return currentUserId;
          },
        },
      } as never,
    );

    return { ...result, navigate, userQuery };
  }

  it('navigates to the previous user with a decremented id', async () => {
    const { sut, navigate, injector } = await setup('3');

    try {
      sut.navigate(-1);

      expect(navigate).toHaveBeenCalledWith({
        to: 'craft/query/:userId',
        params: { userId: '2' },
      });
    } finally {
      injector.destroy();
    }
  });
});
