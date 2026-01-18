# craftQueryParam

Creates a craft factory for reactive query parameter management integrated with the craft store.

## Import

```typescript
import { craftQueryParam } from '@ngcraft/core';
```

## Introduction

`craftQueryParam` integrates query parameter management into a craft store by:

- Creating typed signals for each query parameter prefixed with the provided name
- Exposing methods to update query parameters
- Providing a standalone method to serialize query params for navigation outside injection context
- Synchronizing with URL query parameters automatically

## Important Notes

- `queryParamFactory` must return a `queryParam()` call.
- `queryParam()` requires an injection context, so `craftQueryParam` calls the factory in and out of injection context.
- Avoid query params key collisions between groups (no verification yet).

## Signature

```ts
function craftQueryParam<Context, StoreConfig, QueryParamsName, QueryParamsType, Insertions, QueryParamsState>(
  queryParamsName: QueryParamsName,
  queryParamFactory: (context: CraftFactoryEntries<Context>) => QueryParamOutput<QueryParamsType, Insertions, QueryParamsState>
): CraftQueryParamOutputs<Context, StoreConfig, QueryParamsName, QueryParamsType, Insertions, QueryParamsState>;
```

## Parameters

### `queryParamsName`

Name used to prefix generated signals and methods.

### `queryParamFactory`

Factory function that receives the craft context and returns a `QueryParamOutput`.

## Return Value

A craft factory utility with standalone methods for serializing query params.

## Examples

### Basic usage with craft

```ts
const { injectCraft, setPaginationQueryParams } = craft(
  { providedIn: 'root', name: 'myStore' },
  craftQueryParam('pagination', () =>
    queryParam({
      state: {
        page: {
          fallbackValue: 1,
          parse: (value: string) => parseInt(value, 10),
          serialize: (value: unknown) => String(value),
        },
        pageSize: {
          fallbackValue: 10,
          parse: (value: string) => parseInt(value, 10),
          serialize: (value: unknown) => String(value),
        },
      },
    }, ({ set, update, patch, reset }) => ({ set, update, patch, reset }))
  )
);

const store = injectCraft();

store.paginationPage();
store.setPagination({ page: 2, pageSize: 20 });
```

### Using standalone method outside injection context

```ts
await router.navigate(['my-page'], {
  queryParams: setPaginationQueryParams({ page: 4, pageSize: 20 }),
});
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
