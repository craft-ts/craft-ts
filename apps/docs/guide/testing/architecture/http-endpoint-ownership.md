# Unique HTTP endpoint ownership

`assertHttpEndpointUnique` treats an HTTP endpoint as the pair of its method and
URL. It fails when two graph sites call the same pair:

<<< @/tests/snippets/guide/testing/architecture/http-endpoint-ownership.spec.ts#example

## What it prevents

Two services can independently implement this:

```typescript
CraftHttpClient.get(({ response }) => ({
  url: 'users',
  success: response<User[]>(),
}));
```

The application still compiles, but there are now two owners for `GET users`.
One may add pagination, the other may keep an old response shape. A bug fix in
one call site does not reach the other.

The rule forces a single boundary service to own `GET users`. Other services
depend on that service and can derive feature-specific views without creating a
second transport contract.

## What counts as distinct

These are separate endpoints and are allowed:

```text
GET  users
POST users
GET  orders
```

The rule is intentionally narrower than “one URL in the whole app”: a read and
a write are different contracts.

## Why this is graph-wide

ESLint can flag a local HTTP style mistake. It cannot see that a second feature
has claimed an endpoint already owned elsewhere. The graph can inspect every
call site in one assertion.

## See also

- [Browser boundaries](/guide/testing/browser-boundaries)
- [Architecture rules](/guide/testing/architecture)
