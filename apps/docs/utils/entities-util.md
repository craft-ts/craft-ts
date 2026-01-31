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

const identifier = (user: User) => user.id;

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

// Update a user
users = updateOne({
  update: { id: 1, changes: { name: 'Alice Updated' } },
  entities: users,
  identifier,
});

// Upsert a user (update if exists, add if not)
users = upsertOne({
  entity: { id: 4, name: 'David', email: 'david@example.com' },
  entities: users,
  identifier,
});

// Remove a user
users = removeOne({ id: 2, entities: users, identifier });
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

```typescript
function setOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const identifier = (u: User) => u.id;

// Replace existing
const result1 = setOne({
  entity: { id: 1, name: 'Alice Updated' },
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated' }]

// Add new
const result2 = setOne({
  entity: { id: 2, name: 'Bob' },
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
```

---

### setMany

Replaces or adds multiple elements (based on id).

```typescript
function setMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const identifier = (u: User) => u.id;
const result = setMany({
  newEntities: [
    { id: 1, name: 'Alice Updated' },
    { id: 2, name: 'Bob' },
  ],
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }]
```

---

### updateOne

Partially updates an existing element. Does nothing if the element is not found.

```typescript
function updateOne<T, K = string | number>({
  update,
  entities,
  identifier,
}: {
  update: Update<T, K>;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
const identifier = (u: User) => u.id;
const result = updateOne({
  update: { id: 1, changes: { name: 'Alice Updated' } },
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated', email: 'alice@example.com' }]
```

---

### updateMany

Partially updates multiple existing elements.

```typescript
function updateMany<T, K = string | number>({
  updates,
  entities,
  identifier,
}: {
  updates: Update<T, K>[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
const identifier = (u: User) => u.id;
const result = updateMany({
  updates: [
    { id: 1, changes: { name: 'Alice Updated' } },
    { id: 2, changes: { name: 'Bob Updated' } },
  ],
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob Updated' }]
```

---

### upsertOne

Updates an element if it exists (merging properties), otherwise adds it.

```typescript
function upsertOne<T, K = string | number>({
  entity,
  entities,
  identifier,
}: {
  entity: T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
const identifier = (u: User) => u.id;

// Update existing (merges properties)
const result1 = upsertOne({
  entity: { id: 1, name: 'Alice Updated' },
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated', email: 'alice@example.com' }]

// Add new
const result2 = upsertOne({
  entity: { id: 2, name: 'Bob' },
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
```

---

### upsertMany

Updates multiple elements if they exist, otherwise adds them.

```typescript
function upsertMany<T, K = string | number>({
  newEntities,
  entities,
  identifier,
}: {
  newEntities: T[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [{ id: 1, name: 'Alice' }];
const identifier = (u: User) => u.id;
const result = upsertMany({
  newEntities: [
    { id: 1, name: 'Alice Updated' },
    { id: 2, name: 'Bob' },
  ],
  entities: users,
  identifier,
});
// [{ id: 1, name: 'Alice Updated' }, { id: 2, name: 'Bob' }]
```

---

### removeOne

Removes an element by its id.

```typescript
function removeOne<T, K = string | number>({
  id,
  entities,
  identifier,
}: {
  id: K;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
const identifier = (u: User) => u.id;
const result = removeOne({ id: 1, entities: users, identifier });
// [{ id: 2, name: 'Bob' }]
```

---

### removeMany

Removes multiple elements by their ids.

```typescript
function removeMany<T, K = string | number>({
  ids,
  entities,
  identifier,
}: {
  ids: K[];
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Charlie' },
];
const identifier = (u: User) => u.id;
const result = removeMany({ ids: [1, 2], entities: users, identifier });
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

```typescript
function mapOne<T, K = string | number>({
  id,
  mapFn,
  entities,
  identifier,
}: {
  id: K;
  mapFn: (entity: T) => T;
  entities: T[];
  identifier: IdSelector<T, K>;
}): T[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'alice' },
  { id: 2, name: 'bob' },
];
const identifier = (u: User) => u.id;
const result = mapOne({
  id: 1,
  mapFn: (u) => ({ ...u, name: u.name.toUpperCase() }),
  entities: users,
  identifier,
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

```typescript
function computedIds<T, K = string | number>({
  entities,
  identifier,
}: {
  entities: T[];
  identifier: IdSelector<T, K>;
}): K[];
```

**Example:**

```typescript
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];
const identifier = (u: User) => u.id;
const ids = computedIds({ entities: users, identifier });
// [1, 2]
```
