# Collections

`insertEntities` generates typed collection methods — add, remove, update,
upsert — directly on a primitive holding an array of entities, including arrays
nested inside an object.

**Use it when** a state, query or queryParams holds a list you mutate by id.
**Not when** the list is read-only, or when the operation concerns one nested
branch rather than the collection — that is
[`insertSelect`](/guide/state/select).

## Import

```typescript
import { insertEntities } from '@craft-ts/core';
import {
  addOne,
  addMany,
  removeOne,
  removeMany,
  setOne,
  setMany,
  setAll,
  updateOne,
  updateMany,
  upsertOne,
  upsertMany,
  removeAll,
} from '@craft-ts/core';
```

## Overview

`insertEntities` bridges entity utility functions with reactive primitives by:

- **Adding methods** - Automatically generates typed methods from entity utilities
- **Path support** - Works with nested properties using dot notation
- **Custom identifiers** - Supports custom ID selectors beyond default `id` property
- **Parallel queries** - Enables entity manipulation in query instances with `select` parameter
- **Type inference** - Full TypeScript support with automatic method name generation

::: warning
This API currently promotes state imperative change. I am planning to improve this in the future, in order to keep state as much as I can declarative.
:::

## Entity Utilities

The following entity utility functions can be used with `insertEntities`:

| Utility      | Description                               |
| ------------ | ----------------------------------------- |
| `addOne`     | Adds a single entity to the end           |
| `addMany`    | Adds multiple entities to the end         |
| `setOne`     | Replaces or adds an entity by ID          |
| `setMany`    | Replaces or adds multiple entities by ID  |
| `setAll`     | Replaces the entire collection            |
| `updateOne`  | Partially updates an entity by ID         |
| `updateMany` | Partially updates multiple entities by ID |
| `upsertOne`  | Updates if exists, otherwise adds         |
| `upsertMany` | Updates multiple if exist, otherwise adds |
| `removeOne`  | Removes a single entity by ID             |
| `removeMany` | Removes multiple entities by ID           |
| `removeAll`  | Clears the entire collection              |

## Signature

```typescript
function insertEntities<State, K, EntityHelperFns, Path>(config: {
  methods: EntityHelperFns;
  identifier?: IdSelector<Entity, K>;
  path?: Path; // For nested arrays in objects
}): Insertion;
```

## Parameters

### `methods`

Array of entity utility functions to expose as methods on the state/query.

### `identifier` (optional)

Custom function to extract the unique identifier from entities. Defaults to:

- For objects with `id` property: `(entity) => entity.id`
- For primitives (string/number): `(entity) => entity`

### `path` (optional)

Dot-notation path to a nested array property. When provided, method names are prefixed with the camelCase path.

**Example:** `path: 'catalog.products'` → methods like `catalogProductsAddOne()`

## Method Naming

- **Without path**: Method names match utility function names (e.g., `addOne`, `removeMany`)
- **With path**: Method names are prefixed with camelCase path (e.g., `productsAddOne`, `catalogProductsRemoveMany`)

## The common case

```typescript
import {
  state,
  insertEntities,
  addOne,
  addMany,
  removeOne,
} from '@craft-ts/core';

const { tags } = state(
  'tags',
  [] as string[],
  insertEntities({
    methods: [addOne, addMany, removeOne],
  }),
);

// Add single tag
tags.addOne({ entity: 'typescript' });
console.log(tags()); // ['typescript']

// Add multiple tags
tags.addMany({ newEntities: ['angular', 'signals'] });
console.log(tags()); // ['typescript', 'angular', 'signals']

// Remove tag
tags.removeOne({ id: 'typescript' });
console.log(tags()); // ['angular', 'signals']
```


::: details More examples — nested paths, queries, CRUD, URL state
#### Managing objects with default ID

```typescript
import {
  state,
  insertEntities,
  addOne,
  setOne,
  removeOne,
} from '@craft-ts/core';

interface Product {
  id: string;
  name: string;
  price: number;
}

const { products } = state(
  'products',
  [] as Product[],
  insertEntities({
    methods: [addOne, setOne, removeOne],
  }),
);

// Add product
products.addOne({
  entity: { id: '1', name: 'Laptop', price: 999 },
});

// Replace or update product
products.setOne({
  entity: { id: '1', name: 'Laptop Pro', price: 1299 },
});

console.log(products()); // [{ id: '1', name: 'Laptop Pro', price: 1299 }]

// Remove product
products.removeOne({ id: '1' });
console.log(products()); // []
```

