import {
  abstract,
  craftService,
  type CraftServiceApi,
  type ServiceTrackingMetadata,
} from './craft-service';
import {
  LocalStorageService,
  SessionStorageService,
} from './browser-boundaries';
import { createStoragePersister } from './local-storage-persister';
import type { QueriesPersister } from './util/persister.type';

/** The common persistence contract used by storage-backed insertions. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface StoragePersisterApi extends QueriesPersister {}

type StoragePersisterImplementationApi<Name extends string> = CraftServiceApi<
  Name,
  'toProvide',
  Record<never, never>,
  StoragePersisterApi,
  ServiceTrackingMetadata<Name, 'toProvide', StoragePersisterApi, unknown>
>;

/**
 * Abstract storage persister selected through the Angular/Craft DI hierarchy.
 *
 * Applications must provide an implementation with `provideStoragePersister`.
 */
const storagePersisterService = craftService(
  { name: 'StoragePersister', scope: 'abstract' },
  abstract<StoragePersisterApi>(),
);
export const StoragePersister: typeof storagePersisterService.StoragePersister =
  storagePersisterService.StoragePersister;
export const StoragePersisterRequirement: typeof storagePersisterService.StoragePersisterRequirement =
  storagePersisterService.StoragePersisterRequirement;
export const provideStoragePersister: typeof storagePersisterService.provideStoragePersister =
  storagePersisterService.provideStoragePersister;

/** Provider-capable localStorage implementation of StoragePersisterApi. */
const localStoragePersisterService: StoragePersisterImplementationApi<
  'LocalStoragePersister'
> = craftService(
  { name: 'LocalStoragePersister', scope: 'toProvide' },
  function* (): Generator<unknown, StoragePersisterApi> {
    const storage = yield* LocalStorageService();
    return createStoragePersister('localStorage', storage);
  },
);
export const LocalStoragePersister: typeof localStoragePersisterService.LocalStoragePersister =
  localStoragePersisterService.LocalStoragePersister;
export const provideLocalStoragePersister: typeof localStoragePersisterService.provideLocalStoragePersister =
  localStoragePersisterService.provideLocalStoragePersister;

/** Provider-capable sessionStorage implementation of StoragePersisterApi. */
const sessionStoragePersisterService: StoragePersisterImplementationApi<
  'SessionStoragePersister'
> = craftService(
  { name: 'SessionStoragePersister', scope: 'toProvide' },
  function* (): Generator<unknown, StoragePersisterApi> {
    const storage = yield* SessionStorageService();
    return createStoragePersister('sessionStorage', storage);
  },
);
export const SessionStoragePersister: typeof sessionStoragePersisterService.SessionStoragePersister =
  sessionStoragePersisterService.SessionStoragePersister;
export const provideSessionStoragePersister: typeof sessionStoragePersisterService.provideSessionStoragePersister =
  sessionStoragePersisterService.provideSessionStoragePersister;
