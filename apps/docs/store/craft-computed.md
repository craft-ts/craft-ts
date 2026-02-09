# craftComputedStates

Creates computed signals derived from other craft store entries (queries, mutations, states).

## Import

```typescript
import { craftComputedStates } from '@ng-angular-stack/craft';
```

## Introduction

`craftComputedStates` enables reactive derived values in craft stores by:

- Creating computed signals that automatically update when dependencies change
- Deriving values from queries, mutations, states, and other computed signals
- Exposing computed values directly on the store (no prefix)
- Providing full type safety for computed values
- Enabling complex transformations and combinations of store data
- Supporting memo-ization for performance optimization

## Naming Convention

- Computed signals are accessible directly: `store.computedName()`
- No prefix added (unlike queries/mutations)

## Use Cases

- **Derived data**: Calculate totals, counts, filtered lists
- **Data transformation**: Format or reshape data from queries
- **Aggregation**: Combine data from multiple queries or states
- **Status derivation**: Compute loading states from multiple queries
- **Validation**: Derive validation status from form states
- **UI state**: Calculate UI flags based on multiple conditions

## Context Access

- Computed factory receives full access to the craft context
- Can access queries, mutations, states, sources, and other computed values
- Context entries are accessed as signals: `context.queryName()`, `context.stateName()`

## Reactive Behavior

- Computed signals automatically update when dependencies change
- Only recompute when accessed and dependencies have changed (memo-ized)
- Follow Angular's computed signal semantics
- Can be used in templates and effects like any signal

## Performance

- Computed values are cached and only recompute when necessary
- Multiple accesses without dependency changes do not trigger recomputation

## Signature

```ts
function craftComputedStates<Context, StoreConfig, Computed>(
  computedFactory: (context: CraftFactoryEntries<Context>) => Computed,
): CraftComputedStatesOutputs<Context, StoreConfig, Computed>;
```

## Parameters

### `computedFactory`

Factory function that receives the craft context and returns a record of computed signals.
Has access to all other craft entries (queries, mutations, states) defined before it.

## Return Value

A craft factory utility that:

- Creates computed signals based on store data
- Exposes them directly on the store
- Provides full type safety for computed values

## Examples

### Basic computed values from state

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('count', () => state(0)),
  craftComputedStates(({ count }) => ({
    doubled: computed(() => count() * 2),
    isEven: computed(() => count() % 2 === 0),
    message: computed(() => `Count is ${count()}`),
  })),
);

const store = injectCraft();

console.log(store.doubled()); // 0
store.setCount(5);
console.log(store.doubled()); // 10
```

## Craft Utilities

Links to all craft utilities implemented in `libs/core/src/lib`:

- [craft](./craft.md)
- [craftState](./craft-state.md)
- [craftSources](./craft-sources.md)
- [craftInputs](./craft-inputs.md)
- [craftComputedStates](./craft-computed.md)
- [craftAsyncProcesses](./craft-async-processed.md)
- [craftQuery](./craft-query.md)
- [craftQueryParam](./craft-query-param.md)
- [craftQueryParams](./craft-query-params.md)
- [craftMutations](./craft-mutation.md)
- [craftSetAllQueriesParamsStandalone](./craft-set-all-queries-params-standalone.md)
- [craftInject](./craft-inject.md)
