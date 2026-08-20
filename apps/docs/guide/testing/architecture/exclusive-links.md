# Exclusive branch links

`noExclusiveLink(a, b)` checks that two branches do not depend on each other
through a private leak. Shared kernel nodes are allowed:

<<< @/tests/snippets/guide/testing/architecture/exclusive-links.spec.ts#example

## What it prevents

Suppose two features are intended to be independent:

```text
admin → checkout-private-service → checkout
```

The application has now created a hidden integration. A future checkout rewrite
must preserve an admin-only dependency, and removing the link can break a route
that was never listed as a consumer.

The same problem appears between feature services:

```text
UserList → UserMutation → UserList
```

or when one route reaches directly into another feature's private data service.

## Shared kernels are not leaks

This is allowed:

```text
admin    → Auth
checkout → Auth
```

The helper stops membership at other `provides` sites, so a common auth service,
HTTP boundary or browser boundary is treated as shared infrastructure rather
than as a feature-to-feature link.

## Use it with routes or services

The arguments are graph nodes, so the same invariant can protect route branches,
feature services or any two catalog lookups.

## See also

- [Path boundaries](./path-boundaries)
- [Architecture graph lookups](/guide/testing/architecture#looking-up-nodes)
