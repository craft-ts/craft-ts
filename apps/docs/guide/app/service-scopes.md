# Service scopes

`scope` decides who owns a `craftService` instance and how its factory receives
configuration.

::: tip Short version
Use `toProvide` for state or context owned by a component, feature, or route,
even when only one component currently consumes it. Use `function` for reusable
logic called by other services when each call should get its own inputs and
service context. Use `global` only for an app-wide singleton.
:::

## Supported Scopes

### `global`

- singleton provided at root
- factory runs when the service is first resolved, unless `appStart: true` makes
  it eager
- ideal for app-wide services and shared state
- no explicit `provideX()` helper
- has no factory inputs, including `$provided`

### `toProvide`

- one instance per provider scope, created when its token is first resolved
- use for mutable state or context owned by a component, feature, or route
- configure it with `provideX()` where that owner is mounted
- works well with tests that need explicit providers
- accepts only `$provided` factory configuration; use `withComponentProviders`
  when those values come from component inputs

### `manuallyProvidedAtRoot`

- explicit provider helper, but designed to be mounted at root
- exposes the generated `provideX()` helper for explicit root composition
- allows this scope to be yielded by global services, which is not possible
  with `toProvide` (it still requires explicit setup when testing with
  `setupCraftServiceTestingByRegister`)
- accepts only `$provided` factory configuration, supplied to `provideX()`

### `function`

- creates a fresh service context on each `X(...)` helper call; no injector
  provider or shared cached instance
- useful for reusable operations called by other services, such as a query
  helper that gets different parameters on each call
- accepts call-site inputs only; pass every value directly to `X(...)`

### `abstract`

- declares a contract without implementation
- exposes a requirement token to force a concrete implementation later

## Recommendations For Choosing a Scope

`provideX()` registers a provider; it does not eagerly run the service factory.
The instance is created and cached in that injector the first time `X()` is
resolved. `appStart: true` makes the service eager during app initialization.

- Use `toProvide` for state that belongs to a component or route, even if the
  owning component is its only consumer. Put `provideX()` in that component's
  or route's providers. If configuration comes from component inputs, pass it
  once with `withComponentProviders`; consumers then call `X()` without
  repeating those values.
- Use `function` for reusable per-call work composed by other services. Each
  `X(inputs)` call creates its own service context, so it is not a shared store
  for a component's state.
- Be careful with `toProvide`: a missing provider is a runtime failure unless the route DI check is armed. The [route DI check](/guide/routing/setup) and [architecture tests](/guide/testing/architecture#assertroutediproofs) keep that proof in place.
- Use `global` when the instance is intentionally shared application-wide.
- Use `manuallyProvidedAtRoot` only when an explicit root provider is needed,
  including when a global service must depend on a configured provider.
- Use `abstract` when the implementation should be chosen by the mounting site.
- For startup-only logic that should run when the app boots but is not injected
  elsewhere, prefer `function` together with `provideAppInitializer(...)`. If
  the same instance also needs to be injected by other services, use `global`
  instead.

## See Also

- [craftService](/guide/app/craft-service)
- [Route providers](/guide/routing/route-providers) — providing a service from a route
- [Testing services](/guide/testing/services)
