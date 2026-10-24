import { test, craftSession } from '../src/index.js';

test.describe('generated fixture contracts', () => {
  for (const id of ['playwright.fixture-contract', 'playwright.generated-contract']) {
    test(id, {
      annotation: craftSession({ id, capture: 'none' }),
    }, async () => {});
  }
});
