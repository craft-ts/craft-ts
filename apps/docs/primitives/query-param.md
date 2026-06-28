# queryParam

The `queryParam` primitive creates a reactive query parameter manager that synchronizes state with URL query parameters.

## Import

```typescript
import { queryParam } from '@craft-ng/core';
```

## Basic Examples

### Basic usage with pagination

```typescript
const myQueryParams = queryParam(
  {
    state: {
      page: {
        fallbackValue: 1,
        parse: (value) => parseInt(value, 10),
        serialize: (value) => String(value),
      },
      pageSize: {
        fallbackValue: 10,
        parse: (value) => parseInt(value, 10),
        serialize: (value) => String(value),
      },
    },
  },
  ({ set, update, patch, reset }) => ({ set, update, patch, reset }),
);

// Access state
console.log(myQueryParams()); // { page: 1, pageSize: 10 }
console.log(myQueryParams.page()); // 1

// Update state (also updates URL)
myQueryParams.set({ page: 2, pageSize: 20 });
myQueryParams.update((current) => ({ ...current, page: current.page + 1 }));
myQueryParams.patch({ pageSize: 50 });
myQueryParams.reset();
```

### With custom methods via insertions

```typescript
const myQueryParams = queryParam(
  {
    state: {
      page: { fallbackValue: 1, parse: parseInt, serialize: String },
    },
  },
  ({ state, set }) => ({
    goTo: (newPage: number) => {
      set({ ...state(), page: newPage });
    },
  }),
);

myQueryParams.goTo(5); // Custom method from insertion
```

### Parse exceptions (`hasException` / `exceptions().parse`)

```typescript
import { craftException, queryParam } from '@craft-ng/core';

const mode = queryParam({
  state: {
    mode: {
      fallbackValue: 'success' as const,
      parse: (value: string) =>
        value === 'success'
          ? ('success' as const)
          : craftException({ code: 'InvalidModeFromUrl' }, { received: value }),
      serialize: (value) => String(value),
    },
  },
});

if (mode.hasException()) {
  console.log(mode.exceptions().list);
  console.log(mode.exceptions().parse.mode?.code);
  console.log(mode.exceptions().parse.mode?.payload);
}
```

## With dependency injection

```typescript
queryParam(
  {
    state: {
      page: {
        fallbackValue: 1,
        parse: function* (value: string) {
          return yield* ParsePageToYield.parsePage(value);
        },
        serialize: function* (value: number) {
          return yield* SerializePageToYield.serializePage(value);
        },
      },
    },
  },
  function* ({ patch, state }) {
    const maxPage = yield* PaginationRulesToYield.maxPage();
    return {
      nextPage: () => {
        if (state().page >= maxPage()) {
          return;
        }
        patch(({ page }) => ({
          page: page + 1,
        }));
      },
    };
  },
);
```

## Used with `craftRoutes`

For a full declarative route, queryParams can live inside `craftRoutes`:

```typescript
export const { demoRoutes, injectDemoQueryParamQueryParams } = craftRoutes(
  'demo',
  [
    {
      path: 'query-param',
      componentDeps:
        {} as import('./examples/routes/list-with-pagination/qp-list-with-pagination').GenDeps_QpListWithPagination,
      loadComponent: ({ withRetry }) =>
        withRetry(
          import(
            './examples/routes/list-with-pagination/qp-list-with-pagination'
          ),
        ),
      queryParams: () =>
        queryParam(
          {
            state: {
              page: {
                fallbackValue: 1,
                parse: (value) => parseInt(value, 10),
                serialize: (value) => String(value),
              },
              pageSize: {
                fallbackValue: 4,
                parse: (value) => parseInt(value, 10),
                serialize: (value) => String(value),
              },
            },
          },
          ({ patch, state }) => ({
            nextPage: () => patch({ page: state().page + 1 }),
            previousPage: () => patch({ page: state().page - 1 }),
            updatePageSize: (newPageSize: number) =>
              patch({ pageSize: newPageSize, page: 1 }),
          }),
        ),
    },
  ],
);
```

Demo source:

- [exception-query-param.ts](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exception-query-param.ts)

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

⚠️ **Methods bound to sources** using `on$` are not exposed in the output.

## Common Patterns

### Search filters

```typescript
const filters = queryParam({
  state: {
    q: { fallbackValue: '', parse: String, serialize: String },
    category: { fallbackValue: 'all', parse: String, serialize: String },
    minPrice: { fallbackValue: 0, parse: parseInt, serialize: String },
  },
});
```

### Array parameters

```typescript
const filters = queryParam({
  state: {
    tags: {
      fallbackValue: [],
      parse: (value) => value.split(',').filter(Boolean),
      serialize: (value) => value.join(','),
    },
  },
});
```

### Boolean parameters

```typescript
const options = queryParam({
  state: {
    showArchived: {
      fallbackValue: false,
      parse: (value) => value === 'true',
      serialize: (value) => String(value),
    },
  },
});
```

## See Also

- [state](/primitives/state) - For non-URL state
- [craftService](/store/craft-service) - For integrating URL state inside reusable services
