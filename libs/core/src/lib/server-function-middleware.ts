import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import {
  assertMiddlewareId,
  flattenMiddlewareGraph,
  type CraftMiddlewareResult,
  type MergeOptionalSchemaOutputs,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type OverwriteContext,
} from './middleware-schema-shared';
import type {
  AnyCraftClientMiddleware,
  ClientMiddlewareContextOf,
  ClientMiddlewareProvidesOf,
  ClientMiddlewareRunContext,
  CraftClientMiddleware,
} from './client-function-middleware';
import { createClientMiddlewareYieldable } from './client-function-middleware';
import type { CraftSchema } from './schema-validation';
import type { ServerFunctionToken } from './client-di-requirement';

export {
  assertMiddlewareId,
  type CraftMiddlewareResult,
  type MergeOptionalSchemaOutputs,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type OverwriteContext,
};

export type MiddlewareSchemasOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  infer Schemas,
  any,
  any,
  any,
  any,
  any
>
  ? Schemas
  : readonly [];

export type MiddlewareSchemasOfAll<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? readonly [...MiddlewareSchemasOf<Head>, ...MiddlewareSchemasOfAll<Tail>]
  : readonly [];

export type MiddlewareClientContextsOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  any,
  any,
  infer ClientSchemas,
  any
>
  ? ClientSchemas
  : readonly [];

export type MiddlewareClientContextsOfAll<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? readonly [
      ...MiddlewareClientContextsOf<Head>,
      ...MiddlewareClientContextsOfAll<Tail>,
    ]
  : readonly [];

export type MiddlewareContextOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  infer Context,
  any,
  any,
  any
>
  ? Context
  : never;

export type MiddlewareValueOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  infer Value,
  any,
  any,
  any,
  any
>
  ? Value
  : never;

export type MiddlewareErrorOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  any,
  infer Error,
  any,
  any
>
  ? Error
  : never;

export type MiddlewareRequirementsOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  any,
  any,
  any,
  infer Requirements
>
  ? Requirements
  : never;

export type MergedMiddlewareContext<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? OverwriteContext<MiddlewareContextOf<Head>, MergedMiddlewareContext<Tail>>
  : Record<never, never>;

export type MergedMiddlewareError<
  Middlewares extends readonly AnyCraftMiddleware[],
> = MiddlewareErrorOf<Middlewares[number]>;

export type MergedMiddlewareRequirements<
  Middlewares extends readonly AnyCraftMiddleware[],
> = MiddlewareRequirementsOf<Middlewares[number]>;

export type MiddlewareRunContext<
  Schemas extends readonly CraftSchema[],
  ContextIn extends MiddlewareContext,
> = {
  readonly input: MergeSchemaOutputs<Schemas>;
  readonly context: ContextIn;
  readonly resolve: <Value>(token: ServerFunctionToken<Value>) => Value;
};

type ServerMiddlewareProgram<
  Value,
  ContextOut extends MiddlewareContext,
  Error,
  Requirements,
> = Effect.Effect<
  CraftMiddlewareResult<Value, ContextOut>,
  Error,
  Requirements
>;

export interface CraftMiddleware<
  Id extends string = string,
  Schemas extends readonly CraftSchema[] = readonly CraftSchema[],
  Value = unknown,
  ContextOut extends MiddlewareContext = MiddlewareContext,
  Error = never,
  ClientSchemas extends readonly CraftSchema[] = readonly CraftSchema[],
  Requirements = never,
> {
  readonly kind: 'server-function-middleware';
  readonly id: Id;
  readonly inputs: Schemas;
  readonly clientContexts: ClientSchemas;
  readonly dependencies: readonly AnyCraftMiddleware[];
  readonly run: (
    context: MiddlewareRunContext<Schemas, MiddlewareContext>,
  ) => ServerMiddlewareProgram<Value, ContextOut, Error, Requirements>;
  [Symbol.iterator](): {
    next(...args: ReadonlyArray<any>): IteratorResult<
      Effect.Effect<Value, Error, Requirements>,
      Value
    >;
  };
  readonly __contextOut?: ContextOut;
  readonly __value?: Value;
  readonly __error?: Error;
  readonly __requirements?: Requirements;
}

