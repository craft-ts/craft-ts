import { rmSync } from 'node:fs';
import { test as craftTest } from '@craft-ts/playwright-sessions';

export { expect, craftSession } from '@craft-ts/playwright-sessions';

/**
 * Chaque test part du catalogue initial, quel que soit l'ordre ou le filtre des
 * tests : sa trace ne dépend pas de ce qu'un autre test a acheté ou stocké.
 */
export const test = craftTest.extend<{ freshStore: void }>({
  // Playwright reads a fixture's dependencies from this destructuring: none here.
  // eslint-disable-next-line no-empty-pattern
  freshStore: [async ({}, use) => {
    const store = process.env['CRAFT_DEMO_ECOMMERCE_STORE'];
    if (store) rmSync(store, { force: true });
    await use();
  }, { auto: true }],
});
