# Scaling routes

`RouteCheckedDI` checks one routed component at a time and does not recurse through sibling routes.
Use one `RouteCheckedDI` / `CanRun` pair per routed component.

Split features into child collections joined by `loadChildren` when that improves code-splitting or
ownership:

```
app.routes.ts
├── billing.routes.ts       # each routed component has RouteCheckedDI + CanRun
├── admin.routes.ts         # each routed component has RouteCheckedDI + CanRun
└── reporting.routes.ts
```

A parent does not cover components in a lazy child. Keep each child's route checks beside the
components they validate, and thread app plus ancestor route providers through `ParentNames` and
`ParentValues`.

Do not cast away a DI error with `any` or `@ts-ignore`, and do not omit `CanRun`: it consumes the
check and turns a mismatch into a compile error.
