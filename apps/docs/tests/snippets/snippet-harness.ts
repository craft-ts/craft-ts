import { CraftTestBed } from '@craft-ts/core';
import { beforeAll, beforeEach } from 'vitest';

export const useSnippetHarness = () => {
  beforeAll(() => {
  });

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });
};
