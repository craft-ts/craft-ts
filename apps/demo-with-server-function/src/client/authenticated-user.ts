import { Layer } from 'effect';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../shared/authenticated-user';

/** Separate client-side instance of the shared Effect service. */
export const clientAuthenticatedUser: AuthenticatedUser = {
  id: 'user-ada',
  databaseId: 'demo-database',
  role: 'admin',
};

export const ClientCurrentUserLive = Layer.succeed(CurrentUser)(
  clientAuthenticatedUser,
);
