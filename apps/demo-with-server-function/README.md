# Demo with server function

The default page starts with the smallest possible server-function example: a
public product catalogue with no middleware at all. The navigation then moves
from that baseline to authenticated and portable variants:

```txt
default public case called from CraftTS
  -> products/public-products.fn-client.ts
  -> products/public-products.fn-serveur.ts
  -> no middleware, no client context

simple user search called from CraftTS
  -> users/list.fn-client.ts
  -> users/list.fn-serveur.ts
  -> no access to client DI

case called from CraftTS with an authenticated identity
  -> users/authenticated-list.fn-client.ts
  -> users/authenticated-list.fn-serveur.ts
  -> server-side CurrentUser Effect service + UserRepository
```

The default product page shows the shortest path:

```txt
public product catalogue
  -> client facade
  -> HTTP POST /__server-functions
  -> createServer registry
  -> server function with no middleware
  -> public response
```

The authenticated page shows the complete path:

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

The `products/public-products.fn-serveur.ts` case is the first example on the
root route. It takes an empty input object, declares no middleware, and returns
public data. The `users/list.fn-serveur.ts` case remains a second simple path,
without identity or authorization, but adds a user filter and a repository
lookup for comparison.

The `authenticated-list` case is intentionally more complete. The `CurrentUser`
contract and the `requireAdmin` business effect live in
`src/shared/authenticated-user.ts`. The frontend and server each provide a
different instance through a `Layer`, but execute exactly the same Effect
logic. The frontend immediately blocks users who are not administrators. The
frontend announces a `userId` through the **client context** channel, but that
value and the client-side role are considered untrusted. The server resolves its
own `CurrentUser`, checks the `admin` role again, and then verifies that the
announced ID matches the session.

## Middleware

Both server-side checks live in a middleware chain, in
`users/admin-access.mw-serveur.ts`, not in the handler:

```ts
export const adminOnly = craftMiddleware('demo.admin-only').server(() =>
  Effect.gen(function* () {
    const authenticatedUser = yield* requireAdmin;
    return { value: authenticatedUser, context: { authenticatedUser } };
  }),
);

export const matchingUser = craftMiddleware('demo.matching-user')
  .pipe(adminOnly, clientContext(claimedUserHandshake))
  .server(() =>
    Effect.gen(function* () {
      const authenticatedUser = yield* adminOnly;
      const claimed = yield* ClaimedUserContext;
      if (claimed.userId !== authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({
          /* … */
        });
      }
      return { value: authenticatedUser };
    }),
  );
```

`userId` is **not** an input field: it is what the browser declares about
itself, and it arrives in `clientContext`, a channel kept separate from
`context` on purpose. `context` holds what the server chain proved;
`clientContext` holds what the client claimed. This middleware is what turns the
second into the first.

The server function then declares the chain with `.use(...)` and keeps only its
own work. A middleware declaration can accumulate server dependencies and
client-context requirements with `.pipe(...)`:

```ts
export const getAuthenticatedUsers = serverFunction(
  authenticatedListHandshake,
  Schema.toStandardSchemaV1(Schema.Struct({ filter: Schema.String })),
  { exposure: 'client', output: authenticatedListUsersOutputSchema },
)
  .use(matchingUser)
  .use(auditedRequest)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      context.authenticatedUser; // published by the middleware, fully typed
      context.requestLocale; // published by the audit middleware
      input.filter; // validated by the server function schema
      // …
    }),
  )
  .exposeErrors({
    // Cette fonction expose ses erreurs métier explicitement quand elle en a.
  });
```

Three things are inferred, with no manual declaration:

- **the input** — every middleware `.input(...)` schema is merged into the
  server function input, on the handler side _and_ on the client facade side;
- **the context** — `context.authenticatedUser` is what the middleware published
  through `{ value, context }` when it was attached with `.use(...)`;
- **the client context** — `clientContext.userId` and the audit fields are
  produced by client middleware and validated for shape on the server; server
  middleware checks sensitive claims before publishing trusted values into
  `context`;
- **the error channel** — `AdminRequired` and `AuthenticatedUserMismatch` are
  raised by the middleware and end up in the `Effect` error channel of the
  server function, then in the client facade return type.

Middleware execute as yieldable programs. Dependencies declared with
`.pipe(...)` run first and are deduplicated by id. When a middleware adds
context, it returns a `CraftMiddlewareResult`:

```ts
export const requestMetadata = craftMiddleware('demo.request-metadata').server(
  () => Effect.succeed({
    value: undefined,
    context: { source: 'authenticated-list' },
  }),
);
```

`yield* myMiddleware` returns its métier value directly. A middleware failure
short-circuits the invocation; there is no continuation or after-hook.

Because the input is validated once, ahead of the chain, a middleware input
schema **must ignore unknown keys** — the default behaviour of `Schema.Struct`.
A strict schema would reject the fields contributed by the server function
itself. The same holds for client-context schemas.

