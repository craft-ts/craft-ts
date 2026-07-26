import { LocalStorageService } from './browser-boundaries';
import {
  craftService,
  type CraftServiceApi,
  type ServiceTrackingMetadata,
} from './craft-service';

export type GlobalPersisterHandlerServiceApi = {
  clearAllCache(): void;
};

type GlobalPersisterHandlerServiceCraftApi = CraftServiceApi<
  'GlobalPersisterHandlerService',
  'global',
  {},
  GlobalPersisterHandlerServiceApi,
  ServiceTrackingMetadata<
    'GlobalPersisterHandlerService',
    'global',
    GlobalPersisterHandlerServiceApi,
    unknown
  >
>;

/**
 * Yields the global craft service responsible for clearing persisted `@craft-ng`
 * cache entries from `localStorage`.
 *
 * This helper returns a singleton service created with `craftService({ scope: 'global' })`.
 * It removes every persisted entry whose key starts with `ng-craft-`, which makes it
 * useful for logout flows, account switches, or any full cache reset.
 *
 * @example
 * ```ts
 * import { GlobalPersisterHandlerService } from '@craft-ng/core';
 *
 * export class AppComponent {
 *   // Consume GlobalPersisterHandlerService inside a craft generator.
 *
 *   logout() {
 *     // Clear all @craft-ng cached data from localStorage.
 *     this.persisterHandler.clearAllCache();
 *   }
 * }
 * ```
 */
const globalPersisterHandlerService: GlobalPersisterHandlerServiceCraftApi =
  craftService(
    {
      name: 'GlobalPersisterHandlerService',
      scope: 'global',
    },
    function* () {
      const storage = yield* LocalStorageService(
        undefined,
        ({ key, length, removeItem }) => ({
          key,
          length,
          removeItem,
        }),
      );

      return {
        clearAllCache(): void {
          const keysToRemove: string[] = [];
          const storageLength = storage.length();

          for (let index = 0; index < storageLength; index++) {
            const keyName = storage.key(index);
            if (keyName?.startsWith('ng-craft-')) {
              keysToRemove.push(keyName);
            }
          }

          keysToRemove.forEach((keyName) => storage.removeItem(keyName));
        },
      };
    },
  );

export const GlobalPersisterHandlerService: GlobalPersisterHandlerServiceCraftApi['GlobalPersisterHandlerService'] =
  globalPersisterHandlerService.GlobalPersisterHandlerService;
export const GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA: GlobalPersisterHandlerServiceCraftApi['GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA'] =
  globalPersisterHandlerService.GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA;
