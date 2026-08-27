import { Context, Data, Effect } from 'effect';

export type UserRole = 'admin' | 'member';

export type AuthenticatedUser = {
  readonly id: string;
  readonly databaseId: string;
  readonly role: UserRole;
  /** Set by the auth provider when a previously valid session is revoked. */
  readonly sessionStatus?: 'active' | 'revoked';
};

/** Shared Effect service contract. Client and server provide different values. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  AuthenticatedUser
>()('demo/CurrentUser') {}

/** Request-scoped server session; null means that authentication is absent. */
export class CurrentSession extends Context.Service<
  CurrentSession,
  AuthenticatedUser | null
>()('demo/CurrentSession') {}

export class AdminRequired extends Data.TaggedError('AdminRequired')<{
  readonly message: string;
  readonly authenticatedUserId: string;
  readonly role: UserRole;
}> {}

export class SessionRequired extends Data.TaggedError('SessionRequired')<{
  readonly message: string;
}> {}

export class SessionRevoked extends Data.TaggedError('SessionRevoked')<{
  readonly message: string;
  readonly authenticatedUserId: string;
}> {}

/** Shared authorization rule, evaluated against the local CurrentUser service. */
export const requireAdmin = Effect.gen(function* () {
  const user = yield* CurrentUser;
  if (user.role !== 'admin') {
    return yield* new AdminRequired({
      message: `Authenticated user "${user.id}" has role "${user.role}"; admin role required.`,
      authenticatedUserId: user.id,
      role: user.role,
    });
  }
  return user;
});

/** Server-only authorization check against the request's verified session. */
export const requireAdminSession = Effect.gen(function* () {
  const user = yield* CurrentSession;
  if (user === null) {
    return yield* new SessionRequired({
      message: 'An active authenticated session is required.',
    });
  }
  if (user.sessionStatus === 'revoked') {
    return yield* new SessionRevoked({
      message: `Authenticated session for "${user.id}" has been revoked.`,
      authenticatedUserId: user.id,
    });
  }
  if (user.role !== 'admin') {
    return yield* new AdminRequired({
      message: `Authenticated user "${user.id}" has role "${user.role}"; admin role required.`,
      authenticatedUserId: user.id,
      role: user.role,
    });
  }
  return user;
});
