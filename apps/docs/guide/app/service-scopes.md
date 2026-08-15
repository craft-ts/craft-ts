# Service scopes

`scope` decides how many instances of a `craftService` exist and who has to
provide it. It is the one decision to make when declaring a service.

::: tip Short version
Default to `function`. Move to `toProvide` the day a child component needs the
same instance. Use `global` only for genuinely app-wide state.
:::

## Supported Scopes

### `global`

- singleton provided at root
- ideal for app-wide services and shared state
- no explicit `provideX()` helper

### `toProvide`

- requires `provideX()` where the service is mounted
- useful for feature-local service trees
- works well with tests that need explicit providers

### `manuallyProvidedAtRoot`

- explicit provider helper, but designed to be mounted at root
- also exposes `XToProvide` for public provider composition
- allows this scope to be yielded by global services, which is not possible with `toProvide` (it still requires explicit setup when testing with `setupCraftServiceTestingByRegister`).

### `function`

- creates a fresh instance on each injection
- useful for reusable factories with bindings and inputs

### `abstract`

- declares a contract without implementation
- exposes a requirement token to force a concrete implementation later

## Recommendations For Choosing a Scope

- Prefer `function` for a service owned by a single component. It avoids an explicit provider and makes it clear the instance is not meant to be shared with other components or child components.
- Move to `toProvide` when the same instance must be shared with child components, or across several components through a common parent or route. In that case, provide it at the component boundary, a parent component, or the route.
- Be careful with `toProvide`: Angular does not report a compilation error when the provider is missing, so the failure usually appears at runtime instead. The [route DI check](/guide/routing/setup) closes that hole; [architecture tests](/guide/testing/architecture#assertroutediproofs) keep the check armed.
- Use `global` when the instance is intentionally shared application-wide.
- For startup-only logic that should run when the app boots but is not injected elsewhere, prefer `function` together with `provideAppInitializer(...)`. If the same instance also needs to be injected by other services, use `global` instead.

## See Also

- [craftService](/guide/app/craft-service)
- [Route providers](/guide/routing/route-providers) — providing a service from a route
- [Testing services](/guide/testing/services)
