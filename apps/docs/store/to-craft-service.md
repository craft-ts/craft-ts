# toCraftService

Adapts an external Angular dependency so it behaves like a craft service.

## Import

```typescript
import { toCraftService } from '@craft-ng/core';
```

## Introduction

`toCraftService` turns an existing Angular dependency into a composable service API that integrates with `craftService`.

It is useful for dependencies like:

- Angular services (`Router`, custom `@Injectable()` classes)
- `InjectionToken` values
- external callable objects returned by factories

The generated API follows the same conventions as crafted services (`injectX`, `XToYield`, optional `provideX`, optional `XToProvide`) and participates in typed dependency tracking.

## Supported Scopes

`toCraftService` reuses the same scope semantics as `craftService`, with a subset of concrete scopes.

### `global`

- singleton provided at root
- supports both `token` and callback (`inject`) forms
- callback form is only available on this scope

### `toProvide`

- explicit provider helper required
- requires `token` plus `provide`
- exposes `provideX(...)`

### `manuallyProvidedAtRoot`

- explicit provider helper plus public token
- requires `token` plus `provide`
- exposes both `provideX(...)` and `XToProvide`

Scopes `function` and `abstract` are `craftService` scopes and are not available in `toCraftService`.

## Basic Global Example

```typescript
import { Injectable, signal } from '@angular/core';
import { craftService, toCraftService } from '@craft-ng/core';

@Injectable({ providedIn: 'root' })
class RouterLike {
  readonly currentUrl = signal('/');

  navigateByUrl(url: string) {
    this.currentUrl.set(url);
    return Promise.resolve(true);
  }
}

const { RouterLikeToYield } = toCraftService({
  name: 'RouterLike',
  scope: 'global',
  token: RouterLike,
});

const { injectNavigation } = craftService(
  { name: 'Navigation', scope: 'global' },
  function* () {
    const router = yield* RouterLikeToYield(undefined, ({ navigateByUrl }) => ({
      navigateByUrl,
    }));

    return {
      goToCheckout: () => router.navigateByUrl('/checkout'),
    };
  },
);
```

## Global Callback Form

```typescript
import { inject, InjectionToken } from '@angular/core';
import { toCraftService } from '@craft-ng/core';

const CURRENT_ROUTE = new InjectionToken<{ path: string }>('CurrentRoute');

const { injectCurrentRoute } = toCraftService({
  name: 'CurrentRoute',
  scope: 'global',
  inject: () => inject(CURRENT_ROUTE),
});
```

## Provider-Capable Example (`toProvide`)

```typescript
import { Injectable, signal } from '@angular/core';
import { toCraftService } from '@craft-ng/core';

@Injectable()
class CounterDriver {
  readonly total = signal(0);

  increment() {
    this.total.update((value) => value + 1);
  }
}

const { injectCounterDriver, provideCounterDriver } = toCraftService({
  name: 'CounterDriver',
  scope: 'toProvide',
  token: CounterDriver,
  provide: () => [
    CounterDriver,
  ],
});

// In tests or module providers:
// providers: [provideCounterDriver()]
```

## `$provided` in Adaptation Inputs

For `toProvide` and `manuallyProvidedAtRoot`, the adaptation factory can consume `$provided` internally while public bindings remain clean.

```typescript
const { injectCatalog, provideCatalog } = toCraftService(
  {
    name: 'Catalog',
    scope: 'toProvide',
    token: CatalogDriver,
    provide: (provided: { apiBaseUrl: string }) => [
      { provide: API_BASE_URL, useValue: provided.apiBaseUrl },
      CatalogDriver,
    ],
  },
  (catalog, inputs: { $provided: { apiBaseUrl: string }; prefix: string }) => ({
    fetchPrefixedProducts: () => `${inputs.prefix}:${catalog.fetchProducts()}`,
    readProvidedBaseUrl: () => inputs.$provided.apiBaseUrl,
  }),
);
```

## Method Binding Behavior

When adapting class instances, exposed methods stay bound to their original instance. This makes extracted methods like `navigateByUrl` safe to call after derivation.

## See Also

- [craftService](/store/craft-service)
- [setupCraftServiceTestingByRegister](/store/setup-craft-service-testing-by-register)
