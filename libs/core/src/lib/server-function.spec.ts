import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftUnique,
  createServer,
  createServerFunctionClient,
  provideServerFunctionTransport,
  requireClientDI,
  requireServerPermission,
  serverFunction,
  serverFunctionContract,
  TestBed,
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

  it('runs client-exposed functions through a typed transport and DI resolver', async () => {
    const CurrentUser = new InjectionToken<{ id: string }>('CurrentUser');
    const contract = serverFunctionContract({
      id: 'users.current',
      input: numberSchema((value) => value),
      exposure: 'client',
    });
    const implementation = serverFunction(contract)
      .pipe(requireClientDI(CurrentUser, { mode: 'snapshot' }))
      .pipe(requireServerPermission('users:read'))
      .handler(({ input, required }) => `${required(CurrentUser).id}:${input}`);
    const requests: unknown[] = [];
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

    await expect(
      TestBed.runInInjectionContext(() => client(4)),
    ).resolves.toBe('u-1:4');
    expect(requests).toEqual([{ id: 'users.current', input: 4 }]);

    const server = createServer({
      functions: [implementation],
      runtime: { resolve: <Value>() => ({ id: 'u-1' } as Value) },
    });
    await expect(server.invoke('users.current', 4)).resolves.toBe('u-1:4');
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
