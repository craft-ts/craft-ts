# craftSetAllQueriesParamsStandalone

Create a standalone method to set all query parameters at once for Angular Router navigation.

## Import

```typescript
import { craft, craftSetAllQueriesParamsStandalone } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft, setAllMyStoreQueryParams } = craft(
  { name: 'MyStore', providedIn: 'root' },
  craftQueryParam('pagination', () =>
    queryParam({
      state: {
        page: {
          fallbackValue: 1,
          parse: (v: string) => parseInt(v, 10),
          serialize: (v: unknown) => String(v),
        },
        pageSize: {
          fallbackValue: 10,
          parse: (v: string) => parseInt(v, 10),
          serialize: (v: unknown) => String(v),
        },
      },
    }),
  ),
  craftQueryParam('filter', () =>
    queryParam({
      state: {
        search: {
          fallbackValue: '',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
        active: {
          fallbackValue: false,
          parse: (v: string) => v === 'true',
          serialize: (v: unknown) => String(v),
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

// In a component
const router = inject(Router);

function goToPage(page: number) {
  router.navigate(['/items'], {
    queryParams: setAllMyStoreQueryParams({
      pagination: { page, pageSize: 20 },
      filter: { search: 'angular', active: true },
    }),
  });
  // URL: /items?page=5&pageSize=20&search=angular&active=true
}
```

## Use with router.navigate

```typescript
const { setAllProductQueryParams } = craft(
  { name: 'Product', providedIn: 'root' },
  craftQueryParam('filters', () =>
    queryParam({
      state: {
        category: {
          fallbackValue: 'all',
          parse: (v: string) => v,
          serialize: (v: unknown) => String(v),
        },
        minPrice: {
          fallbackValue: 0,
          parse: (v: string) => Number(v),
          serialize: (v: unknown) => String(v),
        },
        maxPrice: {
          fallbackValue: 1000,
          parse: (v: string) => Number(v),
          serialize: (v: unknown) => String(v),
        },
      },
    }),
  ),
  craftQueryParam('view', () =>
    queryParam({
      state: {
        layout: {
          fallbackValue: 'grid',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

// Navigate with all query params
const router = inject(Router);

router.navigate(['/products'], {
  queryParams: setAllProductQueryParams({
    filters: { category: 'electronics', minPrice: 100, maxPrice: 500 },
    view: { layout: 'list' },
  }),
});
// URL: /products?category=electronics&minPrice=100&maxPrice=500&layout=list
```

## Use with navigateByUrl

The returned object has a `toString()` method for use with `navigateByUrl`.

```typescript
const { setAllBlogQueryParams } = craft(
  { name: 'Blog', providedIn: 'root' },
  craftQueryParam('sorting', () =>
    queryParam({
      state: {
        sortBy: {
          fallbackValue: 'date',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
        order: {
          fallbackValue: 'desc' as 'asc' | 'desc',
          parse: (v: string) => v as 'asc' | 'desc',
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

const router = inject(Router);

function goToPosts() {
  const params = setAllBlogQueryParams({
    sorting: { sortBy: 'title', order: 'asc' },
  });

  // Use toString() for navigateByUrl
  router.navigateByUrl(`/posts?${params}`);
  // URL: /posts?sortBy=title&order=asc
}
```

## Use with routerLink

```typescript
@Component({
  selector: 'app-products',
  template: `
    <a [routerLink]="['/products']" [queryParams]="listViewParams">
      List View
    </a>
    <a [routerLink]="['/products']" [queryParams]="gridViewParams">
      Grid View
    </a>
  `,
})
export class ProductsComponent {
  private { setAllProductQueryParams } = craft(
    { name: 'Product', providedIn: 'root' },
    craftQueryParam('display', () =>
      queryParam({
        state: {
          view: {
            fallbackValue: 'grid',
            parse: (v: string) => v,
            serialize: (v: unknown) => v,
          },
          perPage: {
            fallbackValue: 12,
            parse: (v: string) => Number(v),
            serialize: (v: unknown) => String(v),
          },
        },
      })
    ),
    craftSetAllQueriesParamsStandalone()
  );

  listViewParams = setAllProductQueryParams({
    display: { view: 'list', perPage: 24 },
  });

  gridViewParams = setAllProductQueryParams({
    display: { view: 'grid', perPage: 12 },
  });
}
```

