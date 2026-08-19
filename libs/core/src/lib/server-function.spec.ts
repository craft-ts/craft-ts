import { beforeEach, describe, expect, it } from 'vitest';
import {
  clientContext,
  craftUnique,
  createServer,
  createServerFunctionClient,
  provideServerFunctionTransport,
  requireClientDI,
  requireServerPermission,
  serverFunction,
  serverFunctionContract,
  TestBed,
  type ServerFunctionRequest,
  type StandardSchemaV1,
} from '@craft-ts/core';
import { InjectionToken } from './host/craft-compat';

type TestSchema<Input, Output> = StandardSchemaV1<Input, Output>;

const numberSchema = (transform: (value: number) => number): TestSchema<number, number> =>
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
    const Secret = new InjectionToken<string>('Secret');
    const serverOnlyBuilder = serverFunction(
      'math.server-only',
      numberSchema((value) => value),
    );
    // @ts-expect-error requireClientDI is not legal on a server-only contract.
    serverOnlyBuilder.pipe(requireClientDI(Secret));

    const add = serverFunction('math.add', numberSchema((value) => value)).handler(
      ({ input }) => input + 1,
    );
    const server = createServer({ functions: [add] });

    await expect(server.invoke('math.add', 2)).resolves.toBe(3);
    await expect(server.invoke('math.add', 'nope')).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_INPUT_INVALID',
    );
  });

  it('transporte une valeur du DI navigateur jusqu’à required() côté serveur', async () => {
    const CurrentUser = new InjectionToken<{ id: string }>('CurrentUser');
    const requireCurrentUser = requireClientDI(CurrentUser, {
      mode: 'snapshot',
    });
    const contract = serverFunctionContract({
      id: 'users.current',
      input: numberSchema((value) => value),
      exposure: 'client',
    });
    const implementation = serverFunction(contract)
      .pipe(requireCurrentUser)
      .pipe(requireServerPermission('users:read'))
      .handler(({ input, required }) => `${required(CurrentUser).id}:${input}`);
    const requests: ServerFunctionRequest[] = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: CurrentUser, useValue: { id: 'u-1' } },
        provideServerFunctionTransport(async (request) => {
          requests.push(request);
          return 'u-1:4';
        }),
      ],
    });
    const client = createServerFunctionClient<typeof implementation>(
      craftUnique('users.current'),
      clientContext([requireCurrentUser]),
    );

    await expect(
      TestBed.runInInjectionContext(() => client(4)),
    ).resolves.toBe('u-1:4');
    // La valeur lue dans le DI du navigateur voyage dans le canal `context`,
    // versionné, jamais mélangée à l'input.
    expect(requests).toEqual([
      {
        id: 'users.current',
        input: 4,
        context: { CurrentUser: { id: 'u-1' } },
        protocolVersion: 1,
      },
    ]);

    const server = createServer({
      functions: [implementation],
      // Le résolveur serveur existe, mais `required(CurrentUser)` ne l'utilise
      // plus : la valeur vient du navigateur, validée, jamais du DI serveur.
      runtime: { resolve: <Value>() => ({ id: 'server-side' } as Value) },
      checkPermission: (permission) => permission === 'users:read',
    });
    await expect(
      server.invoke('users.current', 4, { CurrentUser: { id: 'u-1' } }),
    ).resolves.toBe('u-1:4');

    // Fail-closed : sans contexte client, la requête est refusée.
    await expect(server.invoke('users.current', 4)).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID',
    );
  });

  it('rejette une permission déclarée mais refusée', async () => {
    const implementation = serverFunction(
      'users.restricted',
      numberSchema((value) => value),
      { exposure: 'client' },
    )
      .pipe(requireServerPermission('users:write'))
      .handler(({ input }) => input);

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
    const one = serverFunction('same.id', numberSchema((value) => value)).handler(
      ({ input }) => input,
    );
    const two = serverFunction('same.id', numberSchema((value) => value)).handler(
      ({ input }) => input,
    );

    expect(() => createServer({ functions: [one, two] })).toThrow(
      'Duplicate server function id "same.id"',
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
});
