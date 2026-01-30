# craftQueryParams

Creates a craft factory for managing multiple reactive query parameter groups integrated with the craft store.

## Import

```typescript
import { craftQueryParams } from '@ng-angular-stack/craft';
```

## Introduction

`craftQueryParams` allows you to define multiple named query parameter groups within a single craft store by:

- Creating typed signals for each query parameter group prefixed with their respective names
- Providing standalone methods to serialize query params for navigation outside injection context
- Synchronizing all query parameter groups with URL query parameters automatically

## Important Notes

- `queryParamFactory` must return an object where each value is a `queryParam()` call.
- `queryParam()` requires an injection context, so `craftQueryParams` calls the factory in and out of injection context.
- Avoid query params key collisions between different groups (no verification yet).

## Signature

```ts
function craftQueryParams<Context, StoreConfig, QueryParamKeys, QueryParams>(
  queryParamFactory: (context: CraftFactoryEntries<Context>) => QueryParams,
): CraftQueryParamsOutputs<Context, StoreConfig, QueryParamKeys, QueryParams>;
```

## Parameters

### `queryParamFactory`

Factory function that receives the craft context and returns an object of `QueryParamOutput` instances.

## Return Value

A craft factory utility with standalone methods for serializing each query param group.

## Examples

### Basic usage with multiple query param groups

```ts
const { injectCraft, setPaginationQueryParam, setActiveQueryParam } = craft(
  { providedIn: 'root', name: 'myStore' },
  craftQueryParams(() => ({
    pagination: queryParam(
      {
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
      },
      ({ set, reset }) => ({ set, reset }),
    ),
    active: queryParam(
      {
        state: {
          isActive: {
            fallbackValue: false,
            parse: (value: string) => value === 'true',
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ set, reset }) => ({ set, reset }),
    ),
  })),
);

const store = injectCraft();

store.paginationPage();
store.activeIsActive();
store.setPagination({ page: 2, pageSize: 20 });
```

### Using standalone methods outside injection context

```ts
await router.navigate(['my-page'], {
  queryParams: {
    ...setPaginationQueryParam({ page: 4, pageSize: 20 }),
    ...setActiveQueryParam({ isActive: true }),
  },
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
