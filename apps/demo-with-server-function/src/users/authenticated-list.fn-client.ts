import {
  craftUnique,
  createServerFunctionClient,
} from '@craft-ts/core';
import type {
  getAuthenticatedUsers as ServerGetAuthenticatedUsers,
} from './authenticated-list.fn-serveur';

export const getAuthenticatedUsers =
  createServerFunctionClient<typeof ServerGetAuthenticatedUsers>(
    craftUnique('demo.users.authenticated-list'),
  );
