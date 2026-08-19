import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { portableServerFunction, type StandardSchemaV1 } from '@craft-ts/core';
import type { User } from './user-schema';
import { portableAudit } from './portable-audit.mw-serveur';

type FilterInput = { readonly filter: string };

const filterSchema: StandardSchemaV1<FilterInput, FilterInput> = {
  '~standard': {
    version: 1,
    vendor: 'demo-portable-server-function',
    types: undefined,
    validate(value) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof value.filter === 'string'
      ) {
        return { value: { filter: value.filter } };
      }
      return { issues: [{ message: 'filter must be a string' }] };
    },
  },
};

const usersPath = fileURLToPath(
  new URL('../../data/users.json', import.meta.url),
);

/**
 * The same registry executes this Promise program through its `execute`
 * adapter. No Effect value is created by this server function.
 */
export const portableListUsers = portableServerFunction(
  'demo.users.portable-list',
  filterSchema,
  { exposure: 'client' },
)
  .use(portableAudit)
  .handler(async ({ input, context }) => {
    const users = JSON.parse(
      await readFile(usersPath, 'utf8'),
    ) as readonly User[];
    const filter = input.filter.toLocaleLowerCase();
    console.log(`portable request audit=${String(context.auditId)}`);
    return users.filter((user) =>
      `${user.name} ${user.email}`.toLocaleLowerCase().includes(filter),
    );
  });
