# Route Load Errors

`withRouteLoadError(...)` handles failures that happen before Angular can mount the target route:
lazy `loadComponent` / `loadChildren` chunks that fail to load, rejected dynamic imports, stale
deployments, CDN errors, or offline transitions.

This is different from [`handleExceptions`](./exception-handling.md): route exceptions are business
exceptions raised by guards, resolvers, or route code. Route load errors happen while Angular is
trying to fetch the JavaScript needed to activate the route.

## Register the route-load error screen

Pass `withRouteLoadError(...)` to `provideCraftRouter(...)`, next to Angular router features and
other craft loading features:

```ts
import {
  provideCraftRouter,
  withRouteLoadError,
  withErrorComponent,
} from '@craft-ng/core';

provideCraftRouter(
  appRoutes.toRoutes(),
  withErrorComponent({
    component: MyGlobalErrorScreen,
    componentDeps:
      {} as import('./my-global-error-screen').GenDeps_MyGlobalErrorScreen,
  }),
  withRouteLoadError({
    component: MyRouteLoadErrorScreen,
    componentDeps:
      {} as import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
    retry: {
      attempts: 1,
      delayMs: 250,
    },
  }),
);
```

The component must be eager. Do not configure the route-load error screen with `loadComponent`: the
failure case is precisely that lazy JavaScript may be unavailable.

## Runtime behaviour

When a lazy route load fails, Craft:

1. runs the configured retry strategy;
2. converts the final failure to a `craftException` with code `CRAFT_ROUTE_LOAD_ERROR`;
3. renders the configured route-load error component;
4. keeps the browser URL on the original target URL.

The last point matters. Internally, Angular activates a technical recovery route so there is
something safe to render, but `browserUrl` keeps the visible URL as the intended route:

```text
/mutation/123
→ lazy chunk fails
→ retry fails
→ route-load error screen is shown
→ browser URL stays /mutation/123
→ F5 reloads /mutation/123 and retries the real route
```

::: info No dedicated loading UI during JavaScript fetches yet
While Angular is fetching a lazy `loadComponent` / `loadChildren` chunk, including time spent in the
configured retry strategy, Craft does not currently display the route's `pendingComponent` or another
dedicated loading component. The pending component starts only after the JavaScript has loaded and the
route has been activated, while the Craft `canMatch` / `canActivate` / `resolve` chain is running.

Extending the pending timeline to cover slow chunk downloads and retries is planned as a future
evolution. Until then, the previous route may remain visible while the JavaScript request is pending;
the route-load error component appears only after all configured retries fail.
:::

::: warning Browser-cached module failures
Browsers can remember a failed dynamic `import()` for the exact same module specifier. Wrap each
Craft lazy route import with the loader's `withRetry` helper:

```ts
loadComponent: ({ withRetry }) => withRetry(import('./detail')),
loadChildren: ({ withRetry }) =>
  withRetry(import('./admin.routes')).then((m) => m.adminRoutes),
```

The initial import remains statically analyzable, so Angular and Vite still rewrite it to the hashed
production chunk. On a configured retry, Craft extracts the emitted chunk URL from the browser
error and adds `__craft_route_retry` only to the failed request. A successful retry module is kept
for the lifetime of the application and reused by later route activations.

This recovery depends on the browser including the failed module URL in the dynamic-import error.
When it does not, `reload()` remains the reliable recovery path. Do not write
`import(withRetryPrefix('./detail'))`: a runtime import specifier prevents the production chunk from
being statically discovered.
:::

## Build the error component

The component can inject both the active technical exception and the recovery API:

```ts
import {
  injectCraftRouteLoadError,
  injectCraftRouteLoadRecovery,
} from '@craft-ng/core';

@Component({
  standalone: true,
  template: `
    @if (error(); as routeLoadError) {
      <h1>Route could not be loaded</h1>
      <p>
        Failed to load {{ routeLoadError.payload.phase }}
        for {{ routeLoadError.payload.routePath }}.
      </p>

      <button type="button" (click)="retry()">Retry</button>
      <button type="button" (click)="reload()">Reload app</button>
    }
  `,
})
export class MyRouteLoadErrorScreen {
  readonly error = injectCraftRouteLoadError();
  readonly recovery = injectCraftRouteLoadRecovery();

  retry(): void {
    void this.recovery.retry();
  }

  reload(): void {
    this.recovery.reload();
  }
}
```