The call site only provides the explicit input:

```ts
getAuthenticatedUsers({ filter: 'ada' });
```

The attached client middleware fills `clientContext` automatically. Sensitive
handler logic must consume the verified server `context`, not a client claim.

## Portable layers composed with `.pipe(...)`

This is a separate API from yieldable `craftMiddleware`: the portable example
uses `serverLayer` and keeps its own program protocol. Its `.pipe(...)` chain
retains the layer semantics (including onion/after behavior); those semantics do
not apply to `craftMiddleware`.
See `users/portable-list.fn-serveur.ts`:

```ts
portableServerFunction('demo.users.portable-list', filterSchema, {
  exposure: 'client',
})
  .pipe(
    portableAudit, // + { auditId, startedAt }
    mapContext(({ input, context }) => ({
      // + { normalizedFilter, label }
      normalizedFilter: input.filter.trim().toLocaleLowerCase(),
      label: `${context.auditId}#${input.filter}`,
    })),
    flatMapContext(() => loadUserDirectory()), // + { directory, scanned }
  )
  .handler(async ({ context }) => ({
    auditId: context.auditId, // string, not unknown
    filter: context.normalizedFilter,
    scanned: context.scanned,
    users: context.directory.filter(/* … */),
  }));
```

Each step sees the context accumulated by the ones before it, and nothing else:

```txt
{}
  -> { auditId, startedAt }
  -> { auditId, startedAt, normalizedFilter, label }
  -> { auditId, startedAt, normalizedFilter, label, directory, scanned }
```

### The three shapes

| Shape            | For                                                    | Declared with                                                                                   |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `withXxx`        | a rule, a DI read, before/after hooks, a short circuit | `serverLayer(id, run)`, or `serverLayerReading<Context>()(id, run)` when it reads upstream keys |
| `mapContext`     | a pure, synchronous derivation                         | `mapContext(({ input, context }) => ({ key: … }))`                                              |
| `flatMapContext` | a derivation that must run a program                   | `flatMapContext(({ context }) => promise)`, plus a `chain` for any other protocol               |

A `withXxx` layer publishes its keys through `next`, and the return type is what
carries them:

```ts
export const portableAudit = serverLayer(
  'demo.portable-audit',
  async ({ next }) => {
    const auditId = crypto.randomUUID();
    try {
      return await next({ context: { auditId, startedAt: Date.now() } });
    } finally {
      // observes success and failure alike
    }
  },
);
```

`mapContext` and `flatMapContext` must return an **object of keys**: a lone
scalar carries no name for the next layer to read, and is refused by the types —
and, for JavaScript callers, at runtime with
`CRAFT_SERVER_LAYER_CONTEXT_PATCH_INVALID`. A layer that re-declares a key an
earlier layer produced is rejected at the `.pipe(...)` call site, with the
offending key named in the diagnostic.

`context` is not `clientContext`: the first is produced server-side by the chain
and trusted, the second is declared by the browser and must be confronted with
the session before use. Layers do not declare client-context schemas; that stays
a middleware concern.

### Which program, which tool

| Program                                   | Composition                                                    | Adapter                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| pure value                                | `mapContext`                                                   | none                                                                                               |
| Promise                                   | `.pipe(serverLayer(...))`, `flatMapContext`                    | the registry's `execute`, default Promise chain                                                    |
| `Task`, `TaskEither`, any custom protocol | same, plus a `chain` passed to `flatMapContext`                | `execute` runs it; add `ServerProgramSuccess<A>` to the type so its success channel stays readable |
| Effect                                    | `craftMiddleware(...).server(...)` or `effectServerMiddleware` | `executeEffect(layer)`                                                                             |

The core imports no Effect runtime, and never awaits a program whose protocol it
was not told about.

### `.pipe(...)` also takes contract pipes

The two forms are told apart by their contract, on the same builder:

```ts
portableServerFunction(/* … */)
  .pipe(requireServerPermission('users:read')) // a declaration the registry reads
  .pipe(portableAudit, mapContext(/* … */)) // layers, composed in order
  .handler(/* … */);