## Generating Shareable Links

```typescript
const { injectCraft, setAllArticleQueryParams } = craft(
  { name: 'Article', providedIn: 'root' },
  craftQueryParam('reader', () =>
    queryParam({
      state: {
        fontSize: {
          fallbackValue: 16,
          parse: (v: string) => Number(v),
          serialize: (v: unknown) => String(v),
        },
        theme: {
          fallbackValue: 'light',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

const store = injectCraft();

function getShareableLink(): string {
  const params = setAllArticleQueryParams({
    reader: {
      fontSize: store.readerFontSize(),
      theme: store.readerTheme(),
    },
  });

  return `${window.location.origin}/article/123?${params}`;
  // Returns: https://example.com/article/123?fontSize=18&theme=dark
}
```

## Type Safety

TypeScript enforces providing all query param groups.

```typescript
const { setAllShopQueryParams } = craft(
  { name: 'Shop', providedIn: 'root' },
  craftQueryParam('filters', () =>
    queryParam({
      state: {
        category: {
          fallbackValue: 'all',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftQueryParam('sort', () =>
    queryParam({
      state: {
        by: {
          fallbackValue: 'name',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

// ✓ Type-safe: all required groups provided
const queryParams = setAllShopQueryParams({
  filters: { category: 'electronics' },
  sort: { by: 'price' },
});

// ✗ TypeScript error if missing a group:
// const incomplete = setAllShopQueryParams({
//   filters: { category: 'electronics' },
//   // Error: Property 'sort' is missing
// });
```

## Conditional Query Params

```typescript
const { setAllSearchQueryParams } = craft(
  { name: 'Search', providedIn: 'root' },
  craftQueryParam('query', () =>
    queryParam({
      state: {
        q: {
          fallbackValue: '',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
        page: {
          fallbackValue: 1,
          parse: (v: string) => Number(v),
          serialize: (v: unknown) => String(v),
        },
      },
    }),
  ),
  craftQueryParam('advanced', () =>
    queryParam({
      state: {
        dateFrom: {
          fallbackValue: '',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
        dateTo: {
          fallbackValue: '',
          parse: (v: string) => v,
          serialize: (v: unknown) => v,
        },
      },
    }),
  ),
  craftSetAllQueriesParamsStandalone(),
);

function searchWithFilters(searchTerm: string, useAdvanced: boolean) {
  const router = inject(Router);

  router.navigate(['/search'], {
    queryParams: setAllSearchQueryParams({
      query: { q: searchTerm, page: 1 },
      advanced: useAdvanced
        ? { dateFrom: '2024-01-01', dateTo: '2024-12-31' }
        : { dateFrom: '', dateTo: '' }, // Use fallback values
    }),
  });
}
```

## Naming Convention

- Generated method: `setAll{StoreName}QueryParams`
- Example: For store named "MyStore" → `setAllMyStoreQueryParams`

## Key Features

- **Batch updates**: Set all query params in one operation
- **Type safety**: TypeScript enforces all query param groups
- **Router integration**: Works with `navigate()`, `navigateByUrl()`, `routerLink`
- **toString() method**: Convert to query string for URLs
- **Flat output**: Returns flat object of strings for router
- **Deep linking**: Generate shareable URLs with complete state

## Requirements

- Must be used after all `craftQueryParam()` definitions
- Each query param must define a `state` with parse/serialize/fallbackValue

## See Also

- [craftQueryParam](/store/craft-query-params) - Define individual query params
- [craft](/store/craft) - Base store creation
