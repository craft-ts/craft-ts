````markdown
# insertPaginationPlaceholderData

The `insertPaginationPlaceholderData` insertion provides placeholder data during pagination transitions, showing the previous page's data while the new page is loading. This creates a smoother user experience by avoiding empty states during page navigation.

## Import

```typescript
import { insertPaginationPlaceholderData } from '@craft-ng/core';
```

## Basic Usage

```typescript
const pagination = signal(1);

const userQuery = query(
  {
    params: pagination,
    identifier: (params) => '' + params,
    loader: async ({ params: page }) => {
      return fetchUsers(page);
    },
  },
  insertPaginationPlaceholderData,
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

| Property            | Type                     | Description                                                                              |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `currentPageData`   | `Signal<T \| undefined>` | The data for the current page, or placeholder data from the previous page during loading |
| `currentPageStatus` | `Signal<ResourceStatus>` | The loading status of the current page (`'idle'`, `'loading'`, `'resolved'`, `'error'`)  |
| `isPlaceHolderData` | `Signal<boolean>`        | `true` when showing previous page data as a placeholder                                  |
| `currentIdentifier` | `Signal<string>`         | The identifier of the current page                                                       |

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
        return response.json();
      },
    },
    insertPaginationPlaceholderData,
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

- [query](/primitives/query) - Base primitive for queries
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutations
- [craftService](/store/craft-service) - Compose paginated queries inside reusable services
````
