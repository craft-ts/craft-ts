import {
  serverFunctionContract,
  type StandardSchemaV1,
} from '@craft-ts/core';

export type ListUsersInput = {
  readonly filter: string;
};

const listUsersInputSchema = {
  '~standard': {
    version: 1,
    vendor: 'demo-with-server-function',
    types: undefined,
    validate(value: unknown) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'filter' in value &&
        typeof value['filter'] === 'string'
      ) {
        return { value: { filter: value['filter'] } };
      }
      return { issues: [{ message: 'filter must be a string' }] };
    },
  },
} as StandardSchemaV1<ListUsersInput, ListUsersInput>;

export const usersListContract = serverFunctionContract({
  id: 'demo.users.list',
  input: listUsersInputSchema,
  exposure: 'client',
});
