import { defineCraftDeployment } from '@craft-ts/deploy';

/**
 * Deployment of the browser-only demo: a static SPA whose unknown paths are
 * answered by the fallback document rather than by a server runtime.
 */
export default defineCraftDeployment({
  name: 'demo',
  environment: 'production',
  runtime: 'static',
  platform: 'github-pages',
  static: {
    mode: 'spa',
    fallback: 'index.html',
  },
  client: {
    build: 'npm run build:demo:production',
    outDir: 'dist/apps/demo',
  },
  artifact: {
    publicDir: 'dist/apps/demo',
    sourceMaps: 'forbidden',
  },
});
