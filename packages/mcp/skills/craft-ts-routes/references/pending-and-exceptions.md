# Pending components and route exceptions

Pending and exception components are loaded outside the primary route component pipeline. Keep their
dependency checks tied to the component itself:

```ts
type SkeletonDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./user-skeleton'))['default']>,
  AvailableProviderNames,
  ProvidedValues,
  'UserSkeleton'
>;
type _CanRunSkeleton = CanRun<SkeletonDI>;
```

Use route handlers or `assertExhaustiveRouteExceptions` to account for every typed exception. Keep
the exception component's own inferred contract checked when it injects services.
