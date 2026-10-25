import { rmSync } from 'node:fs';

/** Chaque run part du catalogue initial : le magasin des e2e est effacé avant les tests. */
export default function globalSetup(): void {
  const store = process.env['CRAFT_DEMO_ECOMMERCE_STORE'];
  if (store) rmSync(store, { force: true });
}
