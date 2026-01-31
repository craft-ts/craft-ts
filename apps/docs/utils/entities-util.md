# Entities Utilities

A collection of generic utility functions to manipulate arrays of entities in an immutable way. These utilities are inspired by NgRx Entity adapter patterns.

## Types

### IdSelector

A function type that extracts the identifier from an entity.

```typescript
type IdSelector<T, K = string | number> = (entity: T) => K;
```

### Update

A type for partial updates containing an id and the changes to apply.

```typescript
type Update<T, K = string | number> = {
  id: K;
  changes: Partial<T>;
};
```

## Optional Identifier

For entities that have an `id` property, the `identifier` parameter is **optional**. The functions will automatically use the `id` property.

For entities without an `id` property, you must provide a custom `identifier` function.

```typescript
// Entity with id property - identifier is optional
interface User {
  id: number;
  name: string;
}

const users: User[] = [{ id: 1, name: 'Alice' }];
removeOne({ id: 1, entities: users }); // ✅ OK - no identifier needed

// Entity without id property - identifier is required
interface Product {
  sku: string;
  name: string;
}

const products: Product[] = [{ sku: 'A1', name: 'Widget' }];
removeOne({ id: 'A1', entities: products, identifier: (p) => p.sku }); // ✅ OK
```

## Usage Example

```typescript
import {
  addOne,
  addMany,
  updateOne,
  removeOne,
  upsertOne,
} from '@anthropic/craft';

interface User {
  id: number;
  name: string;
  email: string;
}

let users: User[] = [];

// Add a single user
users = addOne({
  entity: { id: 1, name: 'Alice', email: 'alice@example.com' },
  entities: users,
});

// Add multiple users
users = addMany({
  newEntities: [
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' },
  ],
  entities: users,
});

// Update a user (no identifier needed - User has id property)
users = updateOne({
  update: { id: 1, changes: { name: 'Alice Updated' } },
  entities: users,
});

// Upsert a user (update if exists, add if not)
users = upsertOne({
  entity: { id: 4, name: 'David', email: 'david@example.com' },
  entities: users,
});

// Remove a user
users = removeOne({ id: 2, entities: users });
```

## API Reference

### removeAll

Removes all elements from the list.

```typescript
function removeAll<T>(): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const result = removeAll<User>(); // []
```

---

### addOne

Adds an element to the end of the list.

```typescript
function addOne<T>({ entity, entities }: { entity: T; entities: T[] }): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const result = addOne({
  entity: { id: 2, name: 'Bob' },
  entities: users,
});
// [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
```

---

### addMany

Adds multiple elements to the end of the list.

```typescript
function addMany<T>({
  newEntities,
  entities,
}: {
  newEntities: T[];
  entities: T[];
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const result = addMany({
  newEntities: [
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' },
  ],
  entities: users,
});
// [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Charlie' }]
```

---

### setAll

Replaces the entire list with new elements.

```typescript
function setAll<T>({ newEntities }: { newEntities: T[] }): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const result = setAll({ newEntities: [{ id: 2, name: 'Bob' }] });
// [{ id: 2, name: 'Bob' }]
```

---

### setOne

Replaces an element if it exists (based on id), otherwise adds it.

If the entity has an `id` property, the `identifier` is optional.

```typescript
// With identifier (required for entities without id property)
function setOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];

// Without identifier (for entities with id property)
function setOne<T extends { id: K }, K>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];

// Without identifier (User has id property)
const result1 = setOne({
  entity: { id: 1, name: 'Alice Updated' },
  entities: users,
});
// [{ id: 1, name: 'Alice Updated' }]

// With custom identifier
const products = [{ sku: 'A1', name: 'Widget' }];
const result2 = setOne({
  entity: { sku: 'A1', name: 'Widget Updated' },
  entities: products,
  identifier: (p) => p.sku,
});
// [{ sku: 'A1', name: 'Widget Updated' }]
```

---

### setMany

Replaces or adds multiple elements (based on id).

If the entity has an `id` property, the `identifier` is optional.

