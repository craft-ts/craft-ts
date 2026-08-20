# Unique `craftUnique` identities

`assertCraftUnique` checks that every `craftUnique(...)` identity is a static,
single-use identity in the application graph.

```typescript
it('keeps storage identities unique and verifiable', () => {
  assertCraftUnique(graph.graph);
});
```

## What it prevents

Persistence is keyed by identity, not by the variable name around it:

```typescript
insertStoragePersister(craftUnique({
  storeName: 'shop',
  key: 'user-list',
}));
```

If the list and detail features both use `{ storeName: 'shop', key: 'user' }`,
they do not get two caches. They get one storage slot, and whichever feature
writes last changes what the other feature restores.

The rule also rejects a computed identity:

```typescript
const key = featureName();
craftUnique({ storeName: 'shop', key }); // not statically verifiable
```

Static literals let the catalog show every call site and let CI prove that a
rename did not silently merge two persisted resources. The canonical JSON is
order-independent, so swapping `key` and `storeName` does not evade the check.

## Different stores are different identities

The same key is valid in two stores:

```typescript
craftUnique({ storeName: 'shop', key: 'user' });
craftUnique({ storeName: 'admin', key: 'user' });
```

The complete identity is the pair, not the key alone.

## See also

- [Persisted primitive identities](./persisted-identities)
- [Persistence](/guide/state/persistence)
