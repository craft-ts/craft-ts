# Unique `insertSelect` keys per host

`assertInsertSelectUnique` requires each `insertSelect` key to appear once on a
given host primitive:

```typescript
it('keeps selected insertion keys unambiguous', () => {
  assertInsertSelectUnique(graph.graph);
});
```

## What it prevents

An insertion key names a selected slice on its host:

```typescript
query(
  'users',
  config,
  insertSelect('cell', selectUserCell),
  insertSelect('cell', selectAnotherCell), // collision
);
```

Both insertions claim `cell`. Depending on insertion order, one can replace the
other, or consumers can read a type that no longer matches the runtime branch.
The failure is especially hard to spot when the two insertions live in separate
feature helpers.

## The same key on another host is valid

```typescript
state('users', initialUsers, insertSelect('cell', selectUserCell));
state('orders', initialOrders, insertSelect('cell', selectOrderCell));
```

The key is local to a host. The rule does not impose a useless app-wide naming
scheme.

## What to do after a failure

Use a key that describes the selected contract (`'summary'`, `'pagination'`,
`'selectedUser'`) or merge the two selection behaviours into one insertion when
they are really one public slice.

## See also

- [Selecting](/guide/state/select)
- [Typed insertion pipes](/guide/concepts/insertion-pipes)
