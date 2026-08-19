import { describe, expect, it, vi } from 'vitest';
import { createServer } from './server';
import { portableServerFunction } from './portable-server-function';
import {
  portableServerMiddleware,
  type ServerProgramAdapter,
} from './server-function-middleware';
import type { StandardSchemaV1 } from './standard-schema';

const textSchema: StandardSchemaV1<
  { readonly value: string },
  { readonly value: string }
> = {
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

type Task<A> = {
  readonly run: () => Promise<A>;
};

describe('portable server-function programs', () => {
  it('composes native Promise middleware in onion order and adapts it once', async () => {
    const trace: string[] = [];
    const outer = portableServerMiddleware(
      'portable.outer',
      async ({ next }) => {
        trace.push('outer:before');
        try {
          return await next({ context: { outer: true } });
        } finally {
          trace.push('outer:after');
        }
      },
    );
    const inner = portableServerMiddleware(
      'portable.inner',
      async ({ context, next }) => {
        trace.push(`inner:before:${String(context.outer)}`);
        const result = await next({ context: { inner: true } });
        trace.push('inner:after');
        return result;
      },
    );
    const fn = portableServerFunction('portable.promise', textSchema, {
      exposure: 'client',
    })
      .use(outer)
      .use(inner)
      .handler(
        async ({ input, context }) => `${input.value}:${String(context.inner)}`,
      );
    const adapter: ServerProgramAdapter<unknown, unknown> = {
      run: vi.fn((program) => program),
    };
    const server = createServer({ functions: [fn], execute: adapter.run });

    await expect(
      server.invoke('portable.promise', { value: 'ada' }),
    ).resolves.toBe('ada:true');
    expect(trace).toEqual([
      'outer:before',
      'inner:before:true',
      'inner:after',
      'outer:after',
    ]);
    expect(adapter.run).toHaveBeenCalledOnce();
    // The adapter receives the Promise itself, not its resolved value.
    expect(adapter.run.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('supports an application-defined Task without Effect in the core', async () => {
    const task = portableServerMiddleware(
      'portable.task',
      ({ next }): Task<unknown> => ({
        run: async () => next({ context: { task: true } }).run(),
      }),
    );
    const fn = portableServerFunction('portable.task-function', textSchema)
      .use(task)
      .handler(
        ({ input, context }): Task<string> => ({
          run: async () => `${input.value}:${String(context.task)}`,
        }),
      );

    const server = createServer({
      functions: [fn],
      execute: (program) => (program as Task<unknown>).run(),
    });

    await expect(
      server.invoke('portable.task-function', { value: 'ada' }),
    ).resolves.toBe('ada:true');
  });

  it('preserves short-circuiting and never enters the downstream handler', async () => {
    const handler = vi.fn(() => 'unreachable');
    const denied = portableServerMiddleware('portable.denied', () =>
      Promise.reject(new Error('denied')),
    );
    const fn = portableServerFunction('portable.denied-function', textSchema)
      .use(denied)
      .handler(handler);
    const server = createServer({
      functions: [fn],
      execute: (program) => program,
    });

    await expect(
      server.invoke('portable.denied-function', { value: 'ada' }),
    ).rejects.toThrow('denied');
    expect(handler).not.toHaveBeenCalled();
  });
});
