# Metric thresholds

`assertMetricThresholds` is an optional architecture rule inspired by the
complexity checks in Sonar. It lets a team agree on limits for the graph nodes
it owns, then keep those limits visible in the architecture suite. It is not
part of `assertDeclarativeArchitecture`: no threshold is imposed by default.

<<< @/tests/snippets/guide/testing/architecture/metric-thresholds.spec.ts#example

## Before: complexity grows in one node

This code is valid TypeScript, but its decisions accumulate in one unit:

```typescript
function prepareCheckout(cart: Cart, user: User) {
  if (!user.active) return rejected('inactive user');
  if (cart.items.length === 0) return rejected('empty cart');

  for (const item of cart.items) {
    if (item.discountable && (user.vip || item.onSale)) {
      item.discount = calculateDiscount(item);
    }
  }

  try {
    return persistCheckout(cart);
  } catch (error) {
    return rejected(error);
  }
}
```

The graph counts seven decision points here (`if` × 3, `for`, `&&`, `||`,
plus `catch`), so the cyclomatic value is eight: one plus the decision points.
As this logic grows, its tests and its callers have to understand the same
branching unit.

## After: split the responsibilities, then protect the limit

The branching can be given clearer seams. Each module can then be tested
through a smaller interface, while the architecture suite keeps the nodes from
growing back silently:

```typescript
function prepareCheckout(cart: Cart, user: User) {
  const rejection = checkoutRejection(cart, user);
  if (rejection) return rejection;

  applyDiscounts(cart, user);
  return persistCheckout(cart);
}

function checkoutRejection(cart: Cart, user: User) {
  if (!user.active) return rejected('inactive user');
  if (cart.items.length === 0) return rejected('empty cart');
  return undefined;
}

function applyDiscounts(cart: Cart, user: User) {
  for (const item of cart.items) {
    if (item.discountable && (user.vip || item.onSale)) {
      item.discount = calculateDiscount(item);
    }
  }
}
```

The exact limit is a team decision. A common starting point is to check local
complexity (`cyclomaticOwn`) and keep a higher ceiling for the complete owned
subtree (`cyclomaticTotal`):

```typescript
assertMetricThresholds(graph.graph, {
  kinds: ['service', 'primitive'],
  max: {
    cyclomaticOwn: 12,
    cyclomaticTotal: 30,
    lines: 160,
    fanOut: 12,
  },
});
```

## What the rule checks

- `cyclomaticOwn`: decision points attributed to the node itself.
- `cyclomaticTotal`: the node plus everything it contains.
- `lines`, `fanIn` and `fanOut`: optional limits for size and coupling.

Use `kinds` to scope the rule and `allow` for an id, label or repository-
relative path glob such as `src/legacy/**`. Unknown metrics are skipped and
reported in `graph.diagnostics`; they are never treated as zero.

Start with a generous threshold and lower it when the codebase has a baseline.
This rule is a maintainability signal, not a universal quality score: a
threshold failure should lead to a focused refactor or an explicit exception.

## See also

- [Graph insights](/guide/testing/graph-insights)
- [Architecture rules](/guide/testing/architecture)
