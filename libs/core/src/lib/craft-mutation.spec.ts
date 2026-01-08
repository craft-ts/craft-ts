import { Expect, Equal } from 'test-type';
import { inject, InjectionToken, ResourceRef, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { mutation } from './mutation';
import { craft } from './craft';
import { craftInputs } from './craft-inputs';
import { craftMutations } from './craft-mutations';

type User = {
  id: string;
  name: string;
  email: string;
  address?: {
    street: string;
  };
};

describe('craftMutation', () => {
  it('#1 The serverState should expose a mutation resource and mutation method', () => {
    const { Craft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftMutations(() => ({
        updateUser: mutation({
          method: (id: string) => ({ id }),
          loader: async ({ params }) => {
            return {
              id: params.id,
              name: 'Updated User',
              email: 'er@d',
            } satisfies User;
          },
        }),
      }))
    );
    TestBed.runInInjectionContext(() => {
      const store = inject(Craft);
      expect(store.updateUser).toBeDefined();
      expect(store.updateUser.hasValue()).toBe(false);
      expect(store.mutateUpdateUser).toBeDefined();
    });
  });
});

// Types testing 👇

type InferServerStateResult<T> = T extends InjectionToken<infer U> ? U : never;

it('Should expose a method', () => {
  const { Craft } = craft(
    {
      name: '',
      providedIn: 'root',
    },
    craftMutations(() => ({
      user: mutation({
        method: (data: { page: string }) => data.page,
        loader: async ({ params }) => {
          return {
            id: params,
            name: 'Updated User',
            email: 'er@d',
          } satisfies User;
        },
      }),
    }))
  );

  type ResultTypeMutation = InferServerStateResult<typeof Craft>;
  type MutationProps = ResultTypeMutation;

  type t = MutationProps['user'];

  type ExpectPropsToHaveMutationNameWithResourceRef = Expect<
    Equal<
      MutationProps['user']['value'],
      Signal<
        | {
            id: string;
            name: string;
            email: string;
          }
        | undefined
      >
    >
  >;

  type ExpectPropsToHaveARecordcraftMutationNamecraftMutationState = Expect<
    Equal<
      // paramsSource is tested in another test (I did not find the way to satisfy it here)
      MutationProps['user']['value'],
      Signal<
        | {
            id: string;
            name: string;
            email: string;
          }
        | undefined
      >
    >
  >;
});

it('Should expose the mutation resource and mutation method', () => {
  const { Craft } = craft(
    {
      name: '',
      providedIn: 'root',
    },
    craftInputs({
      sourceId: {
        id: '4',
      },
    }),
    craftMutations((context) => ({
      user: mutation({
        params: context.sourceId,
        loader: async ({ params }) => {
          type ExpectParamsToBeAnObjectWithStringId = Expect<
            Equal<typeof params, { id: string }>
          >;
          return {
            id: params.id,
            name: 'Updated User',
            email: 'er@d',
          } satisfies User;
        },
      }),
      testExposeMutationMethod: mutation({
        method: ({ id }: { id: string }) => ({
          id,
        }),
        loader: async ({ params }) => {
          type ExpectParamsToBeAnObjectWithStringId = Expect<
            Equal<typeof params, { id: string }>
          >;
          return {
            id: params.id,
            name: 'Updated User',
            email: 'er@d',
          } satisfies User;
        },
      }),
    }))
  );

  type MutationStoreOutputType = InferServerStateResult<typeof Craft>;

  type ExpectMutationStoreOutputTypeToHaveMutationResource = Expect<
    Equal<
      MutationStoreOutputType['user']['value'],
      Signal<
        | {
            id: string;
            name: string;
            email: string;
          }
        | undefined
      >
    >
  >;
  type ExpectMutationStoreOutputTypeToHaveMutationMethod = Expect<
    Equal<
      MutationStoreOutputType['mutateTestExposeMutationMethod'],
      (args: { id: string }) => {
        id: string;
      }
    >
  >;
});

it('it should expose the mutation params source, that will be reused by query', async () => {
  const { Craft } = craft(
    {
      name: '',
      providedIn: 'root',
    },
    craftMutations(() => ({
      updateUser: mutation({
        method: (user: User) => user,
        loader: async ({ params: user }) => {
          await wait(10);
          return user satisfies User;
        },
      }),
    }))
  );

  type ReturnInternalStoreType = InferServerStateResult<typeof Craft>;
  type ExpectMutationParamsSourceToBeDefined = Expect<
    Equal<
      ReturnInternalStoreType['updateUser']['value'],
      Signal<NonNullable<NoInfer<User>> | undefined>
    >
  >;
});

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
