# Abstract services

An `abstract` service declares a **contract** with no implementation, and forces
a concrete one to be supplied downstream. This is what makes a service's
implementation a decision of the mounting site — a route, a feature config, a
test — instead of a hard import.

## Abstract Requirements

Use `providedIn: 'abstract'` to declare a contract that must be implemented elsewhere.

<<< @/tests/snippets/guide/app/abstract-services/example-1.spec.ts#example-1

Concrete services can then depend on `CounterRequirement`.

## Abstract Providers

An `abstract` service also exposes a `provideX(factory)` helper. It takes a **factory** — a plain
function or a generator — produces a value matching the contract, and binds it to the requirement
token. This lets you implement the contract **inline at the providing site** (a route, a component,
a feature config) instead of declaring a separate concrete `craftService`.

```typescript
import { abstract, craftService } from '@craft-ts/core';

type User = { name: string };

const { User, provideUser } = craftService(
  { name: 'User', providedIn: 'abstract' },
  abstract<User>(),
);

// Implement the contract inline:
const providers = [provideUser(() => ({ name: 'Ada' }))];

// Anywhere downstream, inside a craft generator:
const user = yield * User();
```

The factory can be a **generator** that yields other services. Everything it yields is tracked, so
the resulting provider participates in the cascade DI check just like a regular service:

```typescript
const { Greeting } = craftService(
  { name: 'Greeting', providedIn: 'global' },
  () => ({ prefix: 'Hello' }),
);

const providers = [
  provideUser(function* () {
    const greeting = yield* Greeting();
    return { name: `${greeting.prefix} Ada` };
  }),
];
```

This is the foundation of route-scoped providers: a route can implement an abstract contract from
its own guarded data / params. See
[Type-safe DI/Routes → Route Providers](/guide/routing/route-providers).

## See Also

- [Service scopes](/guide/app/service-scopes)
- [Route providers](/guide/routing/route-providers)
