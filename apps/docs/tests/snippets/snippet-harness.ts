import { TestBed } from '@craft-ts/core';
import { beforeAll, beforeEach } from 'vitest';

export const useSnippetHarness = () => {
  beforeAll(() => {
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });
};
