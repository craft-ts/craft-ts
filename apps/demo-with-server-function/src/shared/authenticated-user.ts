import { Context, Data, Effect } from 'effect';

export type UserRole = 'admin' | 'member';

export type AuthenticatedUser = {
  readonly id: string;
  readonly databaseId: string;
  readonly role: UserRole;
};

/** Shared Effect service contract. Client and server provide different values. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  AuthenticatedUser
>()('demo/CurrentUser') {}

export class AdminRequired extends Data.TaggedError('AdminRequired')<{
  readonly message: string;
  readonly authenticatedUserId: string;
  readonly role: UserRole;
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
