# queryParams

The `queryParams` primitive creates a reactive query parameter manager that synchronizes state with URL query parameters.

## Import

```typescript
import { queryParams, craftUse } from '@craft-ng/core';
```

## Consuming the primitive

Every craft primitive takes its **name** as first argument and resolves to a
single-key record, so you always consume it by destructuring:

- inside a generator host (a `craftService` factory, `craftGen`, …) with
  `const { pagination } = yield* queryParams('pagination', {...})` — the dependencies fold into
  the enclosing service tree automatically;
- anywhere else (typically a component field) with
  `const { pagination } = craftUse(queryParams('pagination', {...}))`.

The name is more than a label: it tags the primitive's injector
(`queryParams:pagination`), so it identifies the primitive in snapshots, logs and
observability.

A factory arrow that returns the primitive directly now resolves to the
**record**, not the ref. Drive the primitive yourself when the service should
expose the ref:

```typescript
craftService({ name: 'MyService', scope: 'global' }, function* () {
  const { pagination } = yield* queryParams('pagination', {
    /* ... */
  });
  return pagination;
});
```

The generator is single-use: consume each invocation exactly once.

For brevity, the examples below focus on the configuration and omit the
`yield*` / `craftUse` wrapper.

## Basic Examples

### Basic usage with pagination

```typescript
const { myQueryParams } = queryParams(
  'myQueryParams',
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
const { myQueryParams } = queryParams(
  'myQueryParams',
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
import { craftException, queryParams } from '@craft-ng/core';

const { mode } = queryParams('mode', {
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
queryParams(
  'pagination',
  {
    state: {
      page: {
        fallbackValue: 1,
        parse: function* (value: string) {
          return yield* ParsePage.parsePage(value);
        },
        serialize: function* (value: number) {
          return yield* SerializePage.serializePage(value);
        },
      },
    },
  },
  function* ({ patch, state }) {
    const maxPage = yield* PaginationRules.maxPage();
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
export const { demoRoutes, injectDemoQueryParamsQueryParams } = craftRoutes(
  'demo',
  [
    {
      path: 'query-params',
      componentDeps:
        {} as import('./examples/routes/list-with-pagination/qp-list-with-pagination').GenDeps_QpListWithPagination,
      loadComponent: ({ withRetry }) =>
        withRetry(
          import(
            './examples/routes/list-with-pagination/qp-list-with-pagination'
          ),
        ),
      queryParams: function* () {
        const { pagination } = yield* queryParams(
          'pagination',
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
        );
        return pagination;
      },
    },
  ],
);
```

Demo source:

- [exception-query-params.ts](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exception-query-params.ts)

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

⚠️ **Methods bound to sources** using `on$` are not exposed in the output.

## Common Patterns

### Search filters

```typescript
const { filters } = queryParams('filters', {
  state: {
    q: { fallbackValue: '', parse: String, serialize: String },
    category: { fallbackValue: 'all', parse: String, serialize: String },
    minPrice: { fallbackValue: 0, parse: parseInt, serialize: String },
  },
});
```

### Array parameters

```typescript
const { filters } = queryParams('filters', {
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
const { options } = queryParams('options', {
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
