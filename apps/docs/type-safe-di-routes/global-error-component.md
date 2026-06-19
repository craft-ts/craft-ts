# Global Error Component

When a route exception handler delegates to `globalError()`, the outlet renders one
application-wide error component and feeds it the exception. That component can read **all** of its
possible exceptions — typed and exhaustive — because the codes routed to it are mirrored in a global
registry maintained automatically by ESLint.

## Register the component

Pass `withErrorComponent(...)` directly to `provideCraftRouter(...)` (mixed with
your router features):

```ts
provideCraftRouter(
  appRoutes.toRoutes(),
  withComponentInputBinding(),
  withErrorComponent({
    component: MyGlobalErrorScreen,
    componentDeps:
      {} as import('./my-global-error-screen').GenDeps_MyGlobalErrorScreen,
  }),
),
```

It also works standalone via `provideCraftLoading(withErrorComponent({ component,
componentDeps }))`.

## Consume the exception

```ts
@Component({
  /* … */
})
export class MyGlobalErrorScreen {
  readonly error = injectCraftGlobalError(); // Signal<USER_DISABLED | HttpError | …>

  readonly message = computed(() => {
    switch (this.error()?.code) {
      case 'USER_DISABLED':
        return 'This account is disabled.';
      default:
        return 'Something went wrong.';
    }
  });
}
```

`injectCraftGlobalError()` is typed as the **union of every exception** any route delegates to the
global component, so `switch (error().code)` is exhaustively typed. The outlet writes the active
exception into `CRAFT_GLOBAL_ERROR` just before rendering the component.

## The registry (auto-maintained)

The union comes from `CraftGlobalExceptionRegistry`, keyed by route path and code:

```ts
declare module '@craft-ng/core' {
  interface CraftGlobalExceptionRegistry {
    'user/:userId': {
      USER_DISABLED: CraftRouteExceptionType<
        typeof demoRoutes,
        'user/:userId',
        'USER_DISABLED'
      >;
      HttpError: CraftRouteExceptionType<
        typeof demoRoutes,
        'user/:userId',
        'HttpError'
      >;
    };
  }
}
```

**Do not edit this block by hand.** The `craft-ng/global-exception-registry-match` ESLint rule
detects every `handleExceptions` handler that calls `globalError()` and keeps the registry in sync:

```bash
npx nx lint demo --fix
```

A missing entry is reported as an error; `--fix` inserts the `[path][code]` entry. `CraftRouteExceptionType`
resolves the typed exception object for a code on a route from the collection's route definitions
(no type checker required — the rule builds the reference from the collection variable and the
path/code literals).

## Default behaviour

If no `withErrorComponent` is configured, `globalError()` and unhandled thrown errors leave the
outlet in its `error` state without a component. Provide a global error component to render a
fallback UI.
