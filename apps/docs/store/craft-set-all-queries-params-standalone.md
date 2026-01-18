# craftSetAllQueriesParamsStandalone

Creates a standalone method to set all query parameters at once for use in Angular Router navigation.

## Import

```typescript
import { craftSetAllQueriesParamsStandalone } from '@ngcraft/core';
```

## Introduction

`craftSetAllQueriesParamsStandalone` generates a utility method that:

- Collects query parameter state from all registered query params in the store
- Serializes all values into URL-compatible strings
- Returns a flat object compatible with Angular Router's `queryParams` option
- Provides a `toString()` method for use with `navigateByUrl()`
- Enables type-safe batch updates of all query parameters

## Use Cases

- **Programmatic navigation**: Set all query params when navigating to a route
- **Link generation**: Create URLs with all current query parameter state
- **Deep linking**: Generate shareable URLs with complete state
- **Bulk updates**: Update multiple query param groups in one operation

## Naming Convention

- Generated method: `setAll{StoreName}QueryParams`
- Example: For store named `MyStore`, method is `setAllMyStoreQueryParams`

## Router Integration

- Use with `router.navigate(['/path'], { queryParams: result })`
- Use with `router.navigateByUrl(\`/path?\${result}\`)`
- Compatible with `routerLink` directive

## Type Safety

- Input is typed based on all registered query param configurations
- Output is a flat record of string values ready for the URL
- TypeScript ensures all required query param groups are provided

## Requirements

- Must be used after all `craftQueryParam()` definitions in the craft store
- Each query param must define a `state` with parse/serialize/fallbackValue

## Signature

```ts
function craftSetAllQueriesParamsStandalone<Context, StoreConfig>(): CraftSetAllQueriesParamsStandaloneOutputs<Context, StoreConfig>;
```

## Return Value

A craft factory utility that adds a standalone method:

- `setAll{StoreName}QueryParams(params)` - Accepts object with all query param states and returns a flat string record for router with a `toString()` method for URL construction

## Examples

### Basic usage with router.navigate

```ts
const { setAllMyStoreQueryParams } = craft(
  { name: 'MyStore', providedIn: 'root' },
  craftQueryParam('pagination', () =>
    queryParam({
      state: {
        page: { fallbackValue: 1, parse: (v) => parseInt(v, 10), serialize: (v) => String(v) },
        pageSize: { fallbackValue: 10, parse: (v) => parseInt(v, 10), serialize: (v) => String(v) },
      },
    })
  ),
  craftQueryParam('filter', () =>
    queryParam({
      state: {
        search: { fallbackValue: '', parse: (v) => v, serialize: (v) => v },
        active: { fallbackValue: false, parse: (v) => v === 'true', serialize: (v) => String(v) },
      },
    })
  ),
  craftSetAllQueriesParamsStandalone()
);

router.navigate(['/items'], {
  queryParams: setAllMyStoreQueryParams({
    pagination: { page: 5, pageSize: 20 },
    filter: { search: 'angular', active: true },
  }),
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