export type PortableServerMiddleware<
  Program = unknown,
  Id extends string = string,
  Schemas extends readonly CraftSchema[] = readonly CraftSchema[],
  ContextOut extends MiddlewareContext = MiddlewareContext,
  Error = unknown,
  Requirements = unknown,
  ClientSchemas extends readonly CraftSchema[] = readonly CraftSchema[],
> = CraftMiddleware<
  Id,
  Schemas,
  unknown,
  ContextOut,
  Error,
  ClientSchemas,
  Requirements
> & { readonly __program?: Program };

export type AnyCraftMiddleware = CraftMiddleware<
  string,
  readonly CraftSchema[],
  any,
  any,
  any,
  readonly CraftSchema[],
  any
>;

export interface CraftClientContextDeclaration<
  Schema extends CraftSchema = CraftSchema,
> {
  readonly kind: 'server-function-client-context';
  readonly schema: Schema;
}

export type AnyCraftMiddlewarePipeMember =
  | AnyCraftMiddleware
  | AnyCraftClientMiddleware
  | CraftClientContextDeclaration;

export function clientContext<Schema extends CraftSchema>(
  schema: Schema,
): CraftClientContextDeclaration<Schema> {
  return Object.freeze({ kind: 'server-function-client-context' as const, schema });
}

type CraftMiddlewareBuilderState = {
  readonly schemas: readonly CraftSchema[];
  readonly contextIn: MiddlewareContext;
  readonly error: unknown;
  readonly requirements: unknown;
  readonly provides: readonly CraftSchema[];
  readonly clientSchemas: readonly CraftSchema[];
};

type ApplyCraftMiddlewarePipeMember<
  State extends CraftMiddlewareBuilderState,
  Member extends AnyCraftMiddlewarePipeMember,
> = Member extends AnyCraftMiddleware
  ? {
      readonly schemas: readonly [...State['schemas'], ...MiddlewareSchemasOf<Member>];
      readonly contextIn: OverwriteContext<State['contextIn'], MiddlewareContextOf<Member>>;
      readonly error: State['error'] | MiddlewareErrorOf<Member>;
      readonly requirements: State['requirements'] | MiddlewareRequirementsOf<Member>;
      readonly provides: readonly [
        ...State['provides'],
        ...ClientMiddlewareProvidesOf<Member>,
      ];
      readonly clientSchemas: readonly [
        ...State['clientSchemas'],
        ...MiddlewareClientContextsOf<Member>,
      ];
    }
  : Member extends AnyCraftClientMiddleware
    ? {
        readonly schemas: State['schemas'];
        readonly contextIn: OverwriteContext<State['contextIn'], ClientMiddlewareContextOf<Member>>;
        readonly error: State['error'];
        readonly requirements: State['requirements'];
        readonly provides: readonly [
          ...State['provides'],
          ...ClientMiddlewareProvidesOf<Member>,
        ];
        readonly clientSchemas: State['clientSchemas'];
      }
    : Member extends CraftClientContextDeclaration<infer Schema>
      ? {
          readonly schemas: State['schemas'];
          readonly contextIn: State['contextIn'];
          readonly error: State['error'];
          readonly requirements: State['requirements'];
          readonly provides: State['provides'];
          readonly clientSchemas: readonly [...State['clientSchemas'], Schema];
        }
      : State;

type ApplyCraftMiddlewarePipe<
  State extends CraftMiddlewareBuilderState,
  Members extends readonly AnyCraftMiddlewarePipeMember[],
> = Members extends readonly [
  infer Head extends AnyCraftMiddlewarePipeMember,
  ...infer Tail extends readonly AnyCraftMiddlewarePipeMember[],
]
  ? ApplyCraftMiddlewarePipe<ApplyCraftMiddlewarePipeMember<State, Head>, Tail>
  : State;

type CraftMiddlewareBuilderFromState<
  Id extends string,
  State extends CraftMiddlewareBuilderState,
