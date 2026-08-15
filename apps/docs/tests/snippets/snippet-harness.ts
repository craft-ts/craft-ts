import { TestBed } from '@angular/core/testing';
import { beforeAll, beforeEach } from 'vitest';
import { initDocsAngularTestBed } from './angular-test-bed';

export const useSnippetHarness = () => {
  beforeAll(() => {
    initDocsAngularTestBed();
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });
};
