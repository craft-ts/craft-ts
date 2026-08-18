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

The test output also displays the client request and the lines read from the
local database.
