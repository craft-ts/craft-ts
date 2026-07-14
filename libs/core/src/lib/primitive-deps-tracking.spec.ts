import { describe, it, expect } from 'vitest';
import {
  craftService,
  mutation,
  query,
  CraftHttpClient,
  onAppStart,
} from '../index';
import type { ExtractServiceHelperDependencies } from '../index';

type User = { id: string; role: string };

type Expect<T extends true> = T;
type ChildrenOf<Deps> = Deps extends { dependencies: infer D } ? D : never;
type HasDependency<
  Deps,
  Name extends string,
> = Name extends keyof ChildrenOf<Deps> ? true : false;

describe('primitive dependency tracking', () => {
  it('detects a dependency used only inside loaders when the primitive is yielded', () => {
    const { injectAuth } = craftService(
      { name: 'Auth', scope: 'global', appStart: true },
      function* () {
        const register = yield* mutation({
          method: ({
            email,
            password,
          }: {
            email: string;
            password: string;
          }) => ({
            email,
            password,
          }),
          loader: function* ({ params }) {
            return yield* CraftHttpClient.post(({ response }) => ({
              url: '/api/auth/register',
              payload: params,
              success: response<User>(),
            }));
          },
        });

        const userQuery = yield* query({
          method: (emptyPayload: string) => emptyPayload,
          loader: function* () {
            return yield* CraftHttpClient.get(({ response }) => ({
              url: '/api/auth/me',
              success: response<User | undefined>(),
              exceptions: [],
            }));
          },
        });

        yield* onAppStart(() => void userQuery.call('go'));
        return { userQuery, register };
      },
    );

    type AuthDeps = ExtractServiceHelperDependencies<typeof injectAuth>;
    type _Detected = Expect<HasDependency<AuthDeps, 'CraftHttpClient'>>;

    expect(typeof injectAuth).toBe('function');
  });

  it('detects a loader dependency without any explicit track wrapper', () => {
    const { injectAuthUntracked } = craftService(
      { name: 'AuthUntracked', scope: 'global' },
      function* () {
        const register = yield* mutation({
          method: (p: { email: string }) => p,
          loader: function* ({ params }) {
            return yield* CraftHttpClient.post(({ response }) => ({
              url: '/x',
              payload: params,
              success: response<User>(),
            }));
          },
        });
        return { register };
      },
    );

    type Deps = ExtractServiceHelperDependencies<typeof injectAuthUntracked>;
    // The primitive generator surfaces its dependency map through `yield*`,
    // no explicit track wrapper needed.
    type _Detected = Expect<HasDependency<Deps, 'CraftHttpClient'>>;

    expect(typeof injectAuthUntracked).toBe('function');
  });
});
