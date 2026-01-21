# craftSources

Creates source definitions for use within a craft store, enabling reactive signal-source-driven communication.

## Import

```typescript
import { craftSources } from '@ng-craft/core';
```

## Introduction

`craftSources` integrates `source()` instances into a craft store by:

- Registering multiple sources with their names as keys
- Automatically generating setter methods with `set` prefix for each source
- Providing type-safe access to sources and their setter methods
- Enabling reactive patterns where states and queries can react to source emissions
- Exposing standalone setter methods that can be called outside injection context

## Naming Convention

- Sources are accessible via context: `context.sourceName`
- Setter methods are prefixed: `store.setSourceName(payload)`
- Standalone methods: Available directly from craft return: `setSourceName(payload)`

## Use Cases

- **Event broadcasting**: Trigger actions across multiple parts of the store
- **User interactions**: Button clicks, form submissions, navigation events
- **Lifecycle events**: Component mount/unmount, route changes
- **Cross-component communication**: Coordinate behavior without tight coupling
- **Reset mechanisms**: Trigger state resets or data refreshes

## Reactive Patterns

- States can react to sources using `afterRecomputation()`
- Mutations can be bound to sources for automatic execution
- Multiple consumers can react to the same source emission

## Standalone Methods

- Setter methods can be called outside Angular's injection context
- Useful for event handlers, callbacks, or external integrations
- No need to inject the store to trigger source emissions

## Signature

```ts
function craftSources<Context, StoreConfig, Sources>(
  sources: Sources,
): CraftSourcesOutputs<Context, StoreConfig, Sources>;
```

## Parameters

### `sources`

Object mapping source names to `Source` instances. Each source can emit values of a specific type.

## Return Value

A craft factory utility that:

- Makes sources accessible in context for other craft entries
- Adds prefixed setter methods to the store: `store.setSourceName(payload)`
- Exposes standalone setter functions: `setSourceName(payload)` (can be called outside injection context)

## Examples

### Basic sources with state reactions

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftSources({
    increment: source<void>(),
    decrement: source<void>(),
    reset: source<number>(),
  }),
  craftState('count', ({ increment, decrement, reset }) =>
    state(0, ({ state, set }) => ({
      increment: afterRecomputation(increment, () => set(state() + 1)),
      decrement: afterRecomputation(decrement, () => set(state() - 1)),
      reset: afterRecomputation(reset, (value) => set(value)),
    })),
  ),
);

const store = injectCraft();

store.setIncrement();
store.setReset(10);
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
