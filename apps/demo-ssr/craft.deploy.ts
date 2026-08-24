import { defineCraftDeployment } from '@craft-ts/deploy';

/**
 * Deployment of the SSR demo.
 *
 * Every path is relative to the workspace root, which is the directory
 * `craft-ts check` runs from. The manifest stays provider-neutral: it says
 * what the artefact is, never who publishes it.
 */
export default defineCraftDeployment({
  name: 'demo-ssr',
  environment: 'production',
  runtime: 'node',
  platform: 'docker',
  client: {
    build: 'nx run demo-ssr:build:production',
    outDir: 'dist/apps/demo-ssr',
  },
  server: {
    build: 'nx run demo-ssr:build:production',
    entry: 'dist/apps/demo-ssr/server/server.js',
    // The build output only exists after a build; declaring the source lets
    // `craft-ts check` read the real module graph before that.
    source: 'apps/demo-ssr/src/production-server.ts',
    start: 'node dist/apps/demo-ssr/server/server.js',
    healthPath: '/health',
    readyPath: '/ready',
  },
  functions: {
    entry: 'apps/demo-with-server-function/src/server/server.ts',
    basePath: '/api',
    ids: [
      'demo.products.list',
      'demo.users.list',
      'demo.users.authenticated-list',
      'demo.users.portable-list',
      'demo.users.effect-middleware-list',
    ],
  },
  env: [
    {
      name: 'HOST',
      required: false,
      description: 'Interface the server binds to.',
    },
    {
      name: 'PORT',
      required: false,
      description: 'TCP port the server listens on.',
    },
    {
      name: 'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
      required: false,
      description: 'Delay granted to in-flight requests on SIGTERM.',
    },
    {
      name: 'RATE_LIMIT_MAX',
      required: false,
      description: 'Requests allowed per window on API routes.',
    },
    {
      name: 'RATE_LIMIT_WINDOW_MS',
      required: false,
      description: 'Length of the rate limiting window.',
    },
    {
      name: 'FORCE_HTTPS',
      required: false,
      description: 'Treat requests as HTTPS behind a trusted proxy.',
    },
    {
      name: 'CORS_ORIGINS',
      required: false,
      description: 'Comma-separated list of allowed origins.',
    },
    {
      name: 'TRUSTED_HOSTS',
      required: false,
      description: 'Comma-separated list of accepted Host headers.',
    },
    {
      name: 'PUBLIC_ORIGIN',
      required: false,
      description: 'Origin used to build canonical and Open Graph URLs.',
    },
  ],
  artifact: {
    publicDir: 'dist/apps/demo-ssr',
    configFiles: ['apps/demo-ssr/Dockerfile', 'docker-compose.production.yml'],
    sourceMaps: 'forbidden',
  },
});