> = CraftMiddlewareBuilder<
  Id,
  State['schemas'],
  State['contextIn'],
  State['error'],
  State['requirements'],
  State['provides'],
  State['clientSchemas']
>;

export interface CraftMiddlewareBuilder<
  Id extends string,
  Schemas extends readonly CraftSchema[],
  ContextIn extends MiddlewareContext,
  Error,
  Requirements,
  Provides extends readonly CraftSchema[] = readonly [],
  ClientSchemas extends readonly CraftSchema[] = readonly [],
> {
  readonly pipe: <const Members extends readonly AnyCraftMiddlewarePipeMember[]>(
    ...members: Members
  ) => CraftMiddlewareBuilderFromState<
    Id,
    ApplyCraftMiddlewarePipe<
      {
        readonly schemas: Schemas;
        readonly contextIn: ContextIn;
        readonly error: Error;
        readonly requirements: Requirements;
        readonly provides: Provides;
        readonly clientSchemas: ClientSchemas;
      },
      Members
    >
  >;
  readonly use: {
    <Middleware extends AnyCraftMiddleware>(
      middleware: Middleware,
    ): CraftMiddlewareBuilder<
      Id,
      readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>],
      OverwriteContext<ContextIn, MiddlewareContextOf<Middleware>>,
      Error | MiddlewareErrorOf<Middleware>,
      Requirements | MiddlewareRequirementsOf<Middleware>,
      Provides,
      readonly [...ClientSchemas, ...MiddlewareClientContextsOf<Middleware>]
    >;
    <Middleware extends AnyCraftClientMiddleware>(middleware: Middleware): CraftMiddlewareBuilder<
      Id,
      Schemas,
      ContextIn,
      Error,
      Requirements,
      readonly [...Provides, ...ClientMiddlewareProvidesOf<Middleware>],
      ClientSchemas
    >;
  };
  readonly input: <Schema extends CraftSchema>(schema: Schema) => CraftMiddlewareBuilder<
    Id,
    readonly [...Schemas, Schema],
    ContextIn,
    Error,
    Requirements,
    Provides,
    ClientSchemas
  >;
  readonly clientContext: <Schema extends CraftSchema>(schema: Schema) => CraftMiddlewareBuilder<
    Id,
    Schemas,
    ContextIn,
    Error,
    Requirements,
    Provides,
    readonly [...ClientSchemas, Schema]
  >;
  readonly provides: <Schema extends CraftSchema>(schema: Schema) => CraftMiddlewareBuilder<
    Id,
    Schemas,
    ContextIn,
    Error,
    Requirements,
    readonly [...Provides, Schema],
    ClientSchemas
  >;
  readonly server: <
    Value,
    ContextOut extends MiddlewareContext = Record<never, never>,
    RunError = never,
    RunRequirements = never,
  >(
    run: (
      context: MiddlewareRunContext<Schemas, ContextIn>,
    ) => ServerMiddlewareProgram<Value, ContextOut, RunError, RunRequirements>,
  ) => CraftMiddleware<
    Id,
    Schemas,
    Value,
    OverwriteContext<ContextIn, ContextOut>,
    Error | RunError,
    ClientSchemas,
    Requirements | RunRequirements
  >;
  readonly client: <ContextOut extends MiddlewareContext>(
    run: (context: ClientMiddlewareRunContext<ContextIn>) => Generator<unknown, ContextOut, unknown>,
  ) => CraftClientMiddleware<Id, Provides, OverwriteContext<ContextIn, ContextOut>>;
}

export function craftMiddleware<const Id extends string>(id: Id): CraftMiddlewareBuilder<
  Id,
  readonly [],
  Record<never, never>,
  never,
  never,
  readonly [],
  readonly []
> {
  assertMiddlewareId(id);
  return makeBuilder(id, [], [], [], []) as CraftMiddlewareBuilder<
    Id,
    readonly [],
    Record<never, never>,
    never,
    never,
    readonly [],
    readonly []
  >;
}

type AnyMiddlewareValue = AnyCraftMiddleware | AnyCraftClientMiddleware;

