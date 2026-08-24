import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCraftDeploymentArtifact } from './artifact.js';
import type { CraftDeploymentManifest } from './manifest.js';
import { resolveCraftDeploymentManifest } from './protocol.js';
import {
  createTemporaryWorkspace,
  type TemporaryWorkspace,
} from './testing.fixture.js';

let workspace: TemporaryWorkspace;

beforeEach(() => {
  workspace = createTemporaryWorkspace();
});

afterEach(() => {
  workspace.dispose();
});

const spaManifest = (
  overrides: Partial<{ mode: 'spa' | 'ssg'; routes: readonly string[] }> = {},
): CraftDeploymentManifest =>
  resolveCraftDeploymentManifest({
    name: 'demo',
    runtime: 'static',
    platform: 'github-pages',
    static: {
      mode: overrides.mode ?? 'spa',
      routes: overrides.routes,
    },
    client: { build: 'vite build', outDir: 'dist' },
  });

const codesOf = (manifest: CraftDeploymentManifest) =>
  checkCraftDeploymentArtifact({ rootDir: workspace.root, manifest }).map(
    (diagnostic) => diagnostic.code,
  );

describe('checkCraftDeploymentArtifact', () => {
  it('reports a directory the build never produced', () => {
    expect(codesOf(spaManifest())).toEqual(['CRAFT_DEPLOY_ARTIFACT_MISSING']);
  });

  it('reports an artefact without a browser entry point', () => {
    workspace.write('dist/app.js', 'export {};');

    const codes = codesOf(spaManifest());

    expect(codes).toContain('CRAFT_DEPLOY_ARTIFACT_NO_ENTRY');
    expect(codes).toContain('CRAFT_DEPLOY_SPA_FALLBACK_MISSING');
  });

  it('reports an artefact without JavaScript', () => {
    workspace.write('dist/index.html', '<!doctype html>');

    expect(codesOf(spaManifest())).toEqual([
      'CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT',
    ]);
  });

  it('refuses source maps under the default policy', () => {
    workspace.write('dist/index.html', '<!doctype html>');
    workspace.write('dist/app.js', 'export {};');
    workspace.write('dist/app.js.map', '{}');

    expect(codesOf(spaManifest())).toEqual([
      'CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP',
    ]);
  });

  it('accepts source maps once the policy allows them', () => {
    workspace.write('dist/index.html', '<!doctype html>');
    workspace.write('dist/app.js', 'export {};');
    workspace.write('dist/app.js.map', '{}');

    const manifest = resolveCraftDeploymentManifest({
      name: 'demo',
      runtime: 'static',
      platform: 'github-pages',
      static: { mode: 'spa' },
      client: { build: 'vite build', outDir: 'dist' },
      artifact: { sourceMaps: 'external' },
    });

    expect(codesOf(manifest)).toEqual([]);
  });

  it('accepts a complete SPA artefact', () => {
    workspace.write('dist/index.html', '<!doctype html>');
    workspace.write('dist/assets/app-1a2b.js', 'export {};');

    expect(codesOf(spaManifest())).toEqual([]);
  });

  describe('ssg mode', () => {
    it('accepts a document per declared route', () => {
      workspace.write('dist/index.html', '<!doctype html>');
      workspace.write('dist/about.html', '<!doctype html>');
      workspace.write('dist/blog/index.html', '<!doctype html>');
      workspace.write('dist/app.js', 'export {};');

      expect(
        codesOf(spaManifest({ mode: 'ssg', routes: ['/', '/about', '/blog'] })),
      ).toEqual([]);
    });

    it('reports a route that was never pre-rendered', () => {
      workspace.write('dist/index.html', '<!doctype html>');
      workspace.write('dist/app.js', 'export {};');

      const diagnostics = checkCraftDeploymentArtifact({
        rootDir: workspace.root,
        manifest: spaManifest({ mode: 'ssg', routes: ['/', '/about'] }),
      });

      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: 'CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED',
          path: 'static.routes[1]',
        }),
      ]);
    });

    it('does not require the SPA fallback', () => {
      workspace.write('dist/index.html', '<!doctype html>');
      workspace.write('dist/app.js', 'export {};');

      expect(codesOf(spaManifest({ mode: 'ssg', routes: ['/'] }))).toEqual([]);
    });
  });
});
