import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { LocalStorageService } from './browser-boundaries';
import { GlobalPersisterHandlerService } from './global-persister-handler.service';

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
    TestBed.runInInjectionContext(() => {
      LocalStorageService().clear();
    });
  });

  it('clears only @craft-ng persisted entries', () => {
    TestBed.runInInjectionContext(() => {
      const storage = LocalStorageService();
      const persisterHandler = GlobalPersisterHandlerService();

      storage.setItem('ng-craft-query-resource-user', 'query');
      storage.setItem('ng-craft-mutation-resource-user', 'mutation');
      storage.setItem('custom-app-key', 'keep-me');

      persisterHandler.clearAllCache();

      expect(storage.getItem('ng-craft-query-resource-user')).toBeNull();
      expect(storage.getItem('ng-craft-mutation-resource-user')).toBeNull();
      expect(storage.getItem('custom-app-key')).toBe('keep-me');
    });
  });
});
