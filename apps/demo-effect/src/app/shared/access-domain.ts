import { Context, Data, Effect, Layer } from 'effect';

export type UserRole = 'admin' | 'member' | 'suspended';

export type UserProfile = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly teamId: string;
};

export type AccessDecision = {
  readonly user: UserProfile;
  readonly allowed: boolean;
  readonly level: 'full' | 'read-only' | 'blocked';
  readonly label: string;
  readonly reason: string;
};

export type TeamOverview = {
  readonly teamName: string;
  readonly viewerName: string;
  readonly viewerAccess: string;
  readonly members: readonly UserProfile[];
};

export class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

export const MOCK_USERS: readonly UserProfile[] = [
  {
    id: 'user-ada',
    name: 'Ada Lovelace',
    email: 'ada@craft.dev',
    role: 'admin',
    teamId: 'platform',
  },
  {
    id: 'user-grace',
    name: 'Grace Hopper',
    email: 'grace@craft.dev',
    role: 'member',
    teamId: 'support',
  },
  {
    id: 'user-linus',
    name: 'Linus Torvalds',
    email: 'linus@craft.dev',
    role: 'suspended',
    teamId: 'support',
  },
];

export type ProfileScenario =
  | 'success'
  | 'not-found'
  | 'session-expired'
  | 'database-down';

/** Mocked domain operation used to demonstrate Effect's result channels. */
export const loadUserProfile = Effect.fnUntraced(function* (
  scenario: ProfileScenario,
) {
  yield* Effect.sleep('400 millis');

  switch (scenario) {
    case 'not-found':
      return yield* new UserNotFound({ userId: 'user-404' });
    case 'session-expired':
      return yield* new Unauthorized({ reason: 'session expired' });
    case 'database-down':
      return yield* Effect.die(
        new Error('the mock profile database is unavailable'),
      );
    case 'success':
      return MOCK_USERS[0];
  }
});

export type AccessPolicyServiceShape = {
  readonly decide: (
    userId: string,
  ) => Effect.Effect<AccessDecision, UserNotFound>;
};

export class AccessPolicyService extends Context.Service<
  AccessPolicyService,
  AccessPolicyServiceShape
>()('demo-effect/AccessPolicyService') {}

export const AccessPolicyLive = Layer.sync(AccessPolicyService)(() => ({
  decide: Effect.fnUntraced(function* (userId: string) {
    yield* Effect.sleep('250 millis');
    const user = MOCK_USERS.find((candidate) => candidate.id === userId);
    if (!user) return yield* new UserNotFound({ userId });

    switch (user.role) {
      case 'admin':
        return {
          user,
          allowed: true,
          level: 'full',
          label: 'Full access',
          reason: 'The administrator role allows viewing the profile.',
        } satisfies AccessDecision;
      case 'member':
        return {
          user,
          allowed: true,
          level: 'read-only',
          label: 'Read only',
          reason: 'The member can view the profile without editing it.',
        } satisfies AccessDecision;
      case 'suspended':
        return {
          user,
          allowed: false,
          level: 'blocked',
          label: 'Access blocked',
          reason: 'The account is suspended and cannot be viewed.',
        } satisfies AccessDecision;
    }
  }),
}));

/** Business operation: the component does not resolve AccessPolicyService. */
export const checkUserAccess = Effect.fnUntraced(function* (userId: string) {
  const policy = yield* AccessPolicyService;
  return yield* policy.decide(userId);
});

export class SessionService extends Context.Service<
  SessionService,
  { readonly user: UserProfile }
>()('demo-effect/SessionService') {}

export const SessionLive = Layer.succeed(SessionService, {
  user: MOCK_USERS[0],
});

export class TeamContextService extends Context.Service<
  TeamContextService,
  { readonly id: string; readonly name: string }
>()('demo-effect/TeamContextService') {}

export const SupportTeamLive = Layer.succeed(TeamContextService, {
  id: 'support',
  name: 'Support Team',
});

/** Mocked read of a business view requiring both global and route context. */
export const loadTeamOverview = Effect.gen(function* () {
  yield* Effect.sleep('200 millis');
  const session = yield* SessionService;
  const team = yield* TeamContextService;
  const members = MOCK_USERS.filter((user) => user.teamId === team.id);

  return {
    teamName: team.name,
    viewerName: session.user.name,
    viewerAccess: session.user.role === 'admin' ? 'Administrator' : 'Member',
    members,
  } satisfies TeamOverview;
});
