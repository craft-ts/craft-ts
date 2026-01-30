# craftMutations

Creates mutation definitions for use within a craft store, enabling reactive management of server-side data modifications.

## Import

```typescript
import { craftMutations } from '@ng-angular-stack/craft';
```

## Introduction

`craftMutations` integrates multiple `mutation()` instances into a craft store by:

- Registering mutations as a group with automatic state tracking
- Generating prefixed `mutate` methods for each mutation (e.g., `mutateMutationName`)
- Exposing mutation state signals (value, status, error, isLoading)
- Enabling queries to react to mutation changes via `insertReactOnMutation()`
- Supporting both method-based and source-based mutation triggering
- Managing mutations with identifiers for parallel execution

## Naming Convention

- Mutations are accessible as: `store.mutationName`
- Trigger methods are prefixed: `store.mutateMutationName(args)`
- Source-based mutations (bound to sources) do not expose `mutate` methods

## Use Cases

- **Data modification**: Create, update, delete operations on server data
- **Optimistic updates**: Update UI immediately while mutation executes
- **Cache invalidation**: Trigger query reloads after mutations complete
- **Batch operations**: Execute multiple mutations with individual state tracking
- **Form submissions**: Handle form data submission with loading/error states

## Context Access

- Sources: Bind mutations to sources for automatic execution
- Queries: Access query state for conditional mutation logic
- Other mutations: Coordinate between multiple mutations
- Injections: Access Angular services and dependencies

## Integration with Queries

- Queries can react to mutations via `insertReactOnMutation()`
- Supports optimistic updates, patches, full updates, and reloads
- Filtered reactions based on mutation identifiers

## Store Integration

- Mutation state accessible as: `store.mutationName.value()`, `store.mutationName.status()`
- Trigger mutations: `store.mutateMutationName(args)`
- With identifier: `store.mutationName.select(id)` for individual instances
- Other craft entries can access mutations for coordination

## Signature

```ts
function craftMutations<Context, StoreConfig, Mutations>(
  mutationsFactory: (context: CraftFactoryEntries<Context>) => Mutations,
): CraftMutationsOutputs<Context, StoreConfig, Mutations>;
```

## Parameters

### `mutationsFactory`

Factory function that receives the craft context and returns a record of mutations.
Has access to all other craft entries (sources, queries, inputs, injections) defined before it.

## Return Value

A craft factory utility that integrates mutations into the store with:

- `store.mutationName`: Mutation state and signals
- `store.mutateMutationName(args)`: Method to trigger the mutation (for method-based mutations)
- Full type safety for mutation parameters and results

## Examples

### Basic mutations for CRUD operations

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftMutations(() => ({
    createTodo: mutation({
      method: (data: { text: string }) => data,
      loader: async ({ params }) => {
        const response = await fetch('/api/todos', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

store.mutateCreateTodo({ text: 'Buy milk' });
console.log(store.createTodo.status());
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
