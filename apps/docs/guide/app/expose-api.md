# Shaping a service's public API

A service returns whatever should be public. These are the ways to consume less
than everything a dependency exposes — which keeps the dependency graph precise,
and therefore keeps inference and test registers small.

## Single Property Shortcut

When only one public property is needed, `X.property()` is a shortcut for
a one-property derivation.

```typescript
const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => Promise.resolve(user),
    getUsers: () => Promise.resolve([]),
  }),
);

const { UserUpdater } = craftService(
  { name: 'UserUpdater', scope: 'global' },
  function* () {
    const updateUser = yield* UsersApi.updateUser();

    return {
      rename: (user: { id: string; name: string }, name: string) =>
        updateUser({ ...user, name }),
    };
  },
);
```

For method properties on services without public inputs, the shortcut can call
the method directly:

```typescript
return yield * UsersApi.updateUser({ id: '1', name: 'Romain' });
```

The shortcut accepts the same bindings as `X(...)`:

```typescript
const increment = yield * Counter.increment({ initialValue: 0 });
```

Use the full `X(bindings, expose)` form when deriving several
properties, creating aliases, exposing `$self`, using symbol keys, or when a
service property collides with a native function property such as `name`.

## Property Shortcut

The same shortcut notation is available on the generated `X` helper. Use it
inside a craft generator when only one property is needed:

```typescript
const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global' },
  () => ({
    updateUser: (user: { id: string; name: string }) => {},
    currentUser: signal<{ id: string } | null>(null),
  }),
);

const { CurrentUser } = craftService(
  { name: 'CurrentUser', scope: 'global' },
  function* () {
    return yield* UsersApi.currentUser();
  },
);
```

The result carries the same dependency tracking as `yield* UsersApi()`, so
testing utilities see exactly which property was accessed.

For method properties on services without public inputs, the shortcut calls the
method directly:

```typescript
const update = yield * UsersApi.updateUser({ id: '1', name: 'New' });
```

## Nested Property Shortcuts

When only a sub-property of a service output is needed, add a second `.property`
before calling:

```typescript
const { SearchApi } = craftService(
  { name: 'SearchApi', scope: 'global' },
  () => ({
    usersQuery: {
      isLoading: signal(false),
      data: signal<string[]>([]),
    },
  }),
);

const { SearchFacade } = craftService(
  { name: 'SearchFacade', scope: 'global' },
  function* () {
    const isLoading = yield* SearchApi.usersQuery.isLoading();
    return { isLoading };
  },
);
```

The dependency graph records only the accessed nested property
(`derivedPropertiesUsed: { usersQuery: { isLoading: ... } }`), not the full
`usersQuery` object. Testing utilities therefore only require the used
sub-property in mock objects.

The result of `yield* X.parent.child()` carries the same tracked dependency
metadata, so `ExtractDeps` correctly surfaces the service dependency.

## OmitInputs

When a service has public inputs, the no-arg form of a property shortcut is
intentionally disabled at the type level, because calling without bindings would
silently use default values and mask a missing dependency:

```typescript
const { Counter } = craftService(
  { name: 'Counter', scope: 'function' },
  (inputs: { initialValue?: MaybeSignal<number> }) => ({
    count: toValue(inputs.initialValue) ?? 0,
  }),
);

// Fine — bindings are explicit
const count = yield * Counter.count({ initialValue: signal(5) });

// Type error — no-arg call is forbidden when inputs exist
// Counter.count();
```

Use `X.OmitInputs.property()` to
explicitly opt out of input bindings and use the defaults:

```typescript
const count = yield * Counter.OmitInputs.count();
const count2 = yield * Counter.OmitInputs.count();
```

`OmitInputs` is purely a type-level gate — at runtime it is transparent.

`OmitInputs` composes with nested shortcuts:

```typescript
const isLoading = yield * Counter.OmitInputs.userQuery.isLoading();
```

## Partial Exposure

`yield* X()` can expose only the part of a dependency that should remain public.

```typescript
const { Counter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const { counter } = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      decrement: () => update((value) => value - 1),
    }));
    return counter;
  },
);

const { CounterExtended, provideCounterExtended } = craftService(
  { name: 'CounterExtended', scope: 'toProvide' },
  function* () {
    return yield* Counter(undefined, ({ $self, increment }) => ({
      $self,
      incrementCounter: increment,
    }));
  },
);
```

This keeps the dependency graph precise, which is important for both type inference and testing.

## See Also

- [craftService](/guide/app/craft-service)
- [Testing services](/guide/testing/services)
