# Shaping a service's public API

A service exposes every named primitive it yields (see
[craftService](/guide/app/craft-service#what-a-service-exposes)); what should
stay internal is wrapped in `craftPrivate(...)`. These are the ways to consume
less than everything a dependency exposes — which keeps the dependency graph precise,
and therefore keeps inference and test registers small.

## Single Property Shortcut

When only one public property is needed, `X.property()` is a shortcut for
a one-property derivation.

<<< @/tests/snippets/guide/app/expose-api/example-1.spec.ts#example-1


For method properties on services without public inputs, the shortcut can call
the method directly:

```typescript
return yield * UsersApi.updateUser({ id: '1', name: 'Romain' });
```

The shortcut accepts the same bindings as `X(...)`:

```typescript
const increment = yield* Counter.increment({ initialValue: startAt });
```

Use the full `X(bindings, expose)` form when deriving several
properties, creating aliases, exposing `$self`, using symbol keys, or when a
service property collides with a native function property such as `name`.

## Property Shortcut

The same shortcut notation is available on the generated `X` helper. Use it
inside a craft generator when only one property is needed:

<<< @/tests/snippets/guide/app/expose-api/current-user.spec.ts#current-user



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

<<< @/tests/snippets/guide/app/expose-api/search-facade.spec.ts#search-facade



A shortcut hands back the member it designates, and a reactive member (a
`state`, a `craftComputed`, a query's `status`…) is **read**: `yield*
SearchApi.usersQuery.isLoading()` is the loading flag itself, not a reader to
call a second time. Yielded on its own, as above, the member is also exposed by
the consumer under its own name (`isLoading`). Objects and methods are returned
as they are; a method is called, with or without arguments.

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

<<< @/tests/snippets/guide/app/expose-api/omit-inputs.spec.ts#omit-inputs

```typescript
// Fine — bindings are explicit
const count = yield* Counter.count({ initialValue: startAt });

// Type error — no-arg call is forbidden when inputs exist
// Counter.count();
```

Use `X.OmitInputs.property()` to
explicitly opt out of input bindings and use the defaults:

```typescript
const count = yield* Counter.OmitInputs.count();
const count2 = yield* Counter.OmitInputs.count();
```

`OmitInputs` is purely a type-level gate — at runtime it is transparent.

`OmitInputs` composes with nested shortcuts:

```typescript
const isLoading = yield* Counter.OmitInputs.userQuery.isLoading();
```

## Partial Exposure

`yield* X()` can expose only the part of a dependency that should remain public.

<<< @/tests/snippets/guide/app/expose-api/example-10.spec.ts#example-10


This keeps the dependency graph precise, which is important for both type inference and testing.

When a service factory wants one member as part of its own API, yield the
property shortcut directly. When it wants the full service, yield the service
directly. Both forms expose under the natural lower-camel-case key:

```typescript
function* () {
  yield* I18n.translate(); // exposes `translate`
  yield* ClientCurrency(); // exposes `clientCurrency`
}
```

Use `craftExpose('label', value)` when the public key differs from the source
name or when exposing a value that is not a service dependency. The
`craft-ts/prefer-direct-craft-service-exposure` rule flags same-name wrappers.

## See Also

- [craftService](/guide/app/craft-service)
- [Testing services](/guide/testing/services)
