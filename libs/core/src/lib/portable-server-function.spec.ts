import { describe, expect, it } from 'vitest';
import { createServer } from './server';
import { portableServerFunction } from './portable-server-function';
import type { StandardSchemaV1 } from './standard-schema';

const textSchema: StandardSchemaV1<{ readonly value: string }, { readonly value: string }> = {
  '~standard': {
    version: 1,
    vendor: 'portable-test',
    types: undefined,
    validate(value) {
      return typeof value === 'object' && value !== null && 'value' in value
        ? { value: value as { readonly value: string } }
        : { issues: [{ message: 'value expected' }] };
    },
  },
};

describe('portable server-function programs', () => {
  it('keeps the opaque program until the adapter executes it', async () => {
    const fn = portableServerFunction('portable.promise', textSchema, {
      exposure: 'client',
    }).handler(async ({ input }) => `${input.value}:ok`).exposeErrors({});
    const server = createServer({
      functions: [fn],
      execute: (program) => program,
    });

    await expect(server.invoke('portable.promise', { value: 'ada' })).resolves.toBe(
      'ada:ok',
    );
  });
});
