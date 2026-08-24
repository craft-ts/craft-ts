# 9. Call server functions — proof of concept

::: danger Not a final contract

The server-function integration is currently a **proof of concept**. The file
conventions, transport, middleware composition and production integration are
not definitive yet and may change. Use this chapter to understand the current
experiment and to build demos; do not treat it as a stable deployment API.

:::

**Goal:** understand the current client → registry → Effect server path.

## The current shape

An exposed function has a server implementation and a client facade:

```text
users/list.fn-client.ts
users/list.fn-serveur.ts
        │
        └── HTTP/RPC → createServer registry → Effect handler
```

The client imports only the server function's type. It must not import the
server implementation at runtime.

## Define the server implementation

The current experimental API takes an identifier, an input schema and an
exposure mode. The handler returns an Effect:

```typescript
// users/list.fn-serveur.ts
import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';

const inputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);

export const listUsers = serverFunction(
  'demo.users.list',
  inputSchema,
  { exposure: 'client' },
).handler(({ input }) =>
  Effect.gen(function* () {
    const repository = yield* UserRepository;
    return yield* repository.list(input.filter);
  }),
);
```

The server handler's success, typed errors and Effect requirements are the source
of truth. Do not duplicate a result type or an error list manually.

## Define the client facade

```typescript
// users/list.fn-client.ts
import { createServerFunctionClient } from '@craft-ts/core';
import type { listUsers as ServerListUsers } from './list.fn-serveur';

export const getUsers = createServerFunctionClient<typeof ServerListUsers>(
  'demo.users.list',
);
```

The component uses the facade like a typed function. Wrap it in `queryEffect` or
`mutationEffect` if the call belongs to a resource lifecycle:

```typescript
import { isCraftException } from '@craft-ts/core';

const users = yield* queryEffect('users', {
  params: () => ({ filter: search() }),
  loader: ({ params }) =>
    Effect.gen(function* () {
      const result = yield* Effect.promise(() => getUsers(params));
      if (isCraftException(result)) return yield* Effect.fail(result);
      return result;
    }),
});
```

The exact transport adapter is still experimental. The repository's
`demo-with-server-function` app currently uses `createServer`, `executeEffect`
and a local HTTP bridge.

## Register and execute on the server

```typescript
const application = createServer({
  functions: [listUsers],
  execute: executeEffect(runtimeLayer).run,
});
```

The runtime Layer supplies server-only services such as a repository or the
current user. Never import secrets, credentials or server implementations into
a client module.

## Middleware and security

The current demo also shows Effect middleware:

```typescript
const audited = effectServerMiddleware('demo.audit', ({ next }) =>
  Effect.gen(function* () {
    yield* Effect.log('before');
    const result = yield* Effect.exit(next());
    yield* Effect.log('after');
    return yield* result;
  }),
);
```

Middleware may add typed failures, resolve Effect services and run before/after
hooks. Client claims remain untrusted; authenticate and authorize again on the
server, then publish only verified values to the handler context.

## Current limitations

Treat these as constraints of the POC, not promises of the final design:

- the browser transport and development plugin are local experimental adapters;
- client/server file boundaries are checked by the current architecture graph,
  but deployment integration is still evolving;
- middleware APIs and the server registry may be renamed or reshaped;
- the server must re-check authorization even if the client has a matching
  Effect Layer.

See the running examples in
[`apps/demo-with-server-function`](https://github.com/craft-ts/craft-ts/tree/main/apps/demo-with-server-function)
and the server-function architecture plan in the repository when this work is
promoted out of the prototype area.

## What you gained

You can experiment with typed Effect server calls while keeping an explicit
client/server boundary. Keep this chapter isolated from stable application
contracts until the POC is replaced by a final server-function API.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 8. Test the graph](/learn-effect/08-testing)

[Back to the overview →](/learn-effect/)

</div>
