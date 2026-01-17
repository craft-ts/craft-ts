# queryParam

The `queryParam` primitive creates a reactive query parameter manager that synchronizes state with URL query parameters.

## Import

```typescript
import { queryParam } from '@ngcraft/core';
```

## Basic Examples

### Basic usage with pagination

```typescript
const myQueryParams = queryParam(
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
const myQueryParams = queryParam(
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

## API

### Configuration

```typescript
queryParam({
  state: {
    paramName: {
      fallbackValue: defaultValue,
      parse: (stringValue) => typedValue,
      serialize: (typedValue) => stringValue,
    },
    // ... more params
  },
  // Optional navigation options
  queryParamsHandling: 'merge' | 'preserve' | '',
  onSameUrlNavigation: 'reload' | 'ignore',
  replaceUrl: boolean,
  skipLocationChange: boolean,
});
```

### State Access

```typescript
const params = queryParam(config);

// Read full state
params(); // { page: 1, pageSize: 10 }

// Read individual params
params.page(); // 1
params.pageSize(); // 10
```

## Important Notes

⚠️ **Injection Context**: This function must be called within an injection context. If called outside, it will only return an object containing the configuration under `_config`.

⚠️ **Methods bound to sources** using `afterRecomputation` are not exposed in the output.

## Common Patterns

### Search filters

```typescript
const filters = queryParam({
  state: {
    q: { fallbackValue: '', parse: String, serialize: String },
    category: { fallbackValue: 'all', parse: String, serialize: String },
    minPrice: { fallbackValue: 0, parse: parseInt, serialize: String },
  },
});
```

### Array parameters

```typescript
const filters = queryParam({
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
const options = queryParam({
  state: {
    showArchived: {
      fallbackValue: false,
      parse: (value) => value === 'true',
      serialize: (value) => String(value),
    },
  },
});
```

## Best Practices

✅ **Use meaningful fallback values**
✅ **Parse and serialize consistently**
✅ **Expose methods via insertions** for convenience
✅ **Use merge strategy** to preserve other query params
✅ **Type your parameters** properly

## See Also

- [state](/primitives/state) - For non-URL state
- [Store QueryParams](/store/craft-query-params) - For store integration

### serialize

Custom serializer to URL string:

```typescript
const filters = queryParam<string[]>('filters', [], {
  serialize: (value: string[]) => JSON.stringify(value),
});
```

## Use Cases

### Pagination

```typescript
const page = queryParam('page', 1);
const pageSize = queryParam('size', 20);

// URL: ?page=1&size=20
```

### Search & Filtering

```typescript
const searchQuery = queryParam('q', '');
const category = queryParam('cat', '');
const minPrice = queryParam('min', 0);
const maxPrice = queryParam('max', 1000);

// URL: ?q=laptop&cat=electronics&min=500&max=1500
```

### Sorting

```typescript
const sortBy = queryParam('sort', 'name');
const sortOrder = queryParam<'asc' | 'desc'>('order', 'asc');

// URL: ?sort=price&order=desc
```

### Tab Selection

```typescript
const activeTab = queryParam('tab', 'overview');

// URL: ?tab=settings
```

## Best Practices

✅ **Use meaningful param names** - Short but descriptive (q, page, sort)
✅ **Provide sensible defaults** - Ensure app works without params
✅ **Debounce search inputs** - Avoid excessive history entries
✅ **Use replaceState wisely** - For filters that shouldn't create history
✅ **Type your parameters** - Use parse/serialize for complex types
✅ **Keep URLs shareable** - Ensure all relevant state is in URL

## See Also

- [state](/primitives/state) - For non-URL state
- [Store QueryParams](/store/craft-query-params) - For store integration
- [Examples](/examples) - See queryParam in action
