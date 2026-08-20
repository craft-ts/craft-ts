# No dependency cycles

`assertNoDependencyCycles` checks directed `depends-on` edges between services,
components and computeds:

<<< @/tests/snippets/guide/testing/architecture/dependency-cycles.spec.ts#example

## What it prevents

The obvious cycle is two services that construct each other:

```text
Left → Right → Left
```

In source, it often appears as a harmless pair of `yield*` calls. At runtime it
can fail as a recursive construction, an incomplete service or a provider that
only breaks when a route is first visited.

The rule also catches a self-dependency and cycles involving computed values.

## Shared dependencies are not cycles

This is valid:

```text
AdminPage  → Auth
Checkout   → Auth
```

Both branches depend on a shared kernel; there is no path back from `Auth` to
either branch. `provides`, `contains`, `loads` and `renders` are structural
edges and are not treated as dependency cycles.

## How to break a real cycle

Usually one side should depend on a smaller contract:

- extract a read-only service from the two large services;
- move shared policy into a third service;
- pass a value as an input instead of resolving the owning service;
- move a derived value into the consumer instead of publishing it back.

Do not silence a cycle by adding an `allow` list: this assertion has no such
escape hatch because a cycle changes construction semantics.

## See also

- [Service scopes](/guide/app/service-scopes)
- [Composing services](/learn/04-compose)
