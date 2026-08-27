import {
  CurrentSession,
  CurrentUser,
  type AuthenticatedUser,
} from '../shared/authenticated-user';

export { CurrentSession, CurrentUser, type AuthenticatedUser };

/** Fake session used by the local demo in place of a real auth provider. */
export const demoAuthenticatedUser: AuthenticatedUser = {
  id: 'user-ada',
  databaseId: 'demo-database',
  role: 'admin',
};
