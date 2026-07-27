import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HOST_TAG_LIST, HostName, provideHostName } from './host-tag';
import { craftUse } from './craft-use';

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

describe('host tags', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('should provide HostName through the exported craftService helpers', () => {
    TestBed.configureTestingModule({
      providers: [provideHostName('A')],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(HostName())).toBe('A');
      expect(inject(HOST_TAG_LIST)).toEqual(['A#1']);
    });
  });

  it('should append nested host names in parent-to-child order', () => {
    TestBed.runInInjectionContext(() => {
      const rootInjector = inject(EnvironmentInjector);
      const parentInjector = createEnvironmentInjector(
        [provideHostName('A')],
        rootInjector,
      );
      const childInjector = createEnvironmentInjector(
        [provideHostName('B')],
        parentInjector,
      );

      runInInjectionContext(childInjector, () => {
        expect(craftUse(HostName())).toBe('B');
        expect(inject(HOST_TAG_LIST)).toEqual(['A#1', 'B#2']);
      });
    });
  });

  it('should default the host tag list to an empty array', () => {
    TestBed.runInInjectionContext(() => {
      expect(inject(HOST_TAG_LIST)).toEqual([]);
    });
  });
});
