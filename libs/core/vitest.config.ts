/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/core',
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      '@craft-ng/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ng/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ng/angular': path.join(
        workspaceRoot,
        'libs/angular/src/index.ts',
      ),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    name: 'ng-craft-core',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: [
      // TestBed / Angular compiler remainder — run via `nx test-angular ng-craft-core`.
      // Default `nx test` covers every other spec (host, router contracts, forms
      // that no longer need ngc, public-surface, etc.).
      // Cancel-nav contract lives in craft-router-outlet-cancel.spec.ts (default suite).
      'src/lib/async-process.spec.ts',
      'src/lib/browser-boundaries.spec.ts',
      'src/lib/component-monitoring.spec.ts',
      'src/lib/computed-source.spec.ts',
      'src/lib/correlation-id-plugin.spec.ts',
      'src/lib/correlation-id.spec.ts',
      'src/lib/craft-a11y.spec.ts',
      'src/lib/craft-app-config.spec.ts',
      'src/lib/craft-computed.spec.ts',
      'src/lib/craft-control-flow.spec.ts',
      'src/lib/craft-effect.spec.ts',
      'src/lib/craft-guard-runtime.spec.ts',
      'src/lib/craft-http-client.spec.ts',
      'src/lib/craft-lazy.spec.ts',
      'src/lib/craft-method.spec.ts',
      'src/lib/craft-pipe.spec.ts',
      'src/lib/craft-register-for.spec.ts',
      'src/lib/craft-resource.spec.ts',
      'src/lib/craft-route-exceptions.spec.ts',
      'src/lib/craft-route-load-error.spec.ts',
      'src/lib/craft-router-outlet.spec.ts',
      'src/lib/craft-router-trace.spec.ts',
      'src/lib/craft-router.spec.ts',
      'src/lib/craft-routes.spec.ts',
      'src/lib/craft-service-input.spec.ts',
      'src/lib/craft-service.spec.ts',
      'src/lib/craft-settled.spec.ts',
      'src/lib/craft-view-transition.spec.ts',
      'src/lib/form/checkout-form-migration.spec.ts',
      'src/lib/form/craft-field.spec.ts',
      'src/lib/form/insert-form-attributes.spec.ts',
      'src/lib/form/insert-form-primitives-compat.spec.ts',
      'src/lib/form/insert-form-submit.spec.ts',
      'src/lib/form/insert-form.spec.ts',
      'src/lib/form/insert-select-form-tree.spec.ts',
      'src/lib/form/make-form-tree-insert.spec.ts',
      'src/lib/form/validator.spec.ts',
      'src/lib/from-event-to-source$.spec.ts',
      'src/lib/global-persister-handler.service.spec.ts',
      'src/lib/host-tag.spec.ts',
      'src/lib/inject-service.spec.ts',
      'src/lib/insert-entities.spec.ts',
      'src/lib/insert-local-storage-persister.spec.ts',
      'src/lib/insert-pagination-placeholder-data.spec.ts',
      'src/lib/insert-select-resource.spec.ts',
      'src/lib/insert-select.spec.ts',
      'src/lib/insert-typed-pipes.spec.ts',
      'src/lib/linked-source.spec.ts',
      'src/lib/local-storage-persister.spec.ts',
      'src/lib/method-retrigger.spec.ts',
      'src/lib/mutation.spec.ts',
      'src/lib/on$.spec.ts',
      'src/lib/preserved-resource.spec.ts',
      'src/lib/query-params.spec.ts',
      'src/lib/query.spec.ts',
      'src/lib/reactive-read.spec.ts',
      'src/lib/resource-by-id.spec.ts',
      'src/lib/schema-validation.spec.ts',
      'src/lib/setup-craft-service-test.spec.ts',
      'src/lib/signal-source.spec.ts',
      'src/lib/source$.spec.ts',
      'src/lib/source-from-event.spec.ts',
      'src/lib/source-service.spec.ts',
      'src/lib/stacked-source.spec.ts',
      'src/lib/template-trace.spec.ts',
      'src/lib/to-craft-service.spec.ts',
      'src/lib/to-source.spec.ts',
      'src/lib/util/react-on-mutation-effect.spec.ts',
      'src/lib/util/resource-by-id-changes-tracker.util.spec.ts',
      'src/lib/yieldable-insertion-method.spec.ts',
    ],
    reporters: ['default'],
  },
});
