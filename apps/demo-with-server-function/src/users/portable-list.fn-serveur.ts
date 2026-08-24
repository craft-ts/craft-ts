import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  flatMapContext,
  mapContext,
  portableServerFunction,
  type StandardSchemaV1,
} from '@craft-ts/core';
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
        typeof (value as { readonly filter?: unknown }).filter === 'string'
      ) {
        return {
          value: {
            filter: (value as { readonly filter: string }).filter,
          },
        };
      }
      return { issues: [{ message: 'filter must be a string' }] };
    },
  },
};

const usersPath = fileURLToPath(
  new URL('../../data/users.json', import.meta.url),
);

/** A plain Promise program: the layer that runs it never sees an Effect. */
async function loadUserDirectory(): Promise<{
  readonly directory: readonly User[];
  readonly scanned: number;
}> {
  const directory = JSON.parse(
    await readFile(usersPath, 'utf8'),
  ) as readonly User[];
  return { directory, scanned: directory.length };
}

/**
 * The same registry executes this Promise program through its `execute`
 * adapter. No Effect value is created by this server function.
 *
 * The chain is composed with `.pipe(...)`, and each step sees what the previous
 * ones produced:
 *
 *   {}  ->  { auditId, startedAt }        portableAudit, an onion layer
 *       ->  + { normalizedFilter, label } mapContext, pure and synchronous
 *       ->  + { directory, scanned }      flatMapContext, a Promise program
 *
 * The handler reads the accumulated context, fully typed, and decides.
 */
export const portableListUsers = portableServerFunction(
  'demo.users.portable-list',
  filterSchema,
  { exposure: 'client' },
)
  .pipe(
    portableAudit,
    mapContext(({ input, context }) => ({
      normalizedFilter: input.filter.trim().toLocaleLowerCase(),
      label: `${context.auditId}#${input.filter}`,
    })),
    flatMapContext(() => loadUserDirectory()),
  )
  .handler(async ({ context }) => {
    console.log(`portable request label=${context.label}`); // todoR interdir appel à console.log ?
    return {
      auditId: context.auditId,
      filter: context.normalizedFilter,
      scanned: context.scanned,
      users: context.directory.filter((user) =>
        `${user.name} ${user.email}`
          .toLocaleLowerCase()
          .includes(context.normalizedFilter),
      ),
    };
  })
  .exposeErrors({});