function makeBuilder(
  id: string,
  inputs: readonly CraftSchema[],
  dependencies: readonly AnyMiddlewareValue[],
  provides: readonly CraftSchema[],
  clientContexts: readonly CraftSchema[],
): unknown {
  return {
    pipe(...members: AnyCraftMiddlewarePipeMember[]) {
      let nextInputs = inputs;
      let nextDependencies = dependencies;
      let nextProvides = provides;
      let nextClientContexts = clientContexts;
      for (const member of members) {
        if (isClientContextDeclaration(member)) {
          nextClientContexts = [...nextClientContexts, member.schema];
          continue;
        }
        nextInputs = member.kind === 'server-function-middleware'
          ? [...nextInputs, ...member.inputs]
          : nextInputs;
        nextDependencies = [...nextDependencies, member];
        nextProvides = member.kind === 'client-function-middleware'
          ? [...nextProvides, ...member.provides]
          : nextProvides;
        nextClientContexts = member.kind === 'server-function-middleware'
          ? [...nextClientContexts, ...member.clientContexts]
          : nextClientContexts;
      }
      return makeBuilder(id, nextInputs, nextDependencies, nextProvides, nextClientContexts);
    },
    use(middleware: AnyMiddlewareValue) {
      return makeBuilder(
        id,
        middleware.kind === 'server-function-middleware' ? [...inputs, ...middleware.inputs] : inputs,
        [...dependencies, middleware],
        middleware.kind === 'client-function-middleware' ? [...provides, ...middleware.provides] : provides,
        middleware.kind === 'server-function-middleware' ? [...clientContexts, ...middleware.clientContexts] : clientContexts,
      );
    },
    input(schema: CraftSchema) {
      return makeBuilder(id, [...inputs, schema], dependencies, provides, clientContexts);
    },
    provides(schema: CraftSchema) {
      return makeBuilder(id, inputs, dependencies, [...provides, schema], clientContexts);
    },
    clientContext(schema: CraftSchema) {
      return makeBuilder(id, inputs, dependencies, provides, [...clientContexts, schema]);
    },
    server(run: CraftMiddleware['run']) {
      const middleware = {
        kind: 'server-function-middleware',
        id,
        inputs,
        clientContexts,
        dependencies: assertSameFamily(id, dependencies, 'server-function-middleware'),
        run,
        *[Symbol.iterator]() {
          const scope = yield* MiddlewareExecutionScope;
          return yield* scope.execute(middleware);
        },
      } as unknown as AnyCraftMiddleware;
      return Object.freeze(middleware);
    },
    client(run: CraftClientMiddleware['run']) {
      const middleware: AnyCraftClientMiddleware = {
        kind: 'client-function-middleware' as const,
        id,
        provides,
        dependencies: assertSameFamily(id, dependencies, 'client-function-middleware'),
        run,
        *[Symbol.iterator]() {
          return yield* createClientMiddlewareYieldable(middleware);
        },
      };
      return Object.freeze(middleware);
    },
  };
}

function isClientContextDeclaration(value: AnyCraftMiddlewarePipeMember): value is CraftClientContextDeclaration {
  return value.kind === 'server-function-client-context';
}

function assertSameFamily<Kind extends AnyMiddlewareValue['kind']>(
  id: string,
  dependencies: readonly AnyMiddlewareValue[],
  kind: Kind,
): readonly Extract<AnyMiddlewareValue, { kind: Kind }>[] {
  for (const dependency of dependencies) {
    if (dependency.kind !== kind) {
      throw new Error(
        `Middleware "${id}" is a ${kind === 'client-function-middleware' ? 'client' : 'server'} middleware but depends on "${dependency.id}", which is a ${dependency.kind === 'client-function-middleware' ? 'client' : 'server'} middleware. A chain cannot mix both families.`,
      );
    }
  }
  return dependencies as readonly Extract<AnyMiddlewareValue, { kind: Kind }>[];
}

export function isCraftMiddleware(value: unknown): value is AnyCraftMiddleware {
  return typeof value === 'object' && value !== null &&
    (value as { kind?: unknown }).kind === 'server-function-middleware';
}

