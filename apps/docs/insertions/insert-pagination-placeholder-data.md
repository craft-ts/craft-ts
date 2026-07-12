# insertPaginationPlaceholderData

The `insertPaginationPlaceholderData` insertion provides placeholder data during pagination transitions, showing the previous page's data while the new page is loading. This creates a smoother user experience by avoiding empty states during page navigation.

## Import

```typescript
import { insertPaginationPlaceholderData } from '@craft-ng/core';
```

## Basic Usage

`insertPaginationPlaceholderData` is a **higher-order insertion**: call it with a
`config` object and pass the result to `query`. The `config.initialValue` is both the
default value and the page type — thanks to it, `currentPageData` is `Signal<T>` and is
**never `undefined`**.

```typescript
const pagination = signal(1);

const userQuery = query(
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

| Property            | Type                     | Description                                                                                            |
| ------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `currentPageData`   | `Signal<T>`              | The data for the current page, or placeholder data from the previous page during loading. Falls back to `initialValue` (never `undefined`). |
| `currentPageStatus` | `Signal<ResourceStatus>` | The loading status of the current page (`'idle'`, `'loading'`, `'resolved'`, `'error'`)               |
| `isPlaceHolderData` | `Signal<boolean>`        | `true` when showing previous page data as a placeholder                                               |
| `currentIdentifier` | `Signal<string>`         | The identifier of the current page                                                                    |

## Custom Outputs (`build` callback)

Pass an optional second argument to attach your own computed values or methods next to
the pagination outputs. Its helpers (`state`, `set`, `update`, `patch`) are scoped to the
**current page** (the displayed data), so mutations only affect the page the user is
looking at — other cached pages are left untouched.

```typescript
const usersQuery = query(
  {
    params: this.pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiServiceToYield.getDataList(params);
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

| Helper   | Type                                                  | Description                                            |
| -------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `state`  | `Signal<T>`                                           | The current page data (or `initialValue`)              |
| `set`    | `(value: T) => T`                                     | Replace the current page data (no-op if not loaded)    |
| `update` | `(fn: (current: T) => T) => T`                        | Update the current page data from its previous value   |
| `patch`  | `(fn: (current: T) => Partial<T>) => T`               | Patch the current page data with a partial value       |

The pagination outputs (`currentPageData`, `currentPageStatus`, `isPlaceHolderData`,
`currentIdentifier`) are also available in the `build` context.

## Example with Pagination

```typescript
@Component({
  template: `
    <div class="users-list" [class.loading]="userQuery.isPlaceHolderData()">
      @for (user of userQuery.currentPageData(); track user.id) {
        <user-card [user]="user" />
      }
    </div>

    <div class="pagination">
      <button (click)="prevPage()" [disabled]="page() === 1">Previous</button>
      <span>Page {{ page() }}</span>
      <button (click)="nextPage()">Next</button>
    </div>

    @if (userQuery.isPlaceHolderData()) {
      <div class="loading-indicator">Loading new page...</div>
    }
  `,
})
export class UsersListComponent {
  page = signal(1);

  userQuery = query(
    {
      params: this.page,
      identifier: (page) => `page-${page}`,
      loader: async ({ params: page }) => {
        const response = await fetch(`/api/users?page=${page}`);
        return response.json() as Promise<User[]>;
      },
    },
    insertPaginationPlaceholderData({ initialValue: [] as User[] }),
  );

  nextPage() {
    this.page.update((p) => p + 1);
  }

  prevPage() {
    this.page.update((p) => Math.max(1, p - 1));
  }
}
```

## How It Works

1. When the page parameters change, the insertion checks if the new page's data is already cached
2. If the new page is loading and has no data yet, it returns the previous page's data as a placeholder
3. The `isPlaceHolderData` signal indicates when placeholder data is being used
4. Once the new page data is loaded, it automatically switches to showing the real data

## See Also

- [insertPipe](/insertions/pipe-insertions) - Compose several insertions on one primitive
- [query](/primitives/query) - Base primitive for queries
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutations
- [craftService](/store/craft-service) - Compose paginated queries inside reusable services
