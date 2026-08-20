# Persisted primitives need a unique identity

`assertPersistedPrimitiveHasUnique` checks the inverse of the general identity
rule: every primitive using storage persistence must receive a `craftUnique`
identity.

```typescript
it('does not persist an anonymous resource', () => {
  assertPersistedPrimitiveHasUnique(graph.graph);
});
```

## What it prevents

This is not safe enough for a persisted query:

```typescript
insertStoragePersister({
  storeName: 'shop',
  key: 'user-list',
});
```

The persister may work, but the graph cannot prove that the identity is static
or that another primitive does not use the same slot. A refactor can silently
make two resources share storage.

Make the boundary explicit:

```typescript
insertStoragePersister(
  craftUnique({ storeName: 'shop', key: 'user-list' }),
);
```

This rule and [`assertCraftUnique`](./unique-identities) are complementary:

```text
assertPersistedPrimitiveHasUnique → every persisted primitive has an identity
assertCraftUnique                  → every identity is unique and verifiable
```

## When persistence is deliberately absent

An in-memory `query` or `state` has no persister and needs no identity. Do not
wrap every primitive in `craftUnique`; add it where storage, persistence or
another identity-indexed integration needs one.

## See also

- [Persistence](/guide/state/persistence)
- [Unique identities](./unique-identities)
