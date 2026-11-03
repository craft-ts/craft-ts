import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * The shop server for the page tests, on a store of its own. They render in
 * jsdom, where Vite rewrites `new URL(…, import.meta.url)` for the browser and
 * the server can no longer find its data files: it starts here, in Node.
 */
export default async function setup(project: TestProject) {
  const directory = await mkdtemp(join(tmpdir(), 'craft-ecommerce-pages-'));
  process.env['CRAFT_DEMO_ECOMMERCE_STORE'] = join(directory, 'store.json');
  const { createDemoNodeServer } = await import('../server/server');
  const server = createDemoNodeServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The shop server has no port.');
  project.provide('ecommerceServerUrl', `http://127.0.0.1:${address.port}`);
  return async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    ecommerceServerUrl: string;
  }
}
