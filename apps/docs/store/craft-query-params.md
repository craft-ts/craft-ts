# craftQueryParam

Integrate query parameter management into craft stores with URL synchronization.

## Import

```typescript
import { craft, craftQueryParam, queryParam } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
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
    }),
  ),
);

const store = injectCraft();

// Access query param values
store.pagination(); // { page: number; pageSize: number }
store.paginationPage(); // number
store.paginationPageSize(); // number

// Update query params (also updates URL)
store.setPagination({ page: 2, pageSize: 20 });
// URL: ?page=2&pageSize=20
```

## With Custom Methods

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftQueryParam('pagination', () =>
    queryParam(
      {
        state: {
          page: {
            fallbackValue: 1,
            parse: (value: string) => parseInt(value, 10),
            serialize: (value: unknown) => String(value),
          },
        },
      },
      ({ state, set, reset }) => ({
        set,
        reset,
        nextPage: () => {
          set({ ...state(), page: state().page + 1 });
        },
      }),
    ),
  ),
);

const store = injectCraft();

// Use custom methods (suffixed with query param name)
store.nextPagePagination();
store.resetPagination();
```

## Standalone Navigation (Outside Injection Context)

```typescript
const { injectCraft, setPaginationQueryParams } = craft(
  { name: 'SearchStore', providedIn: 'root' },
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
    }),
  ),
);

// Navigate with query params outside injection context
async function navigateToPage() {
  await router.navigate(['search'], {
    queryParams: setPaginationQueryParams({ page: 4, pageSize: 20 }),
  });
}

// Or with navigateByUrl
function navigateByUrl() {
  router.navigateByUrl(
    `/search?${setPaginationQueryParams({ page: 4, pageSize: 20 })}`,
  );
}
```

For detailed documentation, see [queryParam primitive](/primitives/query-param).
