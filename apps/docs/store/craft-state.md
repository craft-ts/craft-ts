# craftState

Creates a state definition for use within a craft store, enabling reactive state management with optional custom methods and computed values.

## Import

```typescript
import { craftState } from '@craft-ng/core';
```

## Introduction

`craftState` integrates a `state()` instance into a craft store by:

- Registering the state under a specific name in the store
- Automatically prefixing custom methods and computed values with the state name
- Providing type-safe access to state, methods, and computed properties
- Enabling reactive connections to sources, inputs, and other store states
- Supporting insertions for extended functionality

## Naming Convention

- The state is accessible as `store.stateName` (returns the Signal)
- Custom methods are prefixed: `store.stateNameMethodName`
- Computed values are prefixed: `store.stateNameComputedName`

## Use Cases

- **Local UI state**: Form values, filters, pagination, modal visibility
- **Derived state**: Computed values based on state changes
- **Coordinated state**: State that reacts to other states or sources
- **Encapsulated logic**: State with associated behavior methods

## Integration

- Access to other craft entries (sources, queries, mutations) via context
- React to sources using `on$()`
- Supports all `state()` insertion features (persistence, validation, etc.)

## Signature

```ts
function craftState<Context, StoreConfig, StateName, State, Insertions>(
  stateName: StateName,
  stateFactory: (
    context: CraftFactoryEntries<Context>,
  ) => StateOutput<State, Insertions>,
): CraftStateOutputs<Context, StoreConfig, StateName, State, Insertions>;
```

## Parameters

### `stateName`

The name under which this state will be registered in the store. Used as prefix for all methods and computed values.

### `stateFactory`

Factory function that receives the craft context and returns a `state()` instance.
Has access to all other craft entries (sources, queries, mutations, states) defined before it.

## Return Value

A craft factory utility that integrates the state into the store with:

- `store.stateName`: Signal returning the current state value
- `store.stateNameMethodName`: Prefixed custom methods from insertions
- `store.stateNameComputedName`: Prefixed computed signals from insertions

## Examples

### Basic state without methods

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('counter', () => state(0)),
);

const store = injectCraft();

console.log(store.counter()); // 0
store.counter.set(5);
console.log(store.counter()); // 5
```

### State with custom methods

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftState('todos', () =>
    state([] as Todo[], ({ state, set }) => ({
      add: (todo: Todo) => {
        set([...state(), todo]);
      },
      remove: (id: string) => {
        set(state().filter((t) => t.id !== id));
      },
      clear: () => {
        set([]);
      },
    })),
  ),
);

const store = injectCraft();

store.todosAdd({ id: '1', text: 'Buy milk', done: false });
store.todosAdd({ id: '2', text: 'Walk dog', done: false });
console.log(store.todos().length); // 2

store.todosRemove('1');
console.log(store.todos().length); // 1

store.todosClear();
console.log(store.todos().length); // 0
```

### State reacting to sources

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftSources({
    resetFilters: source$<void>(),
  }),
  craftState('filters', ({ resetFilters }) =>
    state(
      { search: '', category: 'all', priceRange: [0, 1000] },
      ({ state, set }) => ({
        setSearch: (search: string) => {
          set({ ...state(), search });
        },
        setCategory: (category: string) => {
          set({ ...state(), category });
        },
        reset: on$(resetFilters, () => {
          set({ search: '', category: 'all', priceRange: [0, 1000] });
        }),
      }),
    ),
  ),
);

const store = injectCraft();

store.filtersSetSearch('laptop');
store.filtersSetCategory('electronics');
console.log(store.filters()); // { search: 'laptop', category: 'electronics', ... }

store.setResetFilters();
console.log(store.filters()); // { search: '', category: 'all', ... }
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
