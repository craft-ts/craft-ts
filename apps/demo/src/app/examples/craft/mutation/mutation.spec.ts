// @vitest-environment jsdom
import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  ComponentLogicOutputOf,
  ComponentTemplateOf,
  TemplateNamedElementDelegatesToContext,
  TemplateRendersNamedElementWhen,
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  type Input,
} from '@craft-ng/component';
import {
  markYieldableValue,
  type ExtractDeps,
  type GetServiceDependencies,
} from '@craft-ng/core';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import MutationCraft, { UserMutation, provideUserMutation } from './mutation';
import { ApiService, type User } from './api.service';

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

type MutationLogic = ComponentLogicOutputOf<typeof MutationCraft>;
type MutationTemplate = ComponentTemplateOf<typeof MutationCraft>;

type _UserQueryDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<MutationLogic['store']['user']>
      ? true
      : false,
    true
  >
>;

type _UserQueryDependsOnLocalStorageService = Expect<
  Equal<
    'LocalStorageService' extends keyof ExtractDeps<
      MutationLogic['store']['user']
    >
      ? true
      : false,
    true
  >
>;

type _UpdateMutationDependsOnApiService = Expect<
  Equal<
    'ApiService' extends keyof ExtractDeps<
      MutationLogic['store']['updateUserName']
    >
      ? true
      : false,
    true
  >
>;

type _UpdateItemIsTracked = Expect<
  Equal<
    ExtractDeps<
      MutationLogic['store']['updateUserName']
    >['ApiService'] extends { derivedPropertiesUsed: infer Used extends object }
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
      MutationLogic['store']['updateUserName']
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
      'MutationCraft:pre:UserValue',
      { when: { hasUser: true } }
    >,
    true
  >
>;

type _UpdateButtonDelegatesToUpdateMethod = Expect<
  Equal<
    TemplateNamedElementDelegatesToContext<
      MutationTemplate,
      'MutationCraft:button:UpdateUserNameButton',
      'click',
      'updateUserNameFn'
    >,
    true
  >
>;

type _ComponentExposesStoreAndActions = Expect<
  Equal<
    MutationLogic extends {
      store: unknown;
      nameInput: unknown;
      updateUserNameFn: unknown;
      navigate: unknown;
    }
      ? true
      : false,
    true
  >
>;

function createStorageMock() {
  const values = new Map<string, string>();

  return {
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
  let name = '';
  const userQuery = {
    status: vi.fn(() => (user ? ('resolved' as const) : ('idle' as const))),
    hasValue: vi.fn(() => user !== undefined),
    value: vi.fn(() => user),
  };
  const updateUserName = {
    isLoading: vi.fn(() => mutationLoading),
    status: vi.fn(() =>
      mutationLoading ? ('loading' as const) : ('idle' as const),
    ),
  };
  const updateUserNameFn = vi.fn(function* (newName: string) {
    name = newName;
  });
  const setName = vi.fn(function* (newName: string) {
    name = newName;
  });
  const navigate = vi.fn(function* (_offset: number) {
    return undefined;
  });

  return {
    context: {
      store: { user: userQuery, updateUserName },
      nameInput: vi.fn(() => name),
      setName,
      hasUser: markYieldableValue(signal(user !== undefined), 'hasUser'),
      updateUserNameFn,
      navigate,
    },
    updateUserNameFn,
    navigate,
  };
}

describe('craft mutation template', () => {
  it('updates the user with the name entered in the input', async () => {
    const result = createTemplateContext({ id: '1', name: 'Romain' });
    const template = await setupCraftComponentTemplateTest.byRegister(
      MutationCraft,
      { context: result.context, register: {} },
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

      await vi.waitFor(() =>
        expect(result.updateUserNameFn).toHaveBeenCalledWith('Alice'),
      );
    } finally {
      template.destroy();
    }
  });

  it('renders the user value only when the query has a value', async () => {
    const withUser = createTemplateContext({ id: '1', name: 'Romain' });
    const withUserTemplate = await setupCraftComponentTemplateTest.byRegister(
      MutationCraft,
      {
        context: withUser.context,
        register: {},
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
      await setupCraftComponentTemplateTest.byRegister(MutationCraft, {
        context: withoutUser.context,
        register: {},
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
      MutationCraft,
      { context: result.context, register: {} },
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

describe('craft mutation logic', () => {
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
    const result = await setupCraftComponentLogicTest.byRegister(
      MutationCraft,
      {
        args: [(() => user.id) as Input<string | undefined>],
        register: {
          UserMutation: provideUserMutation(),
          ApiService: { getItemById, updateItem },
          LocalStorageService: storage,
          CraftRouter: { navigate },
        } as never,
      },
    );

    await vi.waitFor(() => expect(getItemById).toHaveBeenCalledWith(user.id));

    return { ...result, getItemById, updateItem, navigate, storage, user };
  }

  it('loads the user and updates its name through the mutation', async () => {
    const { context, updateItem, user, destroy } = await setupLogic();

    try {
      context.updateUserNameFn('Alice');

      await vi.waitFor(() =>
        expect(updateItem).toHaveBeenCalledWith({
          id: user.id,
          name: 'Alice',
        }),
      );
    } finally {
      destroy();
    }
  });

  it('navigates to the relative user from navigate', async () => {
    const { context, navigate, destroy } = await setupLogic();

    try {
      context.navigate(-1);

      expect(navigate).toHaveBeenCalledWith({
        to: 'craft/mutation/:userId',
        params: { userId: '0' },
      });
    } finally {
      destroy();
    }
  });
});
