import { describe, expect, it } from 'vitest';
import { assertE2eSessionContract, findCraftSessionConfigs } from '@craft-ts/playwright-sessions/architecture';

describe('demo e-commerce Playwright session contract', () => {
  it('keeps test ids unique across every craft-session config, and histories and budgets valid', async () => {
    const configs = findCraftSessionConfigs(process.cwd());
    expect(configs).toContain('apps/demo-ecommerce/playwright.config.ts');
    await expect(assertE2eSessionContract({
      configs,
      workspaceRoot: process.cwd(),
      budgetBytes: { session: 100_000, test: 300_000 },
    })).resolves.toMatchObject({ warnings: expect.any(Array) });
  }, 30_000);
});
