import type { TestProject } from 'vitest/node';

/**
 * One demo server for the page tests. They render in jsdom, where Vite
 * rewrites `new URL(…, import.meta.url)` for the browser and the server can
 * no longer find its data files: it starts here, in Node, instead.
 */
export default async function setup(project: TestProject) {
  const { listenDemoServer } = await import('../server/server');
  const server = await listenDemoServer();
  project.provide('demoServerUrl', server.url);
  return () => server.close();
}

declare module 'vitest' {
  export interface ProvidedContext {
    demoServerUrl: string;
  }
}
