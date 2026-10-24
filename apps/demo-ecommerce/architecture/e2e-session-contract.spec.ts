import { describe, expect, it } from 'vitest';
import { assertE2eSessionContract } from '@craft-ts/playwright-sessions/architecture';

describe('demo e-commerce Playwright session contract', () => {
  it('keeps test ids, project histories, and gzip budgets valid', async () => {
    await expect(assertE2eSessionContract({
      configs: ['apps/demo-ecommerce/playwright.config.ts'],
      workspaceRoot: process.cwd(),
      budgetBytes: { session: 100_000, test: 300_000 },
    })).resolves.toBeUndefined();
  });
});
