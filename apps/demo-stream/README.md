# demo-stream

A small app that exercises `@craft-ts/stream` for real: typed pipelines, a service resolved
inside a handler, a typed exception, a defect, and the observability hooks.

```bash
npx nx serve demo-stream     # http://localhost:4210
npx nx test demo-stream
npx nx typecheck demo-stream
```

| Section      | What it shows                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Live search  | `debounce` → `distinctUntilChanged` → `switchMap` to a `SearchApi` service. Type `boom` for a typed `SearchUnavailable` |
| Ticker       | `interval` + `take`, started and stopped by buttons (`streamSignal`)                                                    |
| Defect       | An unexpected throw in a handler: a defect, reported to the trace and to `provideTakeAppSnapshot`                       |
| Stream trace | `provideStreamTrace`: every root subscription, its `traceStage` markers, and the gesture that started it                |

The trace line of a stream started by a click carries that click's correlation id
(`StreamDemo:button:start-ticker:click:<uuid>`); the live search starts at load, so it
reads `no gesture`. Observability providers are development-only.

Not used here: `provideCraftDevTools()`. Registered in this app it fails at bootstrap with
`CraftCircularDependencyError: service-runtime-overrides → service-runtime-overrides` (its
`SERVICE_RUNTIME_OVERRIDES` factory resolves a service, which reads the overrides again). The error
does not involve streams; the app registers its own observability providers instead.
