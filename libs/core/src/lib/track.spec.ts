import { describe, it, expect } from 'vitest';
import {
  craftService,
  mutation,
  query,
  CraftHttpClient,
  track,
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

describe('track', () => {
  it('detects a dependency used only inside loaders when wrapped with track', () => {
    const { injectAuth } = craftService(
      { name: 'Auth', scope: 'global', appStart: true },
      function* () {
        const register = yield* track(
          mutation({
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
          }),
        );

        const userQuery = yield* track(
          query({
            method: (emptyPayload: string) => emptyPayload,
            loader: function* () {
              return yield* CraftHttpClient.get(({ response }) => ({
                url: '/api/auth/me',
                success: response<User | undefined>(),
                exceptions: [],
              }));
            },
          }),
        );

        yield* onAppStart(() => void userQuery.call('go'));
        return { userQuery, register };
      },
    );

    type AuthDeps = ExtractServiceHelperDependencies<typeof injectAuth>;
    type _Detected = Expect<HasDependency<AuthDeps, 'CraftHttpClient'>>;

    expect(typeof injectAuth).toBe('function');
  });

  it('does NOT detect a loader dependency when the primitive is not tracked', () => {
    const { injectAuthUntracked } = craftService(
      { name: 'AuthUntracked', scope: 'global' },
      // Negative control: the factory intentionally does NOT yield/track the
      // dependent primitive, so the dependency must stay undetected.
      // eslint-disable-next-line require-yield
      function* () {
        const register = mutation({
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
    // Without track the dependency stays invisible to the service tree.
    type _NotDetected = Expect<
      HasDependency<Deps, 'CraftHttpClient'> extends false ? true : false
    >;

    expect(typeof injectAuthUntracked).toBe('function');
  });
});