#### Using custom identifier

```typescript
import { state, insertEntities, setOne, removeOne } from '@craft-ts/core';

interface User {
  uuid: string;
  name: string;
  email: string;
}

const { users } = state(
  'users',
  [] as User[],
  insertEntities({
    methods: [setOne, removeOne],
    identifier: (user) => user.uuid,
  }),
);

users.setOne({
  entity: { uuid: 'abc-123', name: 'Alice', email: 'alice@example.com' },
});

users.setOne({
  entity: { uuid: 'abc-123', name: 'Alice Smith', email: 'alice@example.com' },
});

console.log(users());
// [{ uuid: 'abc-123', name: 'Alice Smith', email: 'alice@example.com' }]

users.removeOne({ id: 'abc-123' });
console.log(users()); // []
```

#### Working with nested arrays using path

```typescript
import { state, insertEntities, addMany, removeOne } from '@craft-ts/core';

interface Catalog {
  total: number;
  products: Array<{ id: string; name: string }>;
}

const { catalog } = state(
  'catalog',
  {
    total: 0,
    products: [],
  } as Catalog,
  insertEntities({
    methods: [addMany, removeOne],
    path: 'products',
  }),
);

// Methods are prefixed with "products"
catalog.productsAddMany({
  newEntities: [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
  ],
});

console.log(catalog());
// { total: 0, products: [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }] }

catalog.productsRemoveOne({ id: '1' });
console.log(catalog());
// { total: 0, products: [{ id: '2', name: 'Item 2' }] }
```

#### Deep nested path with dot notation

```typescript
import { state, insertEntities, addMany } from '@craft-ts/core';

interface State {
  catalog: {
    featured: {
      products: Array<{ id: string; name: string }>;
    };
  };
}

const { store } = state(
  'store',
  {
    catalog: {
      featured: {
        products: [],
      },
    },
  } as State,
  insertEntities({
    methods: [addMany],
    path: 'catalog.featured.products',
  }),
);

// Method is prefixed with camelCase: catalogFeaturedProducts
store.catalogFeaturedProductsAddMany({
  newEntities: [{ id: '1', name: 'Featured Item' }],
});

console.log(store().catalog.featured.products);
// [{ id: '1', name: 'Featured Item' }]
```

#### Using with query primitive

```typescript
import { query, insertEntities, addMany, removeOne } from '@craft-ts/core';

interface Product {
  id: string;
  name: string;
}

const { productsQuery } = query(
  'productsQuery',
  {
    params: () => 'all',
    loader: async () => {
      const response = await fetch('/api/products');
      return response.json() as Product[];
    },
  },
  insertEntities({
    methods: [addMany, removeOne],
  }),
);

// After query loads, manipulate the cached data
await productsQuery.load();

// Add optimistic product
productsQuery.addMany({
  newEntities: [{ id: 'temp-1', name: 'New Product' }],
});

// Remove product from cache
productsQuery.removeOne({ id: 'temp-1' });
```

#### Working with parallel queries

```typescript
import { query, insertEntities, addOne } from '@craft-ts/core';

const { userQuery } = query(
  'userQuery',
  {
    params: () => 'userId',
    identifier: (params) => params, // Track multiple query instances
    loader: async ({ params }) => {
      const response = await fetch(`/api/users/${params}/posts`);
      return response.json();
    },
  },
  insertEntities({
    methods: [addOne],
  }),
);

// Manipulate specific query instance with select parameter
userQuery.addOne({
  select: 'user-123', // Target specific query instance
  entity: { id: 'post-1', title: 'New Post' },
});
```

#### Update operations

```typescript
import { state, insertEntities, updateOne, updateMany } from '@craft-ts/core';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const { todos } = state(
  'todos',
  [
    { id: '1', title: 'Learn Angular', completed: false },
    { id: '2', title: 'Build app', completed: false },
  ] as Todo[],
  insertEntities({
    methods: [updateOne, updateMany],
  }),
);

// Update single todo
todos.updateOne({
  update: {
    id: '1',
    changes: { completed: true },
  },
});

console.log(todos()[0].completed); // true

// Update multiple todos
todos.updateMany({
  updates: [
    { id: '1', changes: { title: 'Learn Angular Signals' } },
    { id: '2', changes: { completed: true } },
  ],
});
```

