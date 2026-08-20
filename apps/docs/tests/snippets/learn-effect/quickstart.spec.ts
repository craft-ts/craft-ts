// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// #region domain
import { Context, Data, Effect, Layer } from 'effect';

export type User = { readonly id: string; readonly name: string };

export class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

export type UserRepository = {
  readonly find: (userId: string) => Effect.Effect<User, UserNotFound>;
};

export class UserRepositoryService extends Context.Service<
  UserRepositoryService,
  UserRepository
>()('quickstart/UserRepository') {}

export const UserRepositoryLive = Layer.succeed(UserRepositoryService, {
  find: (userId) =>
    userId === 'user-ada'
      ? Effect.succeed({ id: userId, name: 'Ada Lovelace' })
      : Effect.fail(new UserNotFound({ userId })),
});

export const loadUser = (userId: string) =>
  Effect.gen(function* () {
    const repository = yield* UserRepositoryService;
    return yield* repository.find(userId);
  });
// #endregion domain

// #region component
import { craftComponent, p } from '@craft-ts/component';
import { queryEffect } from '@craft-ts/effect';

export const Profile = craftComponent(
  'EffectQuickstartProfile',
  {},
  function* () {
    const profile = yield* queryEffect('profile', {
      params: () => 'user-ada',
      loader: ({ params }) => loadUser(params),
    });

    return { profile };
  },
  ({ profile }) => [
    p(function* () {
      return (yield* profile.value())?.name ?? 'Loading…';
    }),
  ],
);
// #endregion component

// #region bootstrap
import { provideCraftRootComponent, bootstrapCraft } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
} from '@craft-ts/core';

export const appConfig = craftAppConfig({
  routingDeps: [],
  providers: [
    provideCraftRootComponent(Profile),
    provideLayer(UserRepositoryLive),
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});

export const start = () => bootstrapCraft({ config: appConfig });
// #endregion bootstrap

describe('Effect quickstart snippet', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    TestBed.resetTestingModule();
  });

  it('renders the Effect result through a Craft query', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(UserRepositoryLive),
    ]);
    const mounted = mountCraftComponent(
      Profile,
      element,
      injector as unknown as Injector,
    );
    TestBed.tick();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.textContent).toContain('Ada Lovelace');

    mounted.destroy();
    injector.destroy();
  });
});
