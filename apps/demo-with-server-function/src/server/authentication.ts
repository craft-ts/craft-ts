import { Context } from 'effect';

export type AuthenticatedUser = {
  readonly id: string;
  readonly databaseId: string;
};

/** Effect service resolved from the current request/session on the server. */
export class CurrentUser extends Context.Service<
  CurrentUser,
  AuthenticatedUser
>()('demo/CurrentUser') {}

/** Fake session used by the local demo in place of a real auth provider. */
export const demoAuthenticatedUser: AuthenticatedUser = {
  id: 'user-ada',
  databaseId: 'demo-database',
};
