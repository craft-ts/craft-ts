import { serverFunction } from '@craft-ts/core';
import { Effect } from 'effect';
import { usersListContract } from './list.fn-contract';
import { UserRepository } from '../server/database';

export const getUsers = serverFunction(usersListContract).handler(
  ({ input }) =>
    Effect.gen(function* () {
      const users = yield* UserRepository;
      return yield* users.list(input.filter);
    }),
);
