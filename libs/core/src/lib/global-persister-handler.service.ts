import { Injectable } from '@angular/core';
import { type GetDeps } from '@craft-ng/core';

/**
 * Global service for managing persistence operations.
 *
 * This service provides a centralized way to clear all cached data stored in localStorage
 * by the ng-craft library. It's particularly useful when a user logs out, ensuring all
 * cached queries, mutations, and other persisted data are completely removed.
 *
 * @example
 * ```typescript
 * import { GlobalPersisterHandlerService } from '@craft-ng/core';
 *
 * export class AppComponent {
 *   constructor(private persisterHandler: GlobalPersisterHandlerService) {}
 *
 *   logout() {
 *     // Clear all ng-craft cached data from localStorage
 *     this.persisterHandler.clearAllCache();
 *     // Proceed with logout logic...
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class GlobalPersisterHandlerService {
  /**
   * Clears all cached data from localStorage that was created by ng-craft.
   *
   * This method scans all keys in localStorage and removes any key that starts
   * with the 'ng-craft-' prefix. This ensures a complete cleanup of all persisted
   * queries, mutations, and other cached data.
   *
   * **Use cases:**
   * - User logout: Remove all user-specific cached data
   * - Data reset: Clear all cached data to force fresh data loading
   * - Privacy: Ensure no data remains in localStorage after user session
   *
   * @example
   * ```typescript
   * // In a logout handler
   * logout() {
   *   this.persisterHandler.clearAllCache();
   *   this.router.navigate(['/login']);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Force refresh all data
   * refreshAllData() {
   *   this.persisterHandler.clearAllCache();
   *   window.location.reload();
   * }
   * ```
   */
  clearAllCache(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ng-craft-')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }
}

export type GenDeps_GlobalPersisterHandlerService = GetDeps<{
      deps: {};
      provided: {};
    }>;
