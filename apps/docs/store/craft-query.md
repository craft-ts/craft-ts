# craftQuery

Creates a query definition for use within a craft store, enabling reactive data fetching with automatic state management.

## Import

```typescript
import { craftQuery } from '@ng-craft/core';
```

## Introduction

`craftQuery` integrates a `query()` instance into a craft store by:

- Registering the query under a specific name in the store
- Providing automatic execution when params change
- Exposing query state signals (value, status, error, isLoading)
- Enabling reactive connections to mutations, sources, and other store entries
- Supporting insertions for extended functionality (optimistic updates, persistence, etc.)
- Providing type-safe access to query results and methods

## Use Cases

- **Server state management**: Fetch and cache data from APIs
- **Automatic refetching**: Re-fetch when params change reactively
- **Optimistic updates**: Update UI instantly while mutations execute
- **Cache synchronization**: Keep local cache in sync after mutations
- **Data persistence**: Cache query results across sessions
- **Loading states**: Track and display loading/error states automatically

## Context Access

- Sources: React to user events and triggers
- Mutations: Coordinate with mutation state and results
- Other queries: Derive data from other queries
- Injections: Access Angular services and dependencies
- INSERT_CONFIG: Store name and query key for insertions

## Reactive Patterns

- Use `insertReactOnMutation()` to synchronize with mutation results
- Bind to sources for manual refetch triggers
- Use identifiers for parallel query execution
- Combine with `preservePreviousValue` to prevent flickering

## Store Integration

- Query accessible as: `store.queryName`
- Returns signals: `store.queryName.value()`, `store.queryName.status()`
- With identifier: `store.queryName.select(id)` for individual instances
- Custom insertions add methods: `store.queryName.customMethod()`

## Signature

```ts
function craftQuery<
  Context,
  StoreConfig,
  ResourceName,
  ResourceState,
  ResourceParams,
  ResourceArgsParams,
  InsertionsOutputs,
  IsMethod,
  SourceParams,
  GroupIdentifier,
>(
  resourceName: ResourceName,
  queryFactory: (
    context: ContextQueryEntries<Context, StoreConfig, ResourceName>,
  ) => QueryOutput<
    ResourceState,
    ResourceArgsParams,
    ResourceParams,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
  >,
): CraftQueryOutputs<
  Context,
  StoreConfig,
  ResourceName,
  ResourceState,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs
>;
```

## Parameters

### `resourceName`

The name under which this query will be registered in the store. Used to access the query: `store.resourceName`.

### `queryFactory`

Factory function that receives the craft context and returns a `query()` instance.
Has access to all other craft entries (sources, mutations, queries, states) defined before it.

## Return Value

A craft factory utility that integrates the query into the store with:

- `store.queryName`: The query instance with all its signals and methods
- Full type safety for query state and operations

## Examples

### Basic query with automatic execution

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQuery('currentUser', () =>
    query({
      params: () => currentUserId(),
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params}`);
        return response.json();
      },
    }),
  ),
);

const store = injectCraft();

console.log(store.currentUser.status());
console.log(store.currentUser.value());
```

## Craft Utilities

Links to all craft utilities implemented in `libs/core/src/lib`:

- [craft](./craft.md)
- [craftState](./craft-state.md)
- [craftSources](./craft-sources.md)
- [craftInputs](./craft-inputs.md)
- [craftComputedStates](./craft-computed.md)
- [craftAsyncMethods](./craft-async-method.md)
- [craftQuery](./craft-query.md)
- [craftQueryParam](./craft-query-param.md)
- [craftQueryParams](./craft-query-params.md)
- [craftMutations](./craft-mutation.md)
- [craftSetAllQueriesParamsStandalone](./craft-set-all-queries-params-standalone.md)
- [craftInject](./craft-inject.md)
