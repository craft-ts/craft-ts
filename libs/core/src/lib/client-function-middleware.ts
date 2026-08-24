import {
  flattenMiddlewareGraph,
  type CraftMiddlewareResult,
  type MiddlewareContext,
} from './middleware-schema-shared';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import { CraftGenShortCircuit } from './craft-gen';
import type { Injector } from './host/craft-compat';
import type { CraftHandshakeSchema } from './craft-handshake';
import { craftHandshakeName } from './craft-handshake';
import type { CraftSchema, SchemaInput } from './schema-validation';

export type ClientMiddlewareRunContext<
  ContextIn extends MiddlewareContext = MiddlewareContext,
> = {
  readonly input: unknown;
  readonly context: ContextIn;
};

export interface CraftClientMiddleware<
  Id extends string = string,
  Provides extends readonly CraftSchema[] = readonly CraftSchema[],
  ContextOut extends MiddlewareContext = MiddlewareContext,
> {
  readonly kind: 'client-function-middleware';
  readonly id: Id;
  readonly provides: Provides;
  readonly dependencies: readonly AnyCraftClientMiddleware[];
  readonly run: (
    context: ClientMiddlewareRunContext,
  ) => Generator<unknown, ContextOut, unknown>;
  readonly [Symbol.iterator]: () => Generator<unknown, ContextOut, unknown>;
  readonly __clientContextOut?: ContextOut;
}

export type AnyCraftClientMiddleware = CraftClientMiddleware<string, readonly CraftSchema[], any>;

export type ClientMiddlewareProvidesOf<Middleware> = Middleware extends CraftClientMiddleware<any, infer Provides, any>
  ? Provides
  : readonly [];

export type ClientMiddlewareContextOf<Middleware> = Middleware extends CraftClientMiddleware<any, any, infer Context>
  ? Context
  : never;

export type ClientMiddlewareProvidesOfAll<Middlewares extends readonly AnyCraftClientMiddleware[]> = Middlewares extends readonly [
  infer Head extends AnyCraftClientMiddleware,
  ...infer Tail extends readonly AnyCraftClientMiddleware[],
]
  ? readonly [...ClientMiddlewareProvidesOf<Head>, ...ClientMiddlewareProvidesOfAll<Tail>]
  : readonly [];

export type MergedClientMiddlewareContext<Middlewares extends readonly AnyCraftClientMiddleware[]> = Middlewares extends readonly [
  infer Head extends AnyCraftClientMiddleware,
  ...infer Tail extends readonly AnyCraftClientMiddleware[],
]
  ? ClientMiddlewareContextOf<Head> & MergedClientMiddlewareContext<Tail>
  : Record<never, never>;

export function isCraftClientMiddleware(value: unknown): value is AnyCraftClientMiddleware {
  return typeof value === 'object' && value !== null &&
    (value as { kind?: unknown }).kind === 'client-function-middleware';
}

export function flattenClientMiddlewares(middlewares: readonly AnyCraftClientMiddleware[]): readonly AnyCraftClientMiddleware[] {
  return flattenMiddlewareGraph(middlewares);
}

export function collectClientMiddlewareSchemas(middlewares: readonly AnyCraftClientMiddleware[]): readonly CraftSchema[] {
  const schemas: CraftSchema[] = [];
  for (const middleware of flattenClientMiddlewares(middlewares)) {
    for (const schema of middleware.provides) if (!schemas.includes(schema)) schemas.push(schema);
  }
  return schemas;
}

export class ClientFunctionContextError extends Error {
  readonly code = 'CRAFT_CLIENT_FUNCTION_CONTEXT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];
  constructor(id: string, issues: readonly { readonly message: string }[]) {
    super(`CRAFT_CLIENT_FUNCTION_CONTEXT_INVALID: client middleware chain of "${id}" produced an invalid context: ${issues.map((issue) => issue.message).join(', ')}`);
    this.id = id;
    this.issues = issues;
    this.name = 'ClientFunctionContextError';
  }
}

type ClientScope = {
  readonly execute: (middleware: AnyCraftClientMiddleware) => Generator<unknown, MiddlewareContext, unknown>;
};

let activeClientScope: ClientScope | undefined;

