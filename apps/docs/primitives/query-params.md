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

## Recommended: codecs

`@craft-ng/core` stays independent from validation libraries. Provide a small
synchronous bidirectional codec directly, or adapt any validation library to
the `{ decode, encode }` contract:

```typescript
const numberCodec = {
  decode: (value: string) => Number(value),
  encode: (value: number) => String(value),
};
const booleanCodec = {
  decode: (value: string) => value === 'true',
  encode: (value: boolean) => String(value),
};

const { pagination } = queryParams(
  'pagination',
  {
    state: {
      page: {
        fallbackValue: 1,
        codec: numberCodec,
      },
      showArchived: {
        fallbackValue: false,
        codec: booleanCodec,
      },
    },
  },
  ({ set }) => ({ set }),
);

// URL "?page=3&showArchived=true" becomes typed application state.
console.log(pagination()); // { page: 3, showArchived: true }
pagination.set({ page: 4, showArchived: false }); // encodes before navigating
```

The codec's decoded type is the signal type and its encoded type is the URL
representation. This also works for dates, enums, arrays, and JSON-encoded
objects. Query parameter codecs are synchronous because they run inside the
reactive URL calculation.

### Basic usage with pagination

```typescript
const { myQueryParams } = queryParams(
  'myQueryParams',
  {
    state: {
      page: {
        fallbackValue: 1,
        codec: {
          decode: (value) => parseInt(value, 10),
          encode: (value) => String(value),
        },
      },
      pageSize: {
        fallbackValue: 10,
        codec: {
          decode: (value) => parseInt(value, 10),
          encode: (value) => String(value),
        },
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
      page: {
        fallbackValue: 1,
        codec: { decode: parseInt, encode: String },
      },
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

### Decode exceptions (`hasException` / `exceptions().parse`)

```typescript
import { queryParams } from '@craft-ng/core';

const { mode } = queryParams('mode', {
  state: {
    mode: {
      fallbackValue: 'success' as const,
      codec: {
        decode: (value: string) => {
          if (value !== 'success') {
            throw new Error(`Invalid mode: ${value}`);
          }
          return 'success' as const;
        },
        encode: (value) => String(value),
      },
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
        codec: {
          decode: (value: string) => parseInt(value, 10),
          encode: (value: number) => String(value),
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
                codec: {
                  decode: (value) => parseInt(value, 10),
                  encode: (value) => String(value),
                },
              },
              pageSize: {
                fallbackValue: 4,
                codec: {
                  decode: (value) => parseInt(value, 10),
                  encode: (value) => String(value),
                },
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

`codec` is required for every query parameter. A codec decoding failure keeps
the fallback value and is exposed as
`exceptions().parse.<key>` with code `QueryParamDecodeError`. If encoding fails,
`QueryParamEncodeError` is raised before router navigation starts.

## Common Patterns

### Search filters

```typescript
const { filters } = queryParams('filters', {
  state: {
    q: { fallbackValue: '', codec: { decode: String, encode: String } },
    category: {
      fallbackValue: 'all',
      codec: { decode: String, encode: String },
    },
    minPrice: {
      fallbackValue: 0,
      codec: { decode: (value: string) => parseInt(value, 10), encode: String },
    },
  },
});
```

### Array parameters

```typescript
const { filters } = queryParams('filters', {
  state: {
    tags: {
      fallbackValue: [],
      codec: {
        decode: (value) => value.split(',').filter(Boolean),
        encode: (value) => value.join(','),
      },
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
      codec: {
        decode: (value: string) => value === 'true',
        encode: (value: boolean) => String(value),
      },
    },
  },
});
```

## See Also

- [state](/primitives/state) - For non-URL state
- [craftService](/store/craft-service) - For integrating URL state inside reusable services
