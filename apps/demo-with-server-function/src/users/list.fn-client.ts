import {
  craftUnique,
  createServerFunctionClient,
} from '@craft-ts/core';
import type { listUsers as ServerListUsers } from './list.fn-serveur';

export const getUsers = createServerFunctionClient<typeof ServerListUsers>(
  craftUnique('demo.users.list'),
);
