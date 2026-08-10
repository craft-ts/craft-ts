import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
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

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

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

  it('clears only @craft-ng persisted entries', () => {
    TestBed.runInInjectionContext(() => {
      const storage = craftUse(LocalStorageService());
      const persisterHandler = craftUse(GlobalPersisterHandlerService());

      storage.setItem('ng-craft-query-resource-user', 'query');
      storage.setItem('ng-craft-mutation-resource-user', 'mutation');
      storage.setItem('custom-app-key', 'keep-me');

      persisterHandler.clearAllCache();

      expect(storage.getItem('ng-craft-query-resource-user')).toBeNull();
      expect(storage.getItem('ng-craft-mutation-resource-user')).toBeNull();
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

      localStorage.setItem('ng-craft-local-entry', 'keep-me');
      sessionStorage.setItem('ng-craft-session-entry', 'remove-me');

      persisterHandler.clearAllCache();

      expect(localStorage.getItem('ng-craft-local-entry')).toBe('keep-me');
      expect(sessionStorage.getItem('ng-craft-session-entry')).toBeNull();
    });
  });
});
