# Pagination placeholders

`insertPaginationPlaceholderData` keeps the previous page on screen while the
next one loads, so paging through a list never flashes an empty state.

**Use it when** a query is paginated with an `identifier` per page.
**Not when** you just want to avoid a flicker on a non-paginated query — a query
already keeps its previous value while loading, with no configuration
([query](/guide/state/server-state)).

```typescript
import { insertPaginationPlaceholderData } from '@craft-ng/core';
```

## The common case

It is a **higher-order insertion**: call it with a config and pass the result to
`query`. `config.initialValue` is both the default value and the page type —
which is why `currentPageData` is a `Signal<T>` that is **never `undefined`**.

```typescript
const pagination = signal(1);

const { userQuery } = query(
  'userQuery',
  {
    params: pagination,
    identifier: (params) => '' + params,
    loader: function* ({ params }) {
      const response = yield* CraftHttpClient.get(({ response }) => ({
        url: `/api/users?page=${params}`,
        success: response<User[]>(),
      }));
      return response.json();
    },
  },
  insertPaginationPlaceholderData({ initialValue: [] as User[] }),
);

// Access the current page data (or placeholder data during loading)
const data = userQuery.currentPageData();

// Check the loading status of the current page
const status = userQuery.currentPageStatus();

// Determine if placeholder data is being shown
const isPlaceholder = userQuery.isPlaceHolderData();

// Get the current page identifier
const identifier = userQuery.currentIdentifier();
```

## Returned Properties

| Property            | Type                     | Description                                                                                                                                 |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentPageData`   | `Signal<T>`              | The data for the current page, or placeholder data from the previous page during loading. Falls back to `initialValue` (never `undefined`). |
| `currentPageStatus` | `Signal<ResourceStatus>` | The loading status of the current page (`'idle'`, `'loading'`, `'resolved'`, `'error'`)                                                     |
| `isPlaceHolderData` | `Signal<boolean>`        | `true` when showing previous page data as a placeholder                                                                                     |
| `currentIdentifier` | `Signal<string>`         | The identifier of the current page                                                                                                          |

## Custom Outputs (`build` callback)

Pass an optional second argument to attach your own computed values or methods next to
the pagination outputs. Its helpers (`state`, `set`, `update`, `patch`) are scoped to the
**current page** (the displayed data), so mutations only affect the page the user is
looking at — other cached pages are left untouched.

```typescript
const { usersQuery } = query(
  'usersQuery',
  {
    params: this.pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  insertPaginationPlaceholderData(
    { initialValue: [] as Data[] },
    ({ state, set }) => ({
      // a computed derived from the current page
      totalOfUnCompletedData: computed(
        () => state().filter((d) => !d.completed).length,
      ),
      // a method that mutates only the current page
      markAsCompleted: (id: string) =>
        set(state().map((d) => (d.id === id ? { ...d, completed: true } : d))),
    }),
  ),
);

usersQuery.totalOfUnCompletedData(); // Signal<number>
usersQuery.markAsCompleted('42');
```

The `build` context exposes:

| Helper   | Type                                    | Description                                          |
| -------- | --------------------------------------- | ---------------------------------------------------- |
| `state`  | `Signal<T>`                             | The current page data (or `initialValue`)            |
| `set`    | `(value: T) => T`                       | Replace the current page data (no-op if not loaded)  |
| `update` | `(fn: (current: T) => T) => T`          | Update the current page data from its previous value |
| `patch`  | `(fn: (current: T) => Partial<T>) => T` | Patch the current page data with a partial value     |

The pagination outputs (`currentPageData`, `currentPageStatus`, `isPlaceHolderData`,
`currentIdentifier`) are also available in the `build` context.

::: details A full paginated component

```typescript
import { button, craftComponent, div, each, span } from '@craft-ng/component';
import { query, state } from '@craft-ng/core';

export const UsersList = craftComponent(
  'UsersList',
  {},
  function* () {
    const { page } = yield* state('page', 1, ({ state, update, set }) => ({
      next: () => update((value) => value + 1),
      previous: () => set(Math.max(1, state() - 1)),
    }));

    const { userQuery } = yield* query(
      'userQuery',
      {
        params: page,
        identifier: (page) => `page-${page}`,
        loader: async ({ params }) =>
          (await fetch(`/api/users?page=${params}`)).json() as Promise<User[]>,
      },
      insertPaginationPlaceholderData({ initialValue: [] as User[] }),
    );

    return { page, userQuery };
  },
  ({ page, userQuery }) => [
    div(
      { class: () => (userQuery.isPlaceHolderData() ? 'users-list loading' : 'users-list') },
      each(
        () => userQuery.currentPageData(),
        { track: (user) => user.id },
        (user) => UserCard({ user: () => user }),
      ),
    ),

    div({ class: 'pagination' }, [
      button({ click: page.previous, disabled: () => page() === 1 }, 'Previous'),
      span(() => `Page ${page()}`),
      button({ click: page.next }, 'Next'),
    ]),

    userQuery.isPlaceHolderData()
      ? div({ class: 'loading-indicator' }, 'Loading new page…')
      : [],
  ],
);
```

:::

## How it works

1. When the page parameters change, the insertion checks whether the new page's
   data is already cached.
2. If the new page is loading and has no data yet, it serves the previous page's
   data as a placeholder.
3. `isPlaceHolderData` tells you that is what is on screen — use it to dim the
   list or show a spinner.
4. Once the real data arrives, it switches over automatically.

## Pitfalls

**It needs an `identifier`.** Without one page identity, there is no "previous
page" to fall back to.

**`initialValue` defines the page type.** Passing `[]` untyped collapses
`currentPageData` to `never[]` — write `[] as User[]`.

**Mutating through the `build` helpers only affects the current page.** Other
cached pages are untouched, which is usually what you want, but means a global
change needs a reload.

## See Also

- [query](/guide/state/server-state) — the base primitive
- [Reacting to mutations](/guide/state/react-on-mutation)
- [Insertions](/guide/concepts/insertions)
