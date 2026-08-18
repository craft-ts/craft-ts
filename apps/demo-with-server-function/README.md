# Demo with server function

This demo shows two forms of server function:

```txt
simple case called from CraftTS
  -> users/list.fn-client.ts
  -> users/list.fn-serveur.ts
  -> no access to client DI

case called from CraftTS with an authenticated identity
  -> users/authenticated-list.fn-client.ts
  -> users/authenticated-list.fn-serveur.ts
  -> server-side CurrentUser Effect service + UserRepository
```

The CraftTS page now uses the authenticated case and shows the complete path:

```txt
client-side Effect CurrentUser service
  -> role UX check
  -> client facade
  -> HTTP POST /__server-functions
  -> createServer registry
  -> server function handler
  -> server-side role check
  -> Effect.gen
  -> UserRepository provided by an Effect Layer
  -> local data/users.json file
```

It contains a real CraftTS front-end page. The server file owns its Effect input
schema, and the client file imports only the server function type with
`import type`. The component uses the `craftComponent`, `state`, `queryEffect`,
`craftComputed`, `each`, and `ifBlock` helpers.
Its form calls the client facade in the browser; the Vite server plugin then
wires `/__server-functions` to the server function registry.

The Node HTTP bridge is not a custom implementation: the demo uses
`@effect/platform-node/NodeHttpServer.makeHandler` to adapt the registry's Web
application to Node requests and responses. The Craft registry remains
responsible for resolving the server function and its JSON protocol, while
Effect handles HTTP execution and request lifecycles.

The `users/list.fn-serveur.ts` case remains the simple path, without identity or
authorization, and serves as a comparison.

The `authenticated-list` case is intentionally more complete. The `CurrentUser`
contract and the `requireAdmin` business effect live in
`src/shared/authenticated-user.ts`. The frontend and server each provide a
different instance through a `Layer`, but execute exactly the same Effect
logic. The frontend immediately blocks users who are not administrators. The
frontend may send a `userId`, but that value and the client-side role are
considered untrusted. The server resolves its own `CurrentUser`, checks the
`admin` role again, and then verifies that the ID matches the session.

## Middleware

Both server-side checks live in a middleware chain, in
`users/admin-access.mw-serveur.ts`, not in the handler:

```ts
export const adminOnly = craftMiddleware('demo.admin-only').server(({ next }) =>
  Effect.gen(function* () {
    const authenticatedUser = yield* requireAdmin;
    return yield* next({ context: { authenticatedUser } });
  }),
);

export const matchingUser = craftMiddleware('demo.matching-user')
  .use(adminOnly)
  .input(Schema.toStandardSchemaV1(Schema.Struct({ userId: Schema.String })))
  .server(({ input, context, next }) =>
    Effect.gen(function* () {
      if (input.userId !== context.authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({ /* … */ });
      }
      return yield* next({ context: {} });
    }),
  );
```

The server function then declares the chain with `.use(...)` and keeps only its
own work:

```ts
export const getAuthenticatedUsers = serverFunction(
  'demo.users.authenticated-list',
  Schema.toStandardSchemaV1(Schema.Struct({ filter: Schema.String })),
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .use(matchingUser)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      context.authenticatedUser; // published by the middleware, fully typed
      input.userId;              // validated by the middleware input schema
      input.filter;              // validated by the server function schema
      // …
    }),
  );
```

Three things are inferred, with no manual declaration:

- **the input** — `userId` is declared by the middleware and merged into the
  server function input, on the handler side *and* on the client facade side;
- **the context** — `context.authenticatedUser` is what the middleware published
  through `next({ context })`;
- **the error channel** — `AdminRequired` and `AuthenticatedUserMismatch` are
  raised by the middleware and end up in the `Effect` error channel of the
  server function, then in the client facade return type.

Middleware run as an onion: each one may act before and after `next()`, and
dependencies declared with `.use(...)` run first and are deduplicated by id.

Because the input is validated once, ahead of the chain, a middleware input
schema **must ignore unknown keys** — the default behaviour of `Schema.Struct`.
A strict schema would reject the fields contributed by the server function
itself.

The local database is the `data/users.json` file, read by an Effect repository;
no database server or native package is required. The server handler returns an
`Effect` with a typed business error and a `UserRepository` dependency.

From the repository root, start the application:

```bash
npm start
```

This command is an alias for:

```bash
npx nx serve demo-with-server-function
```

Then open [http://localhost:4202](http://localhost:4202).

Vite serves the front-end and also exposes the backend at
`POST /__server-functions` through the demo plugin. There are therefore no two
processes or CORS configuration to start for this demo: the frontend calls the
server function on the same origin, and it runs Effect on the server.

The filter is sent to the server, and the results come from `data/users.json`.
The server function intentionally waits 600 ms before reading the database so
that the loading state is visible in the interface.
To run only the integration test:

```bash
npx nx test demo-with-server-function
```

Or directly:

```bash
npx vitest run --config apps/demo-with-server-function/vitest.config.ts
```

## Architecture and graph

The static graph is analysed from `tsconfig.graph.json`. From the repository
root, `npm run graph:update` refreshes
`craft-dependency-graph.demo-with-server-function.{json,mmd,html}`. The
architecture suite also checks the server-function client/server family
contract:

```bash
npx nx architecture demo-with-server-function
npx nx typecheck-architecture demo-with-server-function
```

The rules are grouped in `architecture/architecture.spec.ts` so that the
TypeScript graph is only built once per Vitest run.

The test output also displays the client request and the lines read from the
local database.
