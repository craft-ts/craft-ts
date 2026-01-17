# craftInputs

Enable dynamic parameter injection from components into craft stores.

## Import

```typescript
import { craft, craftInputs } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInputs({
    userId: undefined as string | undefined,
  }),
  craftQuery('user', ({ userId }) =>
    query({
      params: userId, // Uses the input signal directly
      loader: async ({ params }) => {
        if (!params) return undefined;
        const response = await fetch(`/api/users/${params}`);
        return response.json();
      },
    }),
  ),
);

// In a component
@Component({
  selector: 'app-user-profile',
  template: `
    @if (store.user.value()) {
      <div>{{ store.user.value().name }}</div>
    }
  `,
})
export class UserProfileComponent {
  route = inject(ActivatedRoute);

  // Create signal from route param
  userId = toSignal(this.route.params.pipe(map((p) => p['id'])));

  // Inject store with input
  store = injectCraft({
    inputs: {
      userId: this.userId, // Pass the signal
    },
  });
}

// Query automatically executes when userId changes
```

## Multiple Inputs

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInputs({
    categoryId: undefined as string | undefined,
    page: 1,
    pageSize: 10,
    sortBy: 'name' as 'name' | 'price' | 'date',
  }),
  craftQuery('products', ({ categoryId, page, pageSize, sortBy }) =>
    query({
      params: () => ({
        category: categoryId(),
        page: page(),
        pageSize: pageSize(),
        sortBy: sortBy(),
      }),
      loader: async ({ params }) => {
        const query = new URLSearchParams({
          category: params.category ?? '',
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
        });
        const response = await fetch(`/api/products?${query}`);
        return response.json();
      },
    }),
  ),
);

// In a component
export class ProductListComponent {
  categoryId = signal<string | undefined>('electronics');
  page = signal(1);
  pageSize = signal(20);
  sortBy = signal<'name' | 'price' | 'date'>('price');

  store = injectCraft({
    inputs: {
      categoryId: this.categoryId,
      page: this.page,
      pageSize: this.pageSize,
      sortBy: this.sortBy,
    },
  });

  changePage(newPage: number) {
    this.page.set(newPage);
    // Query automatically re-executes with new page
  }

  changeSort(field: 'name' | 'price' | 'date') {
    this.sortBy.set(field);
    // Query automatically re-executes with new sort
  }
}
```

## Optional Inputs

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftInputs({
    searchTerm: undefined as string | undefined,
  }),
  craftQuery('results', ({ searchTerm }) =>
    query({
      params: searchTerm,
      loader: async ({ params }) => {
        // Only execute if search term is provided
        if (!params) return [];

        const response = await fetch(`/api/search?q=${params}`);
        return response.json();
      },
    }),
  ),
);

// In a component
export class SearchComponent {
  searchTerm = signal<string | undefined>(undefined);

  store = injectCraft({
    inputs: {
      searchTerm: this.searchTerm,
    },
  });

  search(term: string) {
    this.searchTerm.set(term);
    // Query executes only when searchTerm has a value
  }
}
```

## Key Features

- **Dynamic parameters**: Pass component-specific data to queries
- **Reactive updates**: Queries re-execute when input signals change
- **Type safety**: TypeScript enforces providing all required inputs
- **Optional inputs**: Support `undefined` for conditional query execution
- **Multi-instance**: Create store instances with different configurations

## See Also

- [craftQuery](/store/craft-query) - Use inputs in queries
- [craft](/store/craft) - Base store creation