#### Upsert operations

```typescript
import { state, insertEntities, upsertOne, upsertMany } from '@craft-ts/core';

interface Settings {
  key: string;
  value: string;
}

const { settings } = state(
  'settings',
  [{ key: 'theme', value: 'dark' }] as Settings[],
  insertEntities({
    methods: [upsertOne, upsertMany],
    identifier: (setting) => setting.key,
  }),
);

// Updates existing or adds new
settings.upsertOne({
  entity: { key: 'theme', value: 'light' },
});

console.log(settings());
// [{ key: 'theme', value: 'light' }]

settings.upsertMany({
  newEntities: [
    { key: 'theme', value: 'auto' },
    { key: 'language', value: 'en' },
  ],
});

console.log(settings());
// [
//   { key: 'theme', value: 'auto' },
//   { key: 'language', value: 'en' }
// ]
```

#### Complete CRUD example

```typescript
import {
  state,
  insertEntities,
  addOne,
  setOne,
  updateOne,
  removeOne,
  setAll,
} from '@craft-ts/core';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

const { tasks } = state(
  'tasks',
  [] as Task[],
  insertEntities({
    methods: [addOne, setOne, updateOne, removeOne, setAll],
  }),
);

// Create
tasks.addOne({
  entity: {
    id: '1',
    title: 'Review code',
    completed: false,
    priority: 'high',
  },
});

// Read - use tasks() to access the array

// Update
tasks.updateOne({
  update: {
    id: '1',
    changes: { completed: true },
  },
});

// Replace
tasks.setOne({
  entity: {
    id: '1',
    title: 'Review and merge code',
    completed: true,
    priority: 'high',
  },
});

// Delete
tasks.removeOne({ id: '1' });

// Replace all
tasks.setAll({
  newEntities: [
    { id: '2', title: 'New task', completed: false, priority: 'medium' },
  ],
});
```

#### Using with queryParams

```typescript
import { queryParams, insertEntities, addOne, removeOne } from '@craft-ts/core';

const { filters } = queryParams(
  'filters',
  {
    state: {
      selectedIds: {
        fallbackValue: [] as string[],
        codec: {
          decode: (value) => value.split(',').filter(Boolean),
          encode: (value) => (value as string[]).join(','),
        },
      },
    },
  },
  insertEntities({
    methods: [addOne, removeOne],
    path: 'selectedIds',
  }),
);

// Methods update queryParams state and URL
filters.selectedIdsAddOne({ entity: 'item-1' });
// URL: ?selectedIds=item-1

filters.selectedIdsAddOne({ entity: 'item-2' });
// URL: ?selectedIds=item-1,item-2

filters.selectedIdsRemoveOne({ id: 'item-1' });
// URL: ?selectedIds=item-2
```
:::

## Pitfalls

**Declaring every utility "just in case".** `methods` decides the generated API;
listing all twelve gives every consumer twelve methods to ignore. List what you
use.

**Picking the wrong operation.** `add` appends blindly, `set` replaces by id,
`upsert` does whichever applies. Choosing `addOne` where you meant `upsertOne`
produces duplicates that only show up with real data.

**Mutating the array directly.** The generated methods are immutable updates;
bypassing them breaks change detection.

**Deep `path` values.** If the path is getting long, the state shape is probably
the problem — consider flattening it.

## Type Safety

`insertEntities` provides full type inference:

```typescript
interface Product {
  id: string;
  name: string;
  price: number;
}

const { products } = state(
  'products',
  [] as Product[],
  insertEntities({
    methods: [addOne, updateOne],
  }),
);

// ✅ TypeScript knows entity must be Product
products.addOne({ entity: { id: '1', name: 'Item', price: 100 } });

// ❌ TypeScript error - missing required properties
products.addOne({ entity: { id: '1' } });

// ✅ TypeScript knows changes are Partial<Product>
products.updateOne({
  update: { id: '1', changes: { price: 120 } },
});

// ❌ TypeScript error - invalid property
products.updateOne({
  update: { id: '1', changes: { invalid: true } },
});
```

## See Also

- [Collection utilities](/guide/state/collections-utils) — the underlying functions
- [Selecting a sub-state](/guide/state/select) — for one branch rather than the list
- [Insertions](/guide/concepts/insertions)
