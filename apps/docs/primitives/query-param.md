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

## See Also

- [state](/primitives/state) - For non-URL state
- [Store QueryParams](/store/craft-query-params) - For store integration