`injectCraftRouteLoadError()` returns a signal of the reserved `craftException`. Its payload includes:

- `phase`: `'component'` or `'children'`;
- `routePath`: the route definition path that failed;
- `targetUrl`: the URL the user tried to reach;
- `cause`: the final error thrown by the loader/retry strategy;
- `attempt`: the number of load attempts made.

`injectCraftRouteLoadRecovery().retry()` navigates back to `targetUrl`; `reload()` refreshes the
browser.

## Configure retry globally

The default retry is one retry after 250 ms. You can make it explicit in `withRouteLoadError(...)`:

```ts
withRouteLoadError({
  component: MyRouteLoadErrorScreen,
  componentDeps:
    {} as import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
  retry: {
    attempts: 2,
    delayMs: 500,
  },
});
```

`attempts` is the number of retry attempts after the initial failure. So `attempts: 2` means at most
three loader calls total: the initial call plus two retries.

Use callbacks when retry behaviour depends on the error:

```ts
withRouteLoadError({
  component: MyRouteLoadErrorScreen,
  componentDeps:
    {} as import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
  retry: {
    attempts: 3,
    shouldRetry: (error, context) => {
      // Only retry dynamic import / chunk loading failures.
      if (!(error instanceof TypeError)) return false;

      // Stop earlier for a route where retrying is known to be useless.
      return context.routePath !== 'admin';
    },
    delayMs: (_error, context) => {
      // Simple backoff: retry attempt 2 waits 250 ms, attempt 3 waits 500 ms, …
      return 250 * (context.attempt - 1);
    },
  },
});
```

The retry context passed to callbacks contains `phase`, `routePath`, `targetUrl`, `attempt`, and
`error`. The `attempt` value is the load attempt about to run. After the first failed load, the
first retry callback receives `attempt: 2` and `error` set to the initial failure.

For custom logic, pass a retry strategy:

```ts
withRouteLoadError({
  component: MyRouteLoadErrorScreen,
  componentDeps:
    {} as import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
  retry: {
    async execute(loader, context) {
      console.warn('route load failed, retrying', context);
      return loader();
    },
  },
});
```

The strategy can also be an injectable class implementing `CraftRouteLoadRetry`.

## Override per route

Both the retry strategy and the rendered component are regular DI providers. Override them on a
specific route when the failure should have local behaviour:

```ts
import {
  provideRouteLoadErrorComponent,
  provideRouteLoadRetry,
} from '@craft-ng/core';

craftRoute('admin', {
  providers: [
    provideRouteLoadRetry({
      attempts: 3,
      delayMs: 1_000,
    }),
    provideRouteLoadErrorComponent({
      component: AdminRouteLoadErrorScreen,
      componentDeps:
        {} as import('./admin-route-load-error-screen').GenDeps_AdminRouteLoadErrorScreen,
    }),
  ],
  loadChildren: ({ withRetry }) =>
    withRetry(import('./admin.routes')).then((m) => m.adminRoutes),
});
```

The local component receives the same `injectCraftRouteLoadError()` and
`injectCraftRouteLoadRecovery()` values, resolved through the failing route's injector.

## DI checks

Route-load error components participate in the same generated DI checks as other error surfaces.
The ESLint rule `craft-ng/require-exception-component-di-check` generates
`RouteExceptionComponentCheckedDI` checks for:

- global `withRouteLoadError(...)` components;
- route-local `provideRouteLoadErrorComponent(...)` components.

Run ESLint with `--fix` after adding or changing a route-load error component:

```bash
npx nx lint your-app --fix
```

Do not hand-maintain the generated `_Check*DI` blocks.
