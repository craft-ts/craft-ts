# 7. Put state in the URL

**Goal:** make the "show done tasks" filter and the page number survive a
refresh and a copy-pasted link — without syncing anything by hand.

## `queryParams` is a state that lives in the URL

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

const filters = yield* queryParams(
  'filters',
  {
    state: {
      page: { fallbackValue: 1, codec: numberCodec },
      showDone: { fallbackValue: false, codec: booleanCodec },
    },
  },
  ({ set, patch, reset }) => ({ set, patch, reset }),
);
```

Reading and writing look like any other state — the URL follows:

```typescript
filters(); // { page: 1, showDone: false }
filters.page(); // 1

filters.patch({ showDone: true }); // navigates to ?showDone=true
filters.reset();
```

And `?page=3&showDone=true` becomes `{ page: 3, showDone: true }` on load. There
is no effect to write, no subscription to the `ActivatedRoute`, no
`skipLocationChange` dance.

## Codecs are mandatory, and that's on purpose

A URL only holds strings. Every parameter must declare how it converts both ways:

```typescript
{ fallbackValue: 1, codec: { decode, encode } }
```

`fallbackValue` is what you get when the parameter is absent — so the state type
is never `undefined`. The decoded type is your application type; the encoded one
is what appears in the URL. It works the same for dates, enums, arrays
(`value.split(',')`) and JSON blobs.

Codecs are synchronous, because they run inside the reactive URL computation.

When a `decode` throws, the parameter keeps its fallback and the failure surfaces
instead of corrupting your state:

```typescript
if (filters.hasException()) {
  filters.exceptions().parse.page?.code; // 'QueryParamDecodeError'
}
```

## Feeding the query

Now connect it to step 5 — the query's `params` reads the URL state:

```typescript
const tasksQuery = yield* query('tasksQuery', {
  params: () => ({ page: filters.page(), done: filters.showDone() }),
  loader: function* ({ params }) {
    return yield* CraftHttpClient.get(({ response }) => ({
      url: `/api/tasks?page=${params.page}&done=${params.done}`,
      success: response<Task[]>(),
    }));
  },
});
```

Clicking "next page" now changes the URL, which re-runs the loader, which
re-renders the list. One direction of data flow, and the back button works.

## Custom methods, same as always

```typescript
queryParams(
  'filters',
  {
    /* … */
  },
  ({ state, patch }) => ({
    nextPage: () => patch({ page: state().page + 1 }),
    previousPage: () => patch({ page: state().page - 1 }),
    setPageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
  }),
);
```

## What you gained

Shareable, refresh-proof UI state, with no synchronisation code.

::: details Declaring query params on the route itself
`queryParams` can live directly in a `craftRoutes(...)` entry, so the parameters
belong to the route rather than to a component, and can then be retrieved through
dependency injection. We'll see this after step 9, which introduces routes. See
[queryParams](/guide/state/url-state) for the full reference.
:::

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 6. Write server data](/learn/06-mutate-data)

[8. Build a form →](/learn/08-forms)

</div>
