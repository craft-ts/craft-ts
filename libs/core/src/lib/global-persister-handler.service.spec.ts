import { TestBed } from './host/craft-test-bed';
import { LocalStorageService, SessionStorageService } from './browser-boundaries';
import {
  GlobalPersisterHandlerService,
  provideGlobalPersisterHandlerService,
} from './global-persister-handler.service';
import { craftUse } from './craft-use';
import {
  LocalStoragePersister,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
  SessionStoragePersister,
} from './storage-persister.service';

describe('global persister handler service', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideGlobalPersisterHandlerService(),
        provideLocalStoragePersister(),
        provideSessionStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
      ],
    });
    TestBed.runInInjectionContext(() => {
      craftUse(LocalStorageService()).clear();
    });
  });

  it('clears only @craft-ts persisted entries', () => {
    TestBed.runInInjectionContext(() => {
      const storage = craftUse(LocalStorageService());
      const persisterHandler = craftUse(GlobalPersisterHandlerService());

      storage.setItem('craft-ts-query-resource-user', 'query');
      storage.setItem('craft-ts-mutation-resource-user', 'mutation');
      storage.setItem('custom-app-key', 'keep-me');

      persisterHandler.clearAllCache();

      expect(storage.getItem('craft-ts-query-resource-user')).toBeNull();
      expect(storage.getItem('craft-ts-mutation-resource-user')).toBeNull();
      expect(storage.getItem('custom-app-key')).toBe('keep-me');
    });
  });

  it('clears the backend selected through StoragePersister', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideGlobalPersisterHandlerService(),
        provideLocalStoragePersister(),
        provideSessionStoragePersister(),
        provideStoragePersister(function* () {
          return yield* SessionStoragePersister();
        }),
      ],
    });

    TestBed.runInInjectionContext(() => {
      const localStorage = craftUse(LocalStorageService());
      const sessionStorage = craftUse(SessionStorageService());
      const persisterHandler = craftUse(GlobalPersisterHandlerService());

      localStorage.setItem('craft-ts-local-entry', 'keep-me');
      sessionStorage.setItem('craft-ts-session-entry', 'remove-me');

      persisterHandler.clearAllCache();

      expect(localStorage.getItem('craft-ts-local-entry')).toBe('keep-me');
      expect(sessionStorage.getItem('craft-ts-session-entry')).toBeNull();
    });
  });
});
