# Resource params should prefer URL-backed state

`assertResourceParamsPreferQueryParams` rejects `query` and `asyncProcess`
params that depend on a local `state`. Filters, pagination and search values
usually belong in `queryParams`, so a reload or a shared URL keeps the same
view:

<<< @/tests/snippets/guide/testing/architecture/resource-params-query-state.spec.ts#example

## What it prevents

This shape loses the active filters on reload:

```typescript
const search = yield* state('search', '');
const page = yield* state('page', 1);

const params = craftComputed('usersParams', function* () {
  return { search: yield* search(), page: yield* page() };
});

const users = yield* query('users', {
  params,
  loader: loadUsers,
});
```

The architecture graph follows the complete params path, including computed
values and dependencies declared in other files. It does not inspect state
used only by a loader, insertion or unrelated UI code.

## The URL-backed version

```typescript
const filters = yield* queryParams('filters', {
  state: {
    search: { fallbackValue: '', codec: stringCodec },
    page: { fallbackValue: 1, codec: numberCodec },
  },
});

const users = yield* query('users', {
  params: filters,
  loader: loadUsers,
});
```

## Intentional exceptions

Some state values are not navigation state. For example, a process-wide locale
may affect a query without belonging in the route. Whitelist that state with a
name and, when necessary, a relative file path:

```typescript
assertResourceParamsPreferQueryParams(graph.graph, {
  allow: [
    {
      name: 'locale',
      file: 'src/app/examples/effect/effect-i18n.ts',
    },
  ],
});
```

Keep the allowlist narrow and document the reason beside the architecture test.

## See also

- [Query params](/guide/state/url-state)
- [Architecture rules](/guide/testing/architecture)
- [ESLint rules](/guide/routing/eslint-rules)
