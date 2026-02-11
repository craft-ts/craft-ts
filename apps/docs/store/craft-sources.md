# craftSources

Creates source definitions for use within a craft store, enabling reactive signal-source-driven communication.

## Import

```typescript
import { craftSources } from '@ng-angular-stack/craft';
```

## Introduction

`craftSources` integrates `source()` instances into a craft store by:

- Registering multiple sources with their names as keys
- Automatically generating setter methods with `set` prefix for each source
- Providing type-safe access to sources and their setter methods
- Enabling reactive patterns where states and queries can react to source emissions

## Supported Source Types

`craftSources` supports three types of sources, each with its own method prefix:

### SignalSource

- **Type**: `SignalSource<T>`
- **Usage**: `store.setSourceName(payload)`

### Source$

- **Type**: `Source$<T>`
- **Usage**: `store.emitSourceName(payload)`

### Observable (Subject)

- **Type**: Any Observable-like object with a `next` method (e.g., `Subject`)
- **Usage**: `store.nextSourceName(payload)`

## Naming Convention

- Sources are accessible via context: `context.sourceName`
- Setter methods are automatically prefixed based on the source type:
  - **SignalSource**: `set` prefix → `store.setSourceName(payload)`
  - **Source$**: `emit` prefix → `store.emitSourceName(payload)`
  - **Observable (Subject)**: `next` prefix → `store.nextSourceName(payload)`

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

## Signature

```ts
function craftSources<Context, StoreConfig, Sources>(
  sources: Sources,
): CraftSourcesOutputs<Context, StoreConfig, Sources>;
```

## Parameters

### `sourcesFactory`

A factory function that returns an object mapping source names to Source instances. Each source can be a `SignalSource`, `Source$`, or any Observable-like object. The factory enables sources to be created within Angular's injection context.

## Return Value

A craft factory utility that:

- Makes sources accessible in context for other craft entries via `context.sourceName`
- Adds prefixed setter methods to the store based on source type:
  - `store.setSourceName(payload)` for SignalSource
  - `store.emitSourceName(payload)` for Source$
  - `store.nextSourceName(payload)` for Observable

## Examples

### Basic sources setup

```ts
const { injectCraft } = craft(
  { name: 'MyStore', providedIn: 'root' },
  craftSources(() => ({
    // SignalSource - uses 'set' prefix
    userAction: signalSource<string>(),

    // Source$ - uses 'emit' prefix
    refresh: source$<void>(),
    updateData: source$<number>(),

    // Observable (Subject) - uses 'next' prefix
    userInput: new Subject<string>(),
  })),
);

const store = injectCraft();

// Use setter methods based on source type
store.setUserAction('clicked'); // SignalSource
store.emitRefresh(); // Source$
store.emitUpdateData(42); // Source$
store.nextUserInput('hello'); // Observable
```

### Accessing sources in other craft entries

```ts
const { injectCraft } = craft(
  { name: 'CounterStore', providedIn: 'root' },
  craftSources(() => ({
    increment: source$<void>(),
    decrement: source$<void>(),
  })),
  craftState('count', ({ increment, decrement }) => {
    // Sources are accessible from context
    return state(signal(0), ({ state, set }) => ({
      increment: on$(increment, () => set(state() + 1)),
      decrement: on$(decrement, () => set(state() - 1)),
    }));
  }),
);

const store = injectCraft();

// Use emit prefix for Source$ types
store.emitIncrement();
store.emitDecrement();
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
