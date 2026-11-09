/**
 * The apps the suite can check, and how a build of one is served. A build is
 * served at the origin the sessions were recorded at: the recorded responses
 * are matched by URL, origin included.
 */
export const SESSIONS_CHECK_APPS = {
  'demo-ecommerce': {
    origin: 'http://localhost:4204',
    // `--changed`: the app's graph, and the folder whose changes count.
    tsconfig: 'apps/demo-ecommerce/tsconfig.json',
    scope: 'apps/demo-ecommerce',
    // From the root of the checkout (the working tree, or a ref's worktree).
    command:
      'node node_modules/vite/bin/vite.js --config apps/demo-ecommerce/vite.config.ts --host localhost --port 4204 --strictPort',
  },
};
