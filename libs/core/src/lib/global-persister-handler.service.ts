import {
  craftService,
  type CraftServiceApi,
  type ServiceTrackingMetadata,
} from './craft-service';
import { StoragePersister } from './storage-persister.service';

export type GlobalPersisterHandlerServiceApi = {
  clearAllCache(): void;
};

type GlobalPersisterHandlerServiceCraftApi = CraftServiceApi<
  'GlobalPersisterHandlerService',
  'toProvide',
  {},
  GlobalPersisterHandlerServiceApi,
  ServiceTrackingMetadata<
    'GlobalPersisterHandlerService',
    'toProvide',
    GlobalPersisterHandlerServiceApi,
    unknown
  >
>;

/**
 * Yields the global craft service responsible for clearing persisted `@craft-ts`
 * cache entries from the configured storage persister.
 *
 * This helper is provided at the application root and can follow the
 * `StoragePersister` selected by the current injector.
 * It removes every persisted entry from the selected backend, which makes it
 * useful for logout flows, account switches, or any full cache reset.
 *
 * @example
 * ```ts
 * import { GlobalPersisterHandlerService } from '@craft-ts/core';
 *
 * export class AppComponent {
 *   // Consume GlobalPersisterHandlerService inside a craft generator.
 *
 *   logout() {
 *     // Clear all @craft-ts cached data from the configured backend.
 *     this.persisterHandler.clearAllCache();
 *   }
 * }
 * ```
 */
const globalPersisterHandlerService: GlobalPersisterHandlerServiceCraftApi =
  craftService(
    {
      name: 'GlobalPersisterHandlerService',
      scope: 'toProvide',
    },
    function* () {
      const persister = yield* StoragePersister();

      return {
        clearAllCache(): void {
          persister.clearAllCache();
        },
      };
    },
  );

export const GlobalPersisterHandlerService: GlobalPersisterHandlerServiceCraftApi['GlobalPersisterHandlerService'] =
  globalPersisterHandlerService.GlobalPersisterHandlerService;
export const provideGlobalPersisterHandlerService: GlobalPersisterHandlerServiceCraftApi['provideGlobalPersisterHandlerService'] =
  globalPersisterHandlerService.provideGlobalPersisterHandlerService;
export const GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA: GlobalPersisterHandlerServiceCraftApi['GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA'] =
  globalPersisterHandlerService.GLOBAL_PERSISTER_HANDLER_SERVICE_META_DATA;