export function flattenMiddlewares(middlewares: readonly AnyCraftMiddleware[]): readonly AnyCraftMiddleware[] {
  return flattenMiddlewareGraph(middlewares);
}

export function collectMiddlewareSchemas(contractInput: CraftSchema, middlewares: readonly AnyCraftMiddleware[]): readonly CraftSchema[] {
  const schemas: CraftSchema[] = [contractInput];
  for (const middleware of flattenMiddlewares(middlewares)) {
    for (const schema of middleware.inputs) if (!schemas.includes(schema)) schemas.push(schema);
  }
  return schemas;
}

export function collectMiddlewareClientContextSchemas(contractClientContext: CraftSchema | undefined, middlewares: readonly AnyCraftMiddleware[]): readonly CraftSchema[] {
  const schemas = contractClientContext ? [contractClientContext] : [];
  for (const middleware of flattenMiddlewares(middlewares)) {
    for (const schema of middleware.clientContexts) if (!schemas.includes(schema)) schemas.push(schema);
  }
  return schemas;
}

export type MiddlewareChainHandler = (context: {
  readonly input: unknown;
  readonly context: MiddlewareContext;
}) => unknown;

type MiddlewareCacheEntry = { readonly value: unknown; readonly context: MiddlewareContext };

export type MiddlewareExecutionScopeShape = {
  readonly execute: (middleware: AnyCraftMiddleware) => Effect.Effect<unknown, unknown, unknown>;
  readonly context: MiddlewareContext;
};

export class MiddlewareExecutionScope extends Context.Service<
  MiddlewareExecutionScope,
  MiddlewareExecutionScopeShape
>()('craft/server-function-middleware-scope') {}

function createMiddlewareExecutionScope(
  input: unknown,
  resolve: <Value>(token: ServerFunctionToken<Value>) => Value,
): MiddlewareExecutionScopeShape {
  const cache = new Map<string, MiddlewareCacheEntry>();
  const running = new Set<string>();
  let context: MiddlewareContext = {};
  const execute = (middleware: AnyCraftMiddleware): Effect.Effect<unknown, unknown, unknown> => {
    const cached = cache.get(middleware.id);
    if (cached) return Effect.succeed(cached.value);
    if (running.has(middleware.id)) {
      return Effect.die(new Error(`Cyclic middleware execution involving "${middleware.id}".`));
    }
    return Effect.gen(function* () {
      running.add(middleware.id);
      try {
        const result = yield* middleware.run({ input: input as never, context: context as never, resolve });
        const normalized = normalizeMiddlewareResult(result);
        const published = normalized.context ?? {};
        context = { ...context, ...published };
        cache.set(middleware.id, { value: normalized.value, context: published });
        return normalized.value;
      } finally {
        running.delete(middleware.id);
      }
    });
  };
  return { execute, get context() { return context; } };
}

function normalizeMiddlewareResult(value: unknown): CraftMiddlewareResult<unknown> {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const candidate = value as { value: unknown; context?: unknown };
    return {
      value: candidate.value,
      context: typeof candidate.context === 'object' && candidate.context !== null
        ? candidate.context as MiddlewareContext
        : undefined,
    };
  }
  return { value };
}

export function runMiddlewareChain(
  middlewares: readonly AnyCraftMiddleware[],
  input: unknown,
  handler: MiddlewareChainHandler,
  _clientContext: MiddlewareContext = {},
  resolve: <Value>(token: ServerFunctionToken<Value>) => Value = () => {
    throw new Error('This server middleware requires DI, but no server runtime resolver was provided.');
  },
): Effect.Effect<unknown, unknown, unknown> {
  const chain = flattenMiddlewares(middlewares);
  const scope = createMiddlewareExecutionScope(input, resolve);
  const program = Effect.gen(function* () {
    for (const middleware of chain) yield* scope.execute(middleware);
    const result = handler({ input, context: scope.context });
    return Effect.isEffect(result) ? yield* result : result;
  });
  return Effect.provideService(program, MiddlewareExecutionScope, scope);
}
