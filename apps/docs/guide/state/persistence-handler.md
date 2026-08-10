# GlobalPersisterHandler

Clears everything `@craft-ng` has persisted through the active
`StoragePersister`, in one call.

**Use it when** cached data must not outlive a session boundary: logout,
switching accounts, a "reset the app" action.
**Not when** you want to invalidate one resource — reload that query, or give it
a shorter `cacheTime` in [Persistence](/guide/state/persistence).

::: danger It clears everything
There is no per-key variant. Every persisted query, mutation and async process
goes.
:::

```typescript
import {
  GlobalPersisterHandlerService,
  provideGlobalPersisterHandlerService,
} from '@craft-ng/core';

providers: [provideGlobalPersisterHandlerService()];
```

## How it works

The handler delegates to the active `StoragePersister`. The built-in
localStorage and sessionStorage implementations remove every key that starts
with the `ng-craft-` prefix from their respective backend. This ensures
complete cleanup of all data cached by `@craft-ng`, including:

- Persisted queries
- Persisted mutations
- Persisted async processes
- Any other data cached by the `@craft-ng` persistence layer

## The common case — clearing on logout

```typescript
import { craftService, GlobalPersisterHandlerService } from '@craft-ng/core';

const { LogoutHandler } = craftService(
  { name: 'LogoutHandler', scope: 'toProvide' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();

    return {
      logout: () => persister.clearAllCache(),
    };
  },
);
```

## Force refresh all data

```typescript
const { CacheActions } = craftService(
  { name: 'CacheActions', scope: 'toProvide' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();
    return { clearCache: () => persister.clearAllCache() };
  },
);
```

## Clear cache when switching accounts

```typescript
const { AccountSwitcher } = craftService(
  { name: 'AccountSwitcher', scope: 'toProvide' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();
    return {
      switchAccount: (accountId: string) => {
        persister.clearAllCache();
        // Load the selected account...
        return accountId;
      },
    };
  },
);
```

::: details Other situations where this comes up

### 1. User Logout

Remove all user-specific cached data when a user logs out to prevent data leakage to the next user.

```typescript
logout() {
  this.persisterHandler.clearAllCache();
  this.authService.logout();
}
```

### 2. Privacy Compliance

Ensure no sensitive data remains in the selected storage backend after a user
session ends.

```typescript
ngOnDestroy() {
  if (this.isPrivateMode) {
    this.persisterHandler.clearAllCache();
  }
}
```

### 3. Development/Testing

Quickly clear all cached data during development or testing.

```typescript
resetCache() {
  if (environment.development) {
    this.persisterHandler.clearAllCache();
    console.log('Cache cleared');
  }
}
```

### 4. Data Corruption Recovery

Clear potentially corrupted cached data and force fresh data loading.

```typescript
handleDataError() {
  this.persisterHandler.clearAllCache();
  this.showMessage('Cache cleared. Please refresh the page.');
}
```

:::

## See Also

- [Local Storage Persister](/guide/state/persistence)
- [Query](/guide/state/server-state)
- [Mutation](/guide/state/mutations)
