import {
  createServerFunctionClient,
  type ServerFunctionTransport,
} from '@craft-ts/core';
import type { getUsers as ServerGetUsers } from './list.fn-serveur';
import { usersListContract } from './list.fn-contract';

export function createUsersClient(transport?: ServerFunctionTransport) {
  return createServerFunctionClient<typeof ServerGetUsers>(
    usersListContract,
    transport,
  );
}

export const getUsers = createUsersClient();
