import { TestBed } from '@craft-ng/core';
import { beforeAll, beforeEach } from 'vitest';

export const useSnippetHarness = () => {
  beforeAll(() => {
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
  });
};
