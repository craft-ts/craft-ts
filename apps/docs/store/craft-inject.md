# craftInject

Injects Angular services and tokens into a craft store, making them accessible to all craft entries.

## Import

```typescript
import { craftInject } from '@ng-craft/core';
```

## Introduction

`craftInject` integrates Angular's dependency injection system into craft stores by:

- Injecting services, injection tokens, and providers
- Making injected dependencies accessible in all craft entries (queries, mutations, states)
- Supporting generic services with type parameters
- Automatically converting injection keys to camelCase for context access
- Providing full type safety for injected dependencies
- Accessing services outside of direct injection context

## Naming Convention

- Define injections with PascalCase keys: `{ MyService, UserRepository }`
- Access in context with camelCase: `context.myService`, `context.userRepository`
- Automatic conversion preserves type information

## Use Cases

- **Service integration**: Access Angular services (HttpClient, Router, etc.) in queries/mutations
- **API clients**: Inject custom API service classes for data fetching
- **State services**: Access existing Angular services that manage state
- **Configuration**: Inject configuration tokens and environment settings
- **Third-party libraries**: Access library services and utilities
- **Testing**: Mock services by providing test implementations

## Injection Types

- **Services**: Injectable classes marked with `@Injectable()`
- **Injection Tokens**: `InjectionToken<T>` for non-class dependencies
- **Generic Services**: Services with type parameters `Service<T>`
- **Abstract Classes**: Base classes with implementations provided elsewhere

## Context Access

- Injections available in all craft entries via context parameter
- Access pattern: `context.serviceName` (lowercase first letter)
- Can access other context entries in the injection factory function

## Reactive Integration

- Services can expose signals that queries/mutations react to
- Service methods can be called from query loaders or mutation handlers
- Injected services maintain their own lifecycle and state

## Signature

```ts
function craftInject<Context, StoreConfig, Injections>(
  injections: (entries: CraftFactoryEntries<Context>) => Injections,
): CraftInputsOutputs<Context, StoreConfig, Injections>;
```

## Parameters

### `injections`

Factory function that receives the craft context and returns a record of injections.
Keys should be PascalCase (matching service/token names), values should be service classes or injection tokens.
Has access to all other craft entries defined before it.

## Return Value

A craft factory utility that:

- Injects all specified dependencies using Angular's injector
- Makes them accessible in camelCase in the craft context
- Provides full type safety for injected services

## Examples

### Basic service injection

```ts
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInject(() => ({
    UserApiService,
  })),
  craftQuery('user', ({ userApiService }) =>
    query({
      params: () => 'user-123',
      loader: async ({ params }) => {
        return firstValueFrom(userApiService.getUser(params));
      },
    }),
  ),
);
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
