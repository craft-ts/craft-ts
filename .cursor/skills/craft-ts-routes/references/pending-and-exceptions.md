# Pending UI, view transitions & exhaustive exceptions

## Verifying a pending component's DI

A pending skeleton is a real component that injects things such as route params, a payload, or
monitoring. Verify it independently with the per-component `RouteCheckedDI`:

```ts
type _CheckPendingDI = RouteCheckedDI<
  import('./user-skeleton').GenDeps_UserSkeletonComponent,
  'UserUserIdParams',
  AppValues,
  'pending component: user/:userId'
>;
type _CanRunPending = CanRun<_CheckPendingDI>;
```

The ESLint rule `require-pending-component-di-check` generates and refreshes this block on `--fix`.

## View transitions and exhaustive exceptions

Use `viewTransitionPayload<T>()` for a typed transition payload. A route whose guard, matcher, or
resolver can produce a typed exception must handle exactly those codes; use
`assertExhaustiveRouteExceptions(routes)` as the collection-level safety net.
