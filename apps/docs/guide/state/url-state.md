# URL state: `queryParams` and `pathParams`

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
import { queryParams } from '@craft-ts/core';

const numberCodec = {
  decode: (value: string) => parseInt(value, 10),
  encode: (value: number) => String(value),
};
const booleanCodec = {
  decode: (value: string) => value === 'true',
  encode: (value: boolean) => String(value),
};

const pagination =
  yield *
  queryParams(
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

## Path parameters

Use `pathParams` for a dynamic segment such as `:userId` or `:page`. Unlike
`queryParams`, each path parameter is declared on its route, because its name
and codec are part of that route's URL contract.

```typescript
import {
  craftException,
  craftRoute,
  craftRoutes,
  pathParams,
} from '@craft-ts/core';
import { UsersPage } from './users.page';

const positiveIntegerCodec = {
  decode(raw: string) {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) {
      return craftException({ _tag: 'INVALID_PAGE', scope: 'parse' }, { raw });
    }
    return value;
  },
  encode(value: number) {
    return String(value);
  },
};

export const { usersRoutes } = craftRoutes('users', [
  craftRoute('users/:userId/page/:page', {
    loadComponent: async () => UsersPage,
    componentDeps: {},
    pathParams: {
      userId: pathParams('userId'),
      page: pathParams(
        'page',
        { codec: positiveIntegerCodec, fallbackValue: 1 },
        ({ value, set }) => ({
          nextPage: function* () {
            return yield* set(value() + 1);
          },
        }),
      ),
    },
  }).withProviders(({ PagePathParams }) => {
    // PagePathParams() yields the route-scoped primitive to providers here.
    void PagePathParams;
    return [];
  }),
]);
```

Without a codec, the primitive reads and writes the URL segment as a `string`.
With a codec, `value()` and `set(...)` use the decoded type. The route record's
keys must match dynamic segment names. Optional segments (`:page?`) continue to
use the existing raw parameter helpers; `pathParams` does not bind optional
segments yet.

`set` and `update` replace only the selected segment and preserve the other path
segments, query string, and fragment. They add a history entry by default;
`{ replaceUrl: true }` replaces the current entry. `skipLocationChange` is also
available in the same options object.

When `fallbackValue` is present, a decode failure uses that value and remains
available through `hasException()` and `exception()`. Without a fallback, the
route's exception handlers receive a codec-returned `craftException`, or a
`PathParamDecodeError` when `decode` throws. This happens before the route
component consumes the decoded value. An encode failure is normalized to
`PathParamEncodeError` before the URL changes.

The generated collection helper is route-scoped, like the existing raw
`UsersUserIdParams` helpers. Descendant providers can use the short helper from
`withProviders`, such as `PagePathParams`; app-level services should pass
destination parameters explicitly:

```typescript
import { CraftRouter } from '@craft-ts/core';

yield* CraftRouter.navigate({
  to: 'users/:userId/page/:page',
  params: { userId, page: 3 }, // `page` is decoded here; the codec writes "3"
});
```

Routes that do not declare `pathParams` keep their existing raw parameter
helpers and `params` remain strings. A declaration replaces only the matching
parameter's type in `CraftRouter` navigation inputs.

## Query string codecs are mandatory

A URL only holds strings, so every query parameter declares how it converts both ways.
The decoded type is your application type; the encoded one is what appears in the
address bar.

`fallbackValue` is what you get when the parameter is absent — which is why the
state type is never `undefined`.

Codecs stay synchronous because they run inside the reactive URL computation.
`@craft-ts/core` deliberately doesn't depend on a validation library: supply a
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

## Effect Schema adapter

When the application already uses Effect Schema, keep `queryParams` as the URL
owner and adapt the schema's synchronous entry points. This keeps URL parsing
typed without introducing a second URL primitive:

```typescript
import { Schema } from 'effect';

const Search = Schema.String;
const searchCodec = {
  decode: Schema.decodeUnknownSync(Search),
  encode: Schema.encodeSync(Search),
};

const filters =
  yield *
  queryParams('filters', {
    state: {
      search: { fallbackValue: '', codec: searchCodec },
    },
  });
```

Use the same adapter shape for numbers, booleans, dates, enums and arrays. A
transformation schema is useful when the URL representation differs from the
value used by the component; its `decode` and `encode` functions must still be
synchronous. Missing values use `fallbackValue`, malformed values keep that
fallback and expose `QueryParamDecodeError`, and `reset()` removes the keys
from the URL. This covers the common filter, sort and pagination cases while
preserving stable serialization in one place.

There is deliberately no `queryParamsEffect`: URL synchronisation belongs to
Craft, while an Effect query or loader reacts to the resulting typed state.

## Custom methods

```typescript
yield *
  queryParams(
    'pagination',
    {
      state: { page: { fallbackValue: 1, codec: numberCodec } },
    },
    ({ state, patch }) => ({
      nextPage: function* () {
        const current = yield* state();
        return yield* patch({ page: current.page + 1 });
      },
      previousPage: function* () {
        const current = yield* state();
        return yield* patch({ page: current.page - 1 });
      },
      setPageSize: function* (pageSize: number) {
        return yield* patch({ pageSize, page: 1 });
      },
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

**Every query parameter needs a `codec`** — there is no implicit string passthrough.

**Methods bound to a source with `on$` are not exposed** on the result, same as
every primitive.

::: details Advanced — declaring query params on the route
Query parameters can live in the route rather than in a component, so they belong
to the URL definition itself:

```typescript
export const { demoRoutes, DemoQueryParamsQueryParams } = craftRoutes('demo', [
  {
    path: 'query-params',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./qp-list-with-pagination')).then(
        ({ default: component }) => component,
      ),
    ),
    queryParams: function* () {
      const pagination = yield* queryParams(
        'pagination',
        {
          state: {
            page: { fallbackValue: 1, codec: numberCodec },
            pageSize: { fallbackValue: 4, codec: numberCodec },
          },
        },
        ({ patch, state }) => ({
          nextPage: function* () {
            const current = yield* state();
            return yield* patch({ page: current.page + 1 });
          },
          previousPage: function* () {
            const current = yield* state();
            return yield* patch({ page: current.page - 1 });
          },
          updatePageSize: function* (pageSize: number) {
            return yield* patch({ pageSize, page: 1 });
          },
        }),
      );
      return pagination;
    },
  },
]);
```

The route collection exposes its route-level query params as the yieldable
`DemoQueryParamsQueryParams()` helper. It is useful to consumers outside the
route's provider setup:

```typescript
const pagination = yield * DemoQueryParamsQueryParams();
```

For a lazy component rendered by that same route, pass the route's local
`QueryParams` helper through `.withProviders(...)` to a service the component
can yield. This keeps the component independent from the route collection and
avoids importing the route module back into its own lazy component. See
[route providers](/guide/routing/route-providers) for the full pattern.

Working source:
[exception-query-params.ts](https://github.com/craft-ts/craft-ts/blob/main/apps/demo/src/app/examples/primitives/exceptions/exception-query-params.ts).
:::

::: details Advanced — yielding dependencies
The insertion can be a generator, so a rule can come from a service:

```typescript
yield *
  queryParams(
    'pagination',
    { state: { page: { fallbackValue: 1, codec: numberCodec } } },
    function* ({ patch, state }) {
      return {
        nextPage: function* () {
          const current = yield* state();
          // A reactive member is read when it is yielded: this is the
          // current maximum, not the one from when the query params were built.
          if (current.page >= (yield* PaginationRules.maxPage())) return;
          return yield* patch(({ page }) => ({ page: page + 1 }));
        },
      };
    },
  );
```

:::

::: tip Advanced — injectable writes
Insertion methods provide `injectQueryParamsMethodRuntimeContext()`, and the
URL state itself is published to `providePrimitiveResourceRuntimeObserver`.
Both expose `get`, `set`, `update`, and `patch` for wrappers, WebMCP tools,
and other advanced patterns. See
[Anatomy of a primitive](/guide/concepts/primitive-anatomy#injectable-runtime-context).
:::

## See Also

- [Local state](/guide/state/local-state) — for non-URL state
- [query](/guide/state/server-state) — consuming URL state from a loader
- [Anatomy of a primitive](/guide/concepts/primitive-anatomy)
