import { describe, expect, it, vi } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { createServer } from './server';
import { requireServerPermission } from './client-di-requirement';
import { portableServerFunction } from './portable-server-function';
import {
  flatMapContext,
  mapContext,
  serverLayer,
  serverLayerReading,
  type ServerProgramChain,
  type ServerProgramSuccess,
} from './server-layer';
import type { StandardSchemaV1 } from './standard-schema';

const textSchema: StandardSchemaV1<
  { readonly value: string },
  { readonly value: string }
> = {
  '~standard': {
    version: 1,
    vendor: 'server-layer-test',
    types: undefined,
    validate(value) {
      return typeof value === 'object' && value !== null && 'value' in value
        ? { value: value as { readonly value: string } }
        : { issues: [{ message: 'value expected' }] };
    },
  },
};

/**
 * Un protocole de programme que le core ne connaît pas : ni Promise, ni Effect.
 * Le porteur `ServerProgramSuccess` est tout ce qu'il faut pour que le canal de
 * succès reste lisible au niveau des types.
 */
type Task<Success> = {
  readonly run: () => Promise<Success>;
} & ServerProgramSuccess<Success>;

const taskChain: ServerProgramChain<Task<any>> = (program, continuation) => ({
  run: async () => continuation(await program.run()).run(),
});