```

### Portable versus yieldable composition

`.use(...)` on `serverFunction` is the yieldable form documented above. Portable
functions compose their `serverLayer` chain with `.pipe(...)`; the old
`portableServerMiddleware(...)` constructor is not part of the new contract.

## Client context

What the browser knows and the server does not — a session id, a locale, a
selected workspace — travels in its own request channel:

```json
{
  "id": "demo.users.authenticated-list",
  "input": { "filter": "ada" },
  "context": {
    "userId": "user-ada",
    "requestedBy": "user-ada",
    "locale": "en"
  },
  "protocolVersion": 1
}
```

A request without `context` keeps working exactly as before: the field only
appears when the function declares it needs one.

Everything that fills it is a client middleware backed by a handshake.

**One handshake, one middleware** — `craftHandshakeMiddleware` implements a
handshake in a single declaration, and it reads like a service: `yield*` what you
need, return the fragment. Neither the name nor the schema is repeated — both
come from the handshake, so the two sides cannot say two different things.

```ts
// src/client/claimed-user.mw-client.ts
export const claimedUserContext = craftHandshakeMiddleware(
  claimedUserHandshake,
  function* () {
    return { userId: yield* ClaimedUserId() };
  },
);
```

`ClaimedUserId` is an ordinary abstract craft service
(`craftService({ providedIn: 'abstract' }, abstract<string>())`), provided by the
application in `app.config.ts`. There is no reactive mode: a generator runs when
the call is made. Making a DI read _re-run_ a loader would mean hidden tracking,
which Craft refuses — in Craft only `params()` is a tracked dependency, so
compose such a read into the caller's `params()` instead.

**A composed chain** — `src/client/request-context.mw-client.ts` publishes two
fields through two middleware, one depending on the other. Each field's shape is
a `craftHandshake` shared with the server (see below). `run` is a plain
craft generator, like a route guard, and it runs on the async craft pump, so a
bridge (the Effect adapter, for instance) can suspend inside it:

```ts
export const requestedByContext = craftMiddleware('demo.requested-by')
  .provides(requestedByHandshake)
  .client(function* () {
    const session = yield* ClientSession();
    return { requestedBy: session.userId };
  });

export const requestContext = craftMiddleware('demo.request-context')
  .pipe(requestedByContext)
  .provides(requestLocaleHandshake)
  .client(function* () {
    const session = yield* ClientSession();
    return { locale: session.locale };
  });
```

Both are attached on the client facade, and TypeScript checks there that
together they cover what the server function expects:

```ts
export const getAuthenticatedUsers = createServerFunctionClient<
  typeof ServerGetAuthenticatedUsers
>(authenticatedListHandshake).pipe(
  craftClientMiddleware(claimedUserContext, requestContext),
);
```

## Handshakes

A handshake is a name the two sides agree on, declared once and referenced from
both. `craftUnique` says _"this name appears exactly once"_, which is the wrong
predicate at a boundary: an id, or the shape of a client context, **must** appear
on both sides, because the two files cannot import each other. `craftHandshake`
says the opposite — _"this name has a counterpart"_ — and
`assertCraftHandshake(graph)` proves it.

```ts
// src/shared/claimed-user-id.ts — l'identité, nommée une seule fois
export const authenticatedListHandshake = craftHandshake(
  'demo.users.authenticated-list',
);

// src/shared/request-context.ts — une forme, un producteur, un consommateur
export const requestedByHandshake = craftHandshake(
  'demo.requested-by',
  Schema.toStandardSchemaV1(Schema.Struct({ requestedBy: Schema.String })),
);
```

Both sides then pass the same value:

```ts
serverFunction(authenticatedListHandshake, inputSchema, { … })      // .fn-serveur.ts
createServerFunctionClient<typeof ServerFn>(authenticatedListHandshake)  // .fn-client.ts
  .pipe(craftClientMiddleware(/* … */))
```

Two things follow. The id string exists **once** in the repository, so equality
between the two sides becomes a TypeScript check rather than something the graph
catches after the fact — the graph only has to prove both sides are reachable,
which is the cross-program case. And when a handshake carries a schema, the
server's `clientContext(...)` declaration and the client's `.provides(...)` share the _same_
schema: they can no longer drift.

Three global diagnostics: `CRAFT_HANDSHAKE_MISSING_COUNTERPART`,
`CRAFT_HANDSHAKE_NOT_STATIC`, `CRAFT_HANDSHAKE_DUPLICATE_NAME`. They answer
_"does this name have a counterpart somewhere?"_.

A fourth answers the only question that matters at the call site — _does **this**
server function receive what it expects?_ —
`CRAFT_SERVER_FUNCTION_HANDSHAKE_NOT_ATTACHED`: the server chain of a family
expects a handshake that the family's own facade attaches nothing for. A
handshake honoured at the other end of the repository, but missing from this
`.pipe(craftClientMiddleware(...))`, would still fail at runtime. Its mirror,
`CRAFT_SERVER_FUNCTION_HANDSHAKE_NOT_EXPECTED`, catches a value that would travel
and be dropped.

The `demo.users.list` family stays on `craftUnique(...)` on purpose, so both
spellings remain exercised.

The server never imports a `*.mw-client.ts` file — the architecture graph
forbids it. It only declares the _shape_ it expects, with
`clientContext(schema)` inside a middleware `.pipe(...)`, or
`{ clientContext: schema }` on the
function, and revalidates it on arrival. A missing or malformed context is
rejected with `CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID` (HTTP 400), which
is deliberately distinct from an invalid business input.

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
