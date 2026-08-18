import {
  createServerFunctionClient,
  type ServerFunctionTransport,
} from '@craft-ts/core';
import type {
  getAuthenticatedUsers as ServerGetAuthenticatedUsers,
} from './authenticated-list.fn-serveur';

export function createAuthenticatedUsersClient(
  transport?: ServerFunctionTransport,
) {
  return createServerFunctionClient<typeof ServerGetAuthenticatedUsers>(
    'demo.users.authenticated-list',
    transport,
  );
}

export const getAuthenticatedUsers = createAuthenticatedUsersClient();