describe('server layers composed with .pipe(...)', () => {
  it('runs the handler when no layer is declared', async () => {
    const fn = portableServerFunction('layer.empty', textSchema).handler(
      async ({ input, context }) =>
        `${input.value}:${Object.keys(context).length}`,
    );
    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(server.invoke('layer.empty', { value: 'ada' })).resolves.toBe(
      'ada:0',
    );
  });

  it('threads a typed context through every layer and into the handler', async () => {
    const trace: string[] = [];
    const withAudit = serverLayer('layer.audit', async ({ next }) => {
      trace.push('audit:before');
      try {
        return await next({ context: { auditId: 'audit-1' } });
      } finally {
        trace.push('audit:after');
      }
    });
    const withLocale = serverLayerReading<{ readonly auditId: string }>()(
      'layer.locale',
      async ({ context, next }) => {
        trace.push(`locale:before:${context.auditId}`);
        return next({ context: { locale: 'fr-FR' } });
      },
    );

    const fn = portableServerFunction('layer.enriched', textSchema)
      .pipe(
        withAudit,
        withLocale,
        mapContext(({ input, context }) => ({
          label: `${context.auditId}/${context.locale}/${input.value}`,
        })),
        flatMapContext(async ({ context }) => ({
          upper: context.label.toUpperCase(),
        })),
      )
      .handler(async ({ context }) => {
        // Chaque clé produite en amont est visible ici, typée.
        type _Audit = Expect<Equal<typeof context.auditId, string>>;
        type _Upper = Expect<Equal<typeof context.upper, string>>;
        return `${context.label}|${context.upper}`;
      });

    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(server.invoke('layer.enriched', { value: 'ada' })).resolves.toBe(
      'audit-1/fr-FR/ada|AUDIT-1/FR-FR/ADA',
    );
    expect(trace).toEqual([
      'audit:before',
      'locale:before:audit-1',
      'audit:after',
    ]);
  });

  it('hands the opaque program to the adapter, never to a hidden await', async () => {
    const adapter = { run: vi.fn((program: unknown) => program) };
    const fn = portableServerFunction('layer.opaque', textSchema)
      .pipe(mapContext(({ input }) => ({ echo: input.value })))
      .handler(async ({ context }) => context.echo);
    const server = createServer({ functions: [fn], execute: adapter.run });

    await expect(server.invoke('layer.opaque', { value: 'ada' })).resolves.toBe(
      'ada',
    );
    expect(adapter.run).toHaveBeenCalledOnce();
    expect(adapter.run.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  it('composes an application Task without Effect and without awaiting it', async () => {
    const withTask = serverLayer(
      'layer.task',
      ({ next }): Task<{ readonly traced: boolean }> => ({
        run: () =>
          next<
            { readonly traced: boolean },
            Task<{ readonly traced: boolean }>
          >({ context: { traced: true } }).run(),
      }),
    );
    const loadScore = (value: string): Task<{ readonly score: number }> => ({
      run: async () => ({ score: value.length }),
    });

    const fn = portableServerFunction('layer.task-function', textSchema)
      .pipe(
        withTask,
        flatMapContext(({ input }) => loadScore(input.value), taskChain),
      )
      .handler(
        ({ context }): Task<string> => ({
          run: async () => `${String(context.traced)}:${context.score}`,
        }),
      );

    const server = createServer({
      functions: [fn],
      execute: (program) => (program as Task<unknown>).run(),
    });

    await expect(
      server.invoke('layer.task-function', { value: 'ada' }),
    ).resolves.toBe('true:3');
  });

  it('lets an upstream layer observe a downstream failure and keeps its payload', async () => {
    const observed: unknown[] = [];
    const withObserver = serverLayer('layer.observer', async ({ next }) => {
      try {
        return await next({ context: { observed: true } });
      } catch (error) {
        observed.push(error);
        throw error;
      }
    });
    const failure = Object.assign(new Error('boom'), {
      _tag: 'DemoLayerFailure',
      status: 422,
    });
    const fn = portableServerFunction('layer.failing', textSchema)
      .pipe(withObserver)
      .handler(async () => {
        throw failure;
      });
    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(
      server.invoke('layer.failing', { value: 'ada' }),
    ).rejects.toMatchObject({ _tag: 'DemoLayerFailure', status: 422 });
    expect(observed).toEqual([failure]);
  });

  it('short-circuits without entering the downstream handler, hooks included', async () => {
    const after: string[] = [];
    const handler = vi.fn(async () => 'unreachable');
    const withGuard = serverLayer('layer.guard', async () => {
      after.push('guard:denied');
      throw new Error('denied');
    });
    const withOuter = serverLayer('layer.outer', async ({ next }) => {
      try {
        return await next({ context: {} });
      } finally {
        after.push('outer:after');
      }
    });
    const fn = portableServerFunction('layer.short-circuit', textSchema)
      .pipe(withOuter, withGuard)
      .handler(handler);
    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(
      server.invoke('layer.short-circuit', { value: 'ada' }),
    ).rejects.toThrow('denied');
    expect(handler).not.toHaveBeenCalled();
    expect(after).toEqual(['guard:denied', 'outer:after']);
  });

  it('rejects a context patch that is not a set of keys', async () => {
    const fn = portableServerFunction('layer.scalar', textSchema)
      // Un appelant JavaScript n'a pas le typage pour l'en empêcher.
      .pipe(mapContext(({ input }) => input.value as never))
      .handler(async () => 'unreachable');
    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(
      server.invoke('layer.scalar', { value: 'ada' }),
    ).rejects.toThrow('CRAFT_SERVER_LAYER_CONTEXT_PATCH_INVALID');
  });

  it('accepts a contract pipe and a layer pipe on the same builder', async () => {
    const fn = portableServerFunction('layer.permission', textSchema, {
      exposure: 'client',
    })
      .pipe(requireServerPermission('users:read'))
      .pipe(
        serverLayer('layer.permission-audit', async ({ next }) =>
          next({ context: { checked: true } }),
        ),
        mapContext(({ context }) => ({ proof: `checked=${context.checked}` })),
      )
      .handler(async ({ context, pipes }) => `${context.proof}:${pipes.length}`);

    const granted = createServer({
      functions: [fn],
      execute: (p) => p,
      checkPermission: (permission) => permission === 'users:read',
    });
    await expect(
      granted.invoke('layer.permission', { value: 'ada' }),
    ).resolves.toBe('checked=true:1');

    const denied = createServer({
      functions: [fn],
      execute: (p) => p,
      checkPermission: () => false,
    });
    await expect(
      denied.invoke('layer.permission', { value: 'ada' }),
    ).rejects.toThrow('CRAFT_SERVER_FUNCTION_PERMISSION_DENIED');
  });

  it('keeps .use(...) working alongside the new composition', async () => {
    const fn = portableServerFunction('layer.mixed', textSchema)
      .pipe(serverLayer('layer.mixed-first', async ({ next }) =>
        next({ context: { first: 1 } }),
      ))
      .handler(async ({ context }) => context.first);
    const server = createServer({ functions: [fn], execute: (p) => p });

    await expect(server.invoke('layer.mixed', { value: 'ada' })).resolves.toBe(1);
    expect(fn.layers?.map((layer) => layer.id)).toEqual(['layer.mixed-first']);
    expect(fn.middlewares).toEqual([]);
  });
});

describe('server layer typing', () => {
  const withUser = serverLayer('layer.user', async ({ next }) =>
    next({ context: { user: { id: 'user-ada' } } }),
  );

  it('refuses a layer that reads a context key produced later', () => {
    portableServerFunction('layer.too-early', textSchema)
      // @ts-expect-error `user` is only produced by withUser, declared after.
      .pipe(mapContext(({ context }) => ({ id: context.user.id })), withUser)
      .handler(async () => 'unreachable');
    expect(true).toBe(true);
  });

  it('refuses a layer that re-declares a key produced upstream', () => {
    portableServerFunction('layer.collision', textSchema)
      .pipe(
        withUser,
        // @ts-expect-error `user` is already in the accumulated context.
        mapContext(({ context }) => ({ user: context.user })),
      )
      .handler(async () => 'unreachable');
    expect(true).toBe(true);
  });

  it('refuses a handler reading a key no layer produced', () => {
    portableServerFunction('layer.unknown-key', textSchema)
      .pipe(withUser)
      // @ts-expect-error `auditId` was never produced by the chain.
      .handler(async ({ context }) => context.auditId);
    expect(true).toBe(true);
  });
});
