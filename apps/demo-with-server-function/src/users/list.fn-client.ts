import {
  createServerFunctionClient,
  type ServerFunctionTransport,
} from '@craft-ts/core';
import type { listUsers as ServerListUsers } from './list.fn-serveur';

/** Simple frontend facade: no client DI is required. */
export function createUsersClient(transport?: ServerFunctionTransport) {
  return createServerFunctionClient<typeof ServerListUsers>(
    'demo.users.list',
    transport,
  );
}

export const getUsers = createUsersClient();
