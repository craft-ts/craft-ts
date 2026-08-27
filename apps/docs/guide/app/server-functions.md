# Public and protected server functions

`serverFunction` is a transport contract. Authentication and authorization are
middleware concerns: do not add an `access: 'admin'` option or a parallel
`protectedServerFunction` helper.

## The canonical path

```text
client middleware
  → handshake / client context
  → existing server middleware
  → verified session and role
  → server-function handler
  → Effect service and Layer
```

The browser may announce an identifier through `clientContext`, but that value
is untrusted. The server must load the session again and compare the claim with
the verified identity. A missing, expired or revoked session must stop the
middleware chain before the handler runs.

## Transport failures

Every client-side server-function transport failure is returned as a typed
`HttpError`, including a lost connection, an aborted request, an unavailable
`fetch` implementation or an unreadable response. Network failures use
`status: 0` and `statusText: 'Unknown Error'`, following the same convention as
`CraftHttpClient`; the original failure is available in the error payload's
`body` field.

This means callers can handle connection loss through the normal Craft
exception path instead of adding a raw Promise rejection handler:

```ts
const result = yield * getAnimals({});
if (isCraftException(result) && result._tag === 'HttpError') {
  // show a retry action or an offline state
}
```

The same normalization is applied to custom transports registered with
`provideServerFunctionTransport(...)`. Business failures returned by the
server keep their own typed tags and are not converted to `HttpError`.

## Public function

```ts
export const listPublicAnimals = serverFunction(
  'animals.public-list',
  inputSchema,
  { exposure: 'client', output: outputSchema },
).handler(({ input }) =>
  Effect.gen(function* () {
    const repository = yield* AnimalRepository;
    return yield* repository.list(input.filter);
  }),
);
```

## Protected function

Reuse the same middleware mechanism for the protected path:

```ts
export const listAdminAnimals = serverFunction(
  'animals.admin-list',
  inputSchema,
  { exposure: 'client', output: outputSchema },
)
  .use(requireAdminSession)
  .handler(({ input }) =>
    Effect.gen(function* () {
      const repository = yield* AnimalRepository;
      return yield* repository.listForAdmin(input.filter);
    }),
  );
```

`requireAdminSession` is a `craftMiddleware(...).server(...)` value. It should
return an explicit authentication/authorization failure when there is no valid
session or the role is insufficient. The handler is then only responsible for
the business operation.

For middleware shared by many functions, the optional
`createServerFunctionFactory([middleware])` factory applies those existing
`.use(...)` calls in order; it does not introduce a new security policy API.

See the executable public/protected example in
[`apps/demo-with-server-function`](https://github.com/craft-ts/craft-ts/tree/main/apps/demo-with-server-function),
especially `craftMiddleware`, `clientContext`, `craftHandshake` and `.use(...)`.
Its server tests cover no session, a valid session and revocation. Keep the
server test beside the function so the middleware wiring remains visible.
The demo maps the two session failures to explicit 401 responses and maps a
non-admin session to a 403 response.

## Find the pieces

- [`serverFunction`](/learn-effect/09-server-functions)
- [`craftMiddleware`](/learn-effect/09-server-functions#middleware-and-security)
- [`clientContext`](/learn-effect/09-server-functions#middleware-and-security)
- [`craftHandshake`](/learn-effect/09-server-functions#middleware-and-security)
- [Effect Layers and requirements](/learn-effect/06-layers-routing)

Useful search terms are `auth`, `authentication`, `authorization`, `session`,
`role`, `access policy` and `middleware`.
