import { describe, expect, it } from 'vitest';
import { assertE2eSessionContract } from './architecture.js';

describe('assertE2eSessionContract', () => {
  it('accepts the demonstration fixture and Playwright project', async () => {
    await expect(assertE2eSessionContract({
      configs: ['libs/playwright-sessions/playwright.config.ts'],
      workspaceRoot: process.cwd(),
    })).resolves.toBeUndefined();
  });
});
