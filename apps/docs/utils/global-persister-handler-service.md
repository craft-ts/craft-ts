# GlobalPersisterHandlerService

A global service for managing cache persistence operations in ng-craft.

## Overview

The `GlobalPersisterHandlerService` provides a centralized way to clear all cached data stored in localStorage by ng-craft. This service is particularly useful when you need to completely remove all persisted data, such as when a user logs out of your application.

## Installation

The service is automatically available when you install `@ng-craft/core`:

```typescript
import { GlobalPersisterHandlerService } from '@ng-craft/core';
```

## How it works

The service scans all keys in `localStorage` and removes any key that starts with the `ng-craft-` prefix. This ensures complete cleanup of all data cached by ng-craft, including:

- Persisted queries
- Persisted queries by ID
- Any other data cached by ng-craft's persistence layer

## Basic Usage

### Clearing cache on user logout

```typescript
import { Component, inject } from '@angular/core';
import { GlobalPersisterHandlerService } from '@ng-craft/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  template: ` <button (click)="logout()">Logout</button> `,
})
export class HeaderComponent {
  private readonly persisterHandler = inject(GlobalPersisterHandlerService);
  private readonly router = inject(Router);

  logout() {
    // Clear all ng-craft cached data
    this.persisterHandler.clearAllCache();

    // Clear authentication tokens
    localStorage.removeItem('auth_token');

    // Navigate to login page
    this.router.navigate(['/login']);
  }
}
```

### Force refresh all data

```typescript
import { Component, inject } from '@angular/core';
import { GlobalPersisterHandlerService } from '@ng-craft/core';

@Component({
  selector: 'app-settings',
  template: ` <button (click)="clearCache()">Clear Cache & Refresh</button> `,
})
export class SettingsComponent {
  private readonly persisterHandler = inject(GlobalPersisterHandlerService);

  clearCache() {
    // Clear all cached data
    this.persisterHandler.clearAllCache();

    // Reload the page to fetch fresh data
    window.location.reload();
  }
}
```

### Clear cache when switching accounts

```typescript
import { Component, inject } from '@angular/core';
import { GlobalPersisterHandlerService } from '@ng-craft/core';

@Component({
  selector: 'app-account-switcher',
  template: `
    <select (change)="switchAccount($event)">
      <option *ngFor="let account of accounts" [value]="account.id">
        {{ account.name }}
      </option>
    </select>
  `,
})
export class AccountSwitcherComponent {
  private readonly persisterHandler = inject(GlobalPersisterHandlerService);

  accounts = [
    { id: 1, name: 'Personal Account' },
    { id: 2, name: 'Work Account' },
  ];

  switchAccount(event: Event) {
    const accountId = (event.target as HTMLSelectElement).value;

    // Clear all cached data from previous account
    this.persisterHandler.clearAllCache();

    // Load new account data
    this.loadAccount(accountId);
  }

  loadAccount(accountId: string) {
    // Implementation...
  }
}
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
// In a debug component
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

- [Local Storage Persister](/docs/insertions/insert-local-storage)
- [Query](/docs/primitives/query)
- [Mutation](/docs/primitives/mutation)
