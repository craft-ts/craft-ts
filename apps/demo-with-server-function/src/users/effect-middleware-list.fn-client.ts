import { craftUnique, createServerFunctionClient } from '@craft-ts/core';
import type { effectMiddlewareListUsers as ServerEffectMiddlewareListUsers } from './effect-middleware-list.fn-serveur';

export const getEffectMiddlewareUsers = createServerFunctionClient<
  typeof ServerEffectMiddlewareListUsers
>(craftUnique('demo.users.effect-middleware-list'));