function createClientScope(input: unknown): ClientScope {
  const cache = new Map<string, MiddlewareContext>();
  const running = new Set<string>();
  let context: MiddlewareContext = {};
  const execute = (middleware: AnyCraftClientMiddleware): Generator<unknown, MiddlewareContext, unknown> => {
    const cached = cache.get(middleware.id);
    if (cached) return (function* () { return cached; })();
    if (running.has(middleware.id)) throw new Error(`Cyclic middleware execution involving "${middleware.id}".`);
    return (function* () {
      running.add(middleware.id);
      try {
        const fragment = yield* middleware.run({ input, context });
        const value = (fragment && typeof fragment === 'object' && 'value' in fragment)
          ? (fragment as CraftMiddlewareResult<unknown, MiddlewareContext>).context ?? {}
          : fragment as MiddlewareContext;
        cache.set(middleware.id, value);
        context = { ...context, ...value };
        return value;
      } finally {
        running.delete(middleware.id);
      }
    })();
  };
  return { execute };
}

function* yieldClientMiddleware(middleware: AnyCraftClientMiddleware): Generator<unknown, MiddlewareContext, unknown> {
  if (!activeClientScope) throw new Error(`Client middleware "${middleware.id}" was yielded outside a client middleware invocation.`);
  return yield* activeClientScope.execute(middleware);
}

export function runClientMiddlewareChain(
  middlewares: readonly AnyCraftClientMiddleware[],
  input: unknown,
): Generator<unknown, MiddlewareContext, unknown> {
  const chain = flattenClientMiddlewares(middlewares);
  const scope = createClientScope(input);
  const invocation = (function* () {
    let context: MiddlewareContext = {};
    for (const middleware of chain) {
      const fragment = yield* scope.execute(middleware);
      context = { ...context, ...fragment };
    }
    return context;
  })();
  return bindClientScope(invocation, scope);
}

function bindClientScope<Yield, Return, Next>(
  iterator: Generator<Yield, Return, Next>,
  scope: ClientScope,
): Generator<Yield, Return, Next> {
  const withScope = <Result>(run: () => Result): Result => {
    const previous = activeClientScope;
    activeClientScope = scope;
    try {
      return run();
    } finally {
      activeClientScope = previous;
    }
  };
  return {
    next(value?: Next) {
      return withScope(() => iterator.next(value as Next));
    },
    return(value?: Return) {
      return withScope(() => iterator.return?.(value as Return) ?? {
        done: true,
        value: value as Return,
      });
    },
    throw(error?: unknown) {
      return withScope(() => iterator.throw?.(error) ?? (() => { throw error; })());
    },
    [Symbol.iterator]() {
      return this;
    },
  } as Generator<Yield, Return, Next>;
}

export function createClientMiddlewareYieldable<ContextOut extends MiddlewareContext>(
  middleware: AnyCraftClientMiddleware,
): Generator<unknown, ContextOut, unknown> {
  return yieldClientMiddleware(middleware) as Generator<unknown, ContextOut, unknown>;
}

export function craftHandshakeMiddleware<Name extends string, Schema extends CraftSchema>(
  handshake: CraftHandshakeSchema<Name, Schema>,
  run: () => Generator<unknown, SchemaInput<Schema>, unknown>,
): CraftClientMiddleware<Name, readonly [Schema], SchemaInput<Schema>> {
  const name = craftHandshakeName(handshake);
  if (name === undefined) throw new Error('craftHandshakeMiddleware(handshake, run) expects a craftHandshake(name, schema).');
  return Object.freeze({
    kind: 'client-function-middleware' as const,
    id: name as Name,
    provides: [handshake] as unknown as readonly [Schema],
    dependencies: [],
    *run() { return yield* run(); },
    *[Symbol.iterator]() { return yield* run(); },
  });
}

const INVALID_YIELD_ERROR_MESSAGE = 'A client function middleware can only yield craft dependencies, craft primitives, or — with the Effect bridge installed — an Effect.';

export async function runClientMiddlewareChainAsync(
  middlewares: readonly AnyCraftClientMiddleware[],
  input: unknown,
  injector: Injector,
): Promise<MiddlewareContext> {
  const settled = await executeGeneratorCompatibleFactoryAsync({
    factory: () => runClientMiddlewareChain(middlewares, input),
    thisArg: undefined,
    getInjector: () => injector,
    args: [],
    invalidYieldErrorMessage: INVALID_YIELD_ERROR_MESSAGE,
  });
  if (settled.kind === 'shortCircuit') throw new CraftGenShortCircuit(settled.exception);
  return (settled.value ?? {}) as MiddlewareContext;
}

export async function validateClientContext(id: string, schemas: readonly CraftSchema[], context: MiddlewareContext): Promise<void> {
  for (const schema of schemas) {
    const result = await schema['~standard'].validate(context);
    if (result.issues) throw new ClientFunctionContextError(id, result.issues);
  }
}
