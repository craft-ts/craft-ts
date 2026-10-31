# Unique runtime entity names

<<< @/tests/snippets/guide/testing/architecture/runtime-entity-names.spec.ts#example

`assertRuntimeEntityNamesUnique` requires every Craft service and every
primitive to have a distinct name across the application graph. The check
compares the names as written, across kinds: a `query`, a `state`, an
`asyncProcess`, and a `craftService` cannot reuse the same name.

## Before: two entities named `User`

```typescript
const user = yield* query('User', {
  loader: loadUser,
});

const selectedUser = yield* state('User', {
  initialValue: null,
});
```

This fails even though the entities have different primitive kinds. A replay
or restore mechanism needs a stable way to address one runtime entity without
guessing whether `User` means the query or the state.

## After: give each entity its own name

```typescript
const user = yield* query('currentUserQuery', {
  loader: loadUser,
});

const selectedUser = yield* state('selectedUserState', {
  initialValue: null,
});
```

Use distinct descriptive names for services and all primitives. The rule
reports the duplicated name and each source location; choose and apply the new
names manually because only the application author knows which identity other
systems may already rely on. There is no automatic fix.

## Why names are project-wide

Replay, snapshots, breakpoints, and dependency overrides can use the name as a
stable handle for a runtime entity. That makes it possible for a restore setup
to select a specific service or primitive and substitute a dependency before
resuming. For example, a replay can replace the dependency that supplies a
user's permissions so a product-manager flow can be resumed consistently,
even if the currently connected user would otherwise receive admin
permissions. The unique name identifies the entity to override; the replay and
dependency override mechanisms perform the restoration and substitution.

The declarative architecture baseline runs this check for the whole graph:

```typescript
assertDeclarativeArchitecture(graph.graph);
```

See [the architecture baseline](/guide/testing/architecture/declarative-baseline)
and the [built-in helper list](/guide/testing/architecture#built-in-helpers).
