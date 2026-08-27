import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftUnique,
  createServer,
  createServerFunctionClient,
  executeGeneratorCompatibleFactoryAsync,
  provideServerFunctionTransport,
  requireServerPermission,
  serverFunction,
  serverFunctionContract,
  TestBed,
  type ServerFunctionRequest,
  type StandardSchemaV1,
} from '@craft-ts/core';
import { InjectionToken } from './host/craft-compat';
import { Data, Effect } from 'effect';

type TestSchema<Input, Output> = StandardSchemaV1<Input, Output>;

const numberSchema = (
  transform: (value: number) => number,
): TestSchema<number, number> =>
  ({
    '~standard': {
      version: 1,
      vendor: 'test',
      types: undefined,
      validate(value) {
        return typeof value === 'number'
          ? { value: transform(value) }
          : { issues: [{ message: 'number expected' }] };
      },
    },
  }) as TestSchema<number, number>;

describe('server functions', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('keeps a server-only function local to its implementation', async () => {
    const add = serverFunction(
      'math.add',
      numberSchema((value) => value),
    )
      .handler(({ input }) => input + 1)
      .exposeErrors({});
    const server = createServer({ functions: [add] });

    await expect(server.invoke('math.add', 2)).resolves.toBe(3);
    await expect(server.invoke('math.add', 'nope')).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_INPUT_INVALID',
    );
  });

  it('résout required() dans le DI du serveur, via le runtime du registre', async () => {
    const CurrentUser = new InjectionToken<{ id: string }>('CurrentUser');
    const contract = serverFunctionContract({
      id: 'users.current',
      input: numberSchema((value) => value),
      exposure: 'client',
    });
    const implementation = serverFunction(contract)
      .pipe(requireServerPermission('users:read'))
      .handler(({ input, required }) => `${required(CurrentUser).id}:${input}`)
      .exposeErrors({});
    const requests: ServerFunctionRequest[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideServerFunctionTransport(async (request) => {
          requests.push(request);
          return 'u-1:4';
        }),
      ],
    });
    const client = createServerFunctionClient<typeof implementation>(
      craftUnique('users.current'),
    );

    await expect(runServerFunction(client, 4)).resolves.toBe('u-1:4');
    // Aucun contexte client attendu : la requête garde sa forme historique.
    expect(requests).toEqual([{ id: 'users.current', input: 4 }]);

    const server = createServer({
      functions: [implementation],
      runtime: { resolve: <Value>() => ({ id: 'u-1' }) as Value },
      checkPermission: (permission) => permission === 'users:read',
    });
    await expect(server.invoke('users.current', 4)).resolves.toBe('u-1:4');
  });

  it('normalizes a rejected custom transport to a typed HTTP error', async () => {
    const _implementation = serverFunction(
      'users.transport-failure',
      numberSchema((value) => value),
      { exposure: 'client' },
    )
      .handler(({ input }) => input)
      .exposeErrors({});
    const connectionError = new TypeError('Failed to fetch');

    TestBed.configureTestingModule({
      providers: [
        provideServerFunctionTransport(async () => {
          throw connectionError;
        }),
      ],
    });
    const client = createServerFunctionClient<typeof _implementation>(
      craftUnique('users.transport-failure'),
    );

    await expect(runServerFunction(client, 4)).resolves.toMatchObject({
      _tag: 'HttpError',
      scope: 'ServerFunctionClient',
      identifier: 'users.transport-failure',
      payload: {
        id: 'users.transport-failure',
        status: 0,
        statusText: 'Unknown Error',
        body: connectionError,
      },
    });
  });

  it('rejette une permission déclarée mais refusée', async () => {
    const implementation = serverFunction(
      'users.restricted',
      numberSchema((value) => value),
      { exposure: 'client' },
    )
      .pipe(requireServerPermission('users:write'))
      .handler(({ input }) => input)
      .exposeErrors({});

    const denying = createServer({
      functions: [implementation],
      checkPermission: () => false,
    });
    await expect(denying.invoke('users.restricted', 4)).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_PERMISSION_DENIED',
    );

    // Fail-closed : une permission déclarée sans contrôle configuré est refusée.
    const unchecked = createServer({ functions: [implementation] });
    await expect(unchecked.invoke('users.restricted', 4)).rejects.toThrow(
      'no permission checker is configured',
    );
  });

  it('rejects duplicate ids in the server registry', () => {
    const one = serverFunction(
      'same.id',
      numberSchema((value) => value),
    )
      .handler(({ input }) => input)
      .exposeErrors({});
    const two = serverFunction(
      'same.id',
      numberSchema((value) => value),
    )
      .handler(({ input }) => input)
      .exposeErrors({});

    expect(() => createServer({ functions: [one, two] })).toThrow(
      'Duplicate server function id "same.id"',
    );
  });

  it('requires an explicit error exposure policy before registration', () => {
    const unexposed = serverFunction(
      'missing.exposure',
      numberSchema((value) => value),
    ).handler(({ input }) => input);

    expect(() => {
      // @ts-expect-error server functions must call .exposeErrors(...) first
      createServer({ functions: [unexposed] });
    }).toThrow(
      'Server function "missing.exposure" must call .exposeErrors(...) before it can be registered.',
    );
  });

  it('constrains a client key to the server definition id', () => {
    const implementation = serverFunction(
      'typed.id',
      numberSchema((value) => value),
      { exposure: 'client' },
    ).handler(({ input }) => input);

    createServerFunctionClient<typeof implementation>(craftUnique('typed.id'));
    // @ts-expect-error client keys must match the server definition id
    createServerFunctionClient<typeof implementation>(craftUnique('other.id'));
  });

  it('keeps the original error for direct invocation and projects it over HTTP', async () => {
    class PrivateFailure extends Data.TaggedError('PrivateFailure')<{
      readonly secret: string;
    }> {}

    const implementation = serverFunction(
      'users.private-failure',
      numberSchema((value) => value),
      { exposure: 'client' },
    )
      .handler(() => Effect.fail(new PrivateFailure({ secret: 'do-not-leak' })))
      .exposeErrors({
        PrivateFailure: (errorPayload) => ({
          code: 'PRIVATE_FAILURE',
          status: 422,
          payload: { safe: errorPayload.secret === 'do-not-leak' },
        }),
      });
    const incomplete = serverFunction(
      'users.incomplete-failure',
      numberSchema((value) => value),
    ).handler(() => Effect.fail(new PrivateFailure({ secret: 'hidden' })));
    // @ts-expect-error every tagged Effect failure needs an HTTP projection
    incomplete.exposeErrors({});
    const server = createServer({
      functions: [implementation],
      execute: (program) =>
        Effect.runPromise(program as Effect.Effect<unknown, unknown, never>),
    });

    await expect(
      server.invoke('users.private-failure', 1),
    ).rejects.toMatchObject({
      _tag: 'PrivateFailure',
      secret: 'do-not-leak',
    });

    const response = await server.handle(
      new Request('https://craft.test/__server-functions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'users.private-failure', input: 1 }),
      }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        _tag: 'PrivateFailure',
        code: 'PRIVATE_FAILURE',
        message: 'The request could not be completed.',
        safe: true,
      },
    });
  });
});

async function runServerFunction<Input, Output>(
  client: (input: Input) => Generator<unknown, Output, unknown>,
  input: Input,
): Promise<Output> {
  const invocation = TestBed.runInInjectionContext(() => client(input));
  const settled = await executeGeneratorCompatibleFactoryAsync({
    factory: () => invocation,
    thisArg: undefined,
    getInjector: () => TestBed.rootInjector,
    args: [],
    invalidYieldErrorMessage: 'invalid server-function yield',
  });
  if (settled.kind !== 'done') {
    throw new Error(`server function did not settle: ${settled.kind}`);
  }
  return settled.value as Output;
}
