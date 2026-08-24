import { craftUnique, createServerFunctionClient } from '@craft-ts/core';
import type { portableListUsers as ServerPortableListUsers } from './portable-list.fn-serveur';

export const getPortableUsers = createServerFunctionClient<
  typeof ServerPortableListUsers
>(craftUnique('demo.users.portable-list'));