```typescript
function setMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];

// Without identifier
const result = setMany({
  newEntities: [
    { id: 1, name: 'Alice Updated' },
    { id: 2, name: 'Bob' },
  ],
  entities: users,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }]
```

---

### updateOne

Partially updates an existing element. Does nothing if the element is not found.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function updateOne<T, K = string | number>(params: {
  update: Update<T, K>;
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];

// Without identifier
const result = updateOne({
  update: { id: 1, changes: { name: 'Alice Updated' } },
  entities: users,
});
// [{ id: 1, name: 'Alice Updated', email: 'alice@example.com' }]
```

---

### updateMany

Partially updates multiple existing elements.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function updateMany<T, K = string | number>(params: {
  updates: Update<T, K>[];
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

// Without identifier
const result = updateMany({
  updates: [
    { id: 1, changes: { name: 'Alice Updated' } },
    { id: 2, changes: { name: 'Bob Updated' } },
  ],
  entities: users,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob Updated' }]
```

---

### upsertOne

Updates an element if it exists (merging properties), otherwise adds it.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function upsertOne<T, K = string | number>(params: {
  entity: T;
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];

// Update existing (merges properties) - without identifier
const result1 = upsertOne({
  entity: { id: 1, name: 'Alice Updated' },
  entities: users,
});
// [{ id: 1, name: 'Alice Updated', email: 'alice@example.com' }]

// Add new
const result2 = upsertOne({
  entity: { id: 2, name: 'Bob' },
  entities: users,
});
// [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
```

---

### upsertMany

Updates multiple elements if they exist, otherwise adds them.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function upsertMany<T, K = string | number>(params: {
  newEntities: T[];
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];

// Without identifier
const result = upsertMany({
  newEntities: [
    { id: 1, name: 'Alice Updated' },
    { id: 2, name: 'Bob' },
  ],
  entities: users,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }]
```

---

### removeOne

Removes an element by its id.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function removeOne<T, K = string | number>(params: {
  id: K;
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

// Without identifier
const result = removeOne({ id: 1, entities: users });
// [{ id: 2, name: 'Bob' }]

// With custom identifier for entities without id
const products = [{ sku: 'A1', name: 'Widget' }];
const result2 = removeOne({
  id: 'A1',
  entities: products,
  identifier: (p) => p.sku,
});
// []
```

---

### removeMany

Removes multiple elements by their ids.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function removeMany<T, K = string | number>(params: {
  ids: K[];
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Charlie' },
];

// Without identifier
const result = removeMany({ ids: [1, 2], entities: users });
// [{ id: 3, name: 'Charlie' }]
```

---

### map

Applies a transformation function to all elements.

```typescript
function map<T>({
  mapFn,
  entities,
}: {
  mapFn: (entity: T) => T;
  entities: T[];
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'alice' },
  { id: 2, name: 'bob' },
];
const result = map({
  mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
  entities: users,
});
// [{ id: 1, name: 'ALICE' }, { id: 2, name: 'BOB' }]
```

---

### mapOne

Applies a transformation function to a single element by its id.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function mapOne<T, K = string | number>(params: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'alice' },
  { id: 2, name: 'bob' },
];

// Without identifier
const result = mapOne({
  id: 1,
  mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
  entities: users,
});
// [{ id: 1, name: 'ALICE' }, { id: 2, name: 'bob' }]
```

---

### computedTotal

Returns the total count of entities.

```typescript
function computedTotal<T>({ entities }: { entities: T[] }): number;
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
const total = computedTotal({ entities: users });
// 2
```

---

### computedIds

Returns all ids from the entities list.

If the entity has an `id` property, the `identifier` is optional.

```typescript
function computedIds<T, K = string | number>(params: {
  entities: T[];
  identifier?: IdSelector<T, K>; // Optional if T has id
}): K[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

// Without identifier
const ids = computedIds({ entities: users });
// [1, 2]

// With custom identifier
const products = [{ sku: 'A1', name: 'Widget' }];
const skus = computedIds({
  entities: products,
  identifier: (p) => p.sku,
});
// ['A1']
```
