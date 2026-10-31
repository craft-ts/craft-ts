# Query params belong to their route

<<< @/tests/snippets/guide/testing/architecture/query-params-route-ownership.spec.ts#example

`assertQueryParamsRouteOwnership` keeps URL-backed state within the route that
owns the URL. It accepts two forms: declare `queryParams` directly on the route,
or declare it in a `scope: 'toProvide'` service that the route provides. The
service may be mounted with `providers` or `.withProviders(...)`.

## Before — global or component-local URL state

This service can outlive the route whose URL it reads:

```typescript
const { SearchFilters } = craftService(
  { name: 'SearchFilters', scope: 'global' },
  function* () {
    return yield* queryParams('filters', {
      state: { page: { fallbackValue: 1, codec: numberCodec } },
    });
  },
);
```

A `queryParams` primitive created in a component setup has the same ownership
problem: its lifetime follows the component rather than the route.

## After — declare it on the route

```typescript
craftRoute('search', {
  // ...
  queryParams: function* () {
    return yield* queryParams('filters', {
      state: { page: { fallbackValue: 1, codec: numberCodec } },
    });
  },
});
```

## After — use a route-provided service

```typescript
const { SearchFilters, provideSearchFilters } = craftService(
  { name: 'SearchFilters', scope: 'toProvide' },
  function* () {
    return yield* queryParams('filters', {
      state: { page: { fallbackValue: 1, codec: numberCodec } },
    });
  },
);

craftRoute('search', {
  // ...
  providers: [provideSearchFilters()],
});
```

The route may provide the service through its builder callback as well:

```typescript
craftRoute('search', {
  // ...
}).withProviders(() => [provideSearchFilters()]);
```

When the route declares `queryParams` itself, `.withProviders(...)` can pass
that route-owned state into a service provider:

```typescript
craftRoute('search', {
  // ...
  queryParams: function* () {
    return yield* queryParams('filters', {
      state: { page: { fallbackValue: 1, codec: numberCodec } },
    });
  },
}).withProviders(({ QueryParams }) => [
  provideSearchFilters(function* () {
    return yield* QueryParams();
  }),
]);
```

That keeps both the URL state and its configured service at the route boundary.

## Intentional exceptions

Pass a narrow allow list entry to the assertion for exceptional URL state that
is intentionally shared outside one route:

```typescript
assertQueryParamsRouteOwnership(graph.graph, {
  allow: [{ name: 'locale', file: 'src/app/locale.ts' }],
});
```

Entries match the primitive's declared name and may include a relative source
file to limit the exception further.

## Why this is a graph rule

The declaration may be in one file and its provider in a route file. The graph
checks the `provides` relationship, including `.withProviders(...)`, so the
assertion proves the actual route ownership rather than just the service's
local syntax.
