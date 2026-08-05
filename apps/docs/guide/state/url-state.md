# queryParams

`queryParams` is a state whose home is the URL's query string. Reading and
writing look like any other state; the address bar follows, and so does the back
button.

**Use it when** the value should survive a refresh and be shareable by copying
the link: filters, pagination, a selected tab.
**Not when** the value is ephemeral or private — that's
[`state`](/guide/state/local-state).

::: tip No synchronisation code
There is no effect to write and no `ActivatedRoute` subscription. If you find
yourself syncing a `state` with the URL, you want this primitive instead.
:::

## The common case

```typescript
import { queryParams } from '@craft-ng/core';

const numberCodec = {
  decode: (value: string) => parseInt(value, 10),
  encode: (value: number) => String(value),
};
const booleanCodec = {
  decode: (value: string) => value === 'true',
  encode: (value: boolean) => String(value),
};

const { pagination } = yield* queryParams(
  'pagination',
  {
    state: {
      page: { fallbackValue: 1, codec: numberCodec },
      showArchived: { fallbackValue: false, codec: booleanCodec },
    },
  },
  ({ set, update, patch, reset }) => ({ set, update, patch, reset }),
);

pagination(); // { page: 1, showArchived: false }
pagination.page(); // 1

pagination.patch({ showArchived: true }); // navigates to ?showArchived=true
pagination.set({ page: 4, showArchived: false });
pagination.update((current) => ({ ...current, page: current.page + 1 }));
pagination.reset();
```

`?page=3&showArchived=true` becomes `{ page: 3, showArchived: true }` on load.

## Codecs are mandatory

A URL only holds strings, so every parameter declares how it converts both ways.
The decoded type is your application type; the encoded one is what appears in the
address bar.

`fallbackValue` is what you get when the parameter is absent — which is why the
state type is never `undefined`.

Codecs stay synchronous because they run inside the reactive URL computation.
`@craft-ng/core` deliberately doesn't depend on a validation library: supply a
small `{ decode, encode }` pair directly, or adapt one from the library you
already use.

```typescript
// arrays
tags: {
  fallbackValue: [],
  codec: {
    decode: (value) => value.split(',').filter(Boolean),
    encode: (value) => value.join(','),
  },
},

// plain strings
q: { fallbackValue: '', codec: { decode: String, encode: String } },
```

The same pattern covers dates, enums and JSON-encoded objects.

## Custom methods

```typescript
yield* queryParams(
  'pagination',
  {
    state: { page: { fallbackValue: 1, codec: numberCodec } },
  },
  ({ state, patch }) => ({
    nextPage: () => patch({ page: state().page + 1 }),
    previousPage: () => patch({ page: state().page - 1 }),
    setPageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
  }),
);
```

## Feeding a query

The point of URL state is usually to drive a fetch. Read it from the query's
`params`:

```typescript
yield* query('tasksQuery', {
  params: () => ({ page: pagination.page() }),
  loader: /* … */,
});
```

One direction of data flow: click → URL → loader → view.

## Decode failures

A `decode` that throws keeps the fallback value rather than corrupting your
state, and surfaces the failure:

```typescript
if (mode.hasException()) {
  mode.exceptions().list;
  mode.exceptions().parse.mode?.code; // 'QueryParamDecodeError'
  mode.exceptions().parse.mode?.payload;
}
```

An encode failure raises `QueryParamEncodeError` before router navigation starts.

## Pitfalls

**Every parameter needs a `codec`** — there is no implicit string passthrough.

**Methods bound to a source with `on$` are not exposed** on the result, same as
every primitive.

::: details Advanced — declaring query params on the route
Query parameters can live in the route rather than in a component, so they belong
to the URL definition itself:

```typescript
export const { demoRoutes, injectDemoQueryParamsQueryParams } = craftRoutes(
  'demo',
  [
    {
      path: 'query-params',
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./qp-list-with-pagination')).then(
          ({ default: component }) => component,
        ),
      ),
      queryParams: function* () {
        const { pagination } = yield* queryParams(
          'pagination',
          {
            state: {
              page: { fallbackValue: 1, codec: numberCodec },
              pageSize: { fallbackValue: 4, codec: numberCodec },
            },
          },
          ({ patch, state }) => ({
            nextPage: () => patch({ page: state().page + 1 }),
            previousPage: () => patch({ page: state().page - 1 }),
            updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
          }),
        );
        return pagination;
      },
    },
  ],
);
```

Working source:
[exception-query-params.ts](https://github.com/ng-angular-stack/ng-craft/blob/main/apps/demo/src/app/examples/primitives/exceptions/exception-query-params.ts).
:::

::: details Advanced — yielding dependencies
The insertion can be a generator, so a rule can come from a service:

```typescript
yield* queryParams(
  'pagination',
  { state: { page: { fallbackValue: 1, codec: numberCodec } } },
  function* ({ patch, state }) {
    const maxPage = yield* PaginationRules.maxPage();
    return {
      nextPage: () => {
        if (state().page >= maxPage()) return;
        patch(({ page }) => ({ page: page + 1 }));
      },
    };
  },
);
```

:::

## See Also

- [Local state](/guide/state/local-state) — for non-URL state
- [query](/guide/state/server-state) — consuming URL state from a loader
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
