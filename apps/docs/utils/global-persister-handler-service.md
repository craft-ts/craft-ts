# GlobalPersisterHandlerService

A global craftService for managing cache persistence operations in @craft-ng.

## Overview

`GlobalPersisterHandlerService` is exposed through the generated `GlobalPersisterHandlerService()` helper. It provides a centralized way to clear all cached data stored in `localStorage` by `@craft-ng`.

This helper is useful when you need to completely remove persisted queries, mutations, and related cached data, for example during logout or when switching accounts.

## Installation

The helper is automatically available when you install `@craft-ng/core`:

```typescript
import { GlobalPersisterHandlerService } from '@craft-ng/core';
```

## How it works

The underlying global `craftService` scans all keys in `localStorage` and removes any key that starts with the `ng-craft-` prefix. This ensures complete cleanup of all data cached by `@craft-ng`, including:

- Persisted queries
- Persisted mutations
- Persisted async processes
- Any other data cached by the `@craft-ng` persistence layer

## Basic Usage

### Clearing cache on user logout

```typescript
import { craftService, GlobalPersisterHandlerService } from '@craft-ng/core';

const { LogoutHandler } = craftService(
  { name: 'LogoutHandler', scope: 'global' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();

    return {
      logout: () => persister.clearAllCache(),
    };
  },
);
```

### Force refresh all data

```typescript
const { CacheActions } = craftService(
  { name: 'CacheActions', scope: 'global' },
  function* () {
    const persister = yield* GlobalPersisterHandlerService();
    return { clearCache: () => persister.clearAllCache() };
  },
);
```

### Clear cache when switching accounts

```typescript
const { AccountSwitcher } = craftService(
  { name: 'AccountSwitcher', scope: 'global' },
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

## Use Cases

### 1. User Logout

Remove all user-specific cached data when a user logs out to prevent data leakage to the next user.

```typescript
logout() {
  this.persisterHandler.clearAllCache();
  this.authService.logout();
}
```

### 2. Privacy Compliance

Ensure no sensitive data remains in localStorage after a user session ends.

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

## Related

- [Local Storage Persister](../insertions/insert-local-storage)
- [Query](../primitives/query)
- [Mutation](../primitives/mutation)
