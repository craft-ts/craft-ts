import { describe, expect, it } from 'vitest';
import { validateCraftDeploymentDefinition } from './validate.js';

const codesOf = (value: unknown) =>
  validateCraftDeploymentDefinition(value).diagnostics.map((d) => d.code);

const nodeManifest = {
  name: 'demo',
  runtime: 'node',
  platform: 'docker',
  server: {
    entry: 'dist/server.js',
    healthPath: '/health',
    readyPath: '/ready',
  },
};

describe('validateCraftDeploymentDefinition', () => {
  it('accepts a complete node manifest', () => {
    const validation = validateCraftDeploymentDefinition(nodeManifest);

    expect(validation.diagnostics).toEqual([]);
    expect(validation.definition).toBe(nodeManifest);
  });

  it('refuses a manifest that is not an object', () => {
    expect(codesOf('craft.deploy')).toEqual([
      'CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT',
    ]);
  });

  it('reports an unknown runtime and an unknown platform', () => {
    const codes = codesOf({ name: 'demo', runtime: 'edge', platform: 'fly' });

    expect(codes).toContain('CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME');
    expect(codes).toContain('CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM');
  });

  it('requires the section the runtime executes', () => {
    const validation = validateCraftDeploymentDefinition({
      name: 'demo',
      runtime: 'worker',
      platform: 'cloudflare',
    });

    expect(validation.definition).toBeNull();
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
        path: 'worker',
        runtime: 'worker',
      }),
    );
  });

  it('refuses a section belonging to another runtime', () => {
    const codes = codesOf({
      ...nodeManifest,
      worker: { entry: 'dist/worker.js' },
    });

    expect(codes).toContain('CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED');
  });

  it('refuses a runtime the platform cannot execute', () => {
    const diagnostics = validateCraftDeploymentDefinition({
      name: 'demo',
      runtime: 'lambda',
      platform: 'cloudflare',
      lambda: { entry: 'dist/lambda.js' },
    }).diagnostics;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE',
        runtime: 'lambda',
        platform: 'cloudflare',
      }),
    );
  });

  it('refuses an SSR health path that is not absolute', () => {
    const codes = codesOf({
      ...nodeManifest,
      server: { ...nodeManifest.server, healthPath: 'health' },
    });

    expect(codes).toContain('CRAFT_DEPLOY_MANIFEST_INVALID_FIELD');
  });

  describe('static mode', () => {
    const staticManifest = {
      name: 'demo',
      runtime: 'static',
      platform: 'github-pages',
      client: { build: 'vite build', outDir: 'dist' },
    };

    it('requires a route list in ssg mode', () => {
      const codes = codesOf({
        ...staticManifest,
        static: { mode: 'ssg', routes: [] },
      });

      expect(codes).toContain('CRAFT_DEPLOY_SSG_ROUTES_MISSING');
    });

    it('refuses a route that does not map to a single document', () => {
      const diagnostics = validateCraftDeploymentDefinition({
        ...staticManifest,
        static: { mode: 'ssg', routes: ['/', '/users/:id', '/blog/*'] },
      }).diagnostics;

      expect(
        diagnostics
          .filter((d) => d.code === 'CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC')
          .map((d) => d.path),
      ).toEqual(['static.routes[1]', 'static.routes[2]']);
    });

    it('accepts a spa mode without routes', () => {
      expect(codesOf({ ...staticManifest, static: { mode: 'spa' } })).toEqual(
        [],
      );
    });
  });

  describe('environment variables', () => {
    it('refuses a name that is not upper snake case', () => {
      const codes = codesOf({
        ...nodeManifest,
        env: [{ name: 'apiUrl', required: true }],
      });

      expect(codes).toContain('CRAFT_DEPLOY_ENV_NAME_INVALID');
    });

    it('refuses a value, because the manifest is committed', () => {
      const diagnostics = validateCraftDeploymentDefinition({
        ...nodeManifest,
        env: [{ name: 'API_TOKEN', required: true, value: 'sk-live-42' }],
      }).diagnostics;

      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN',
          path: 'env[0].value',
        }),
      );
    });
  });

  it('refuses a duplicated server-function identifier', () => {
    const codes = codesOf({
      ...nodeManifest,
      functions: { entry: 'src/server.ts', ids: ['demo.a', 'demo.a'] },
    });

    expect(codes).toContain('CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE');
  });

  it('keeps the definition usable when only semantics are wrong', () => {
    const validation = validateCraftDeploymentDefinition({
      ...nodeManifest,
      env: [{ name: 'lower_case', required: true }],
    });

    expect(validation.definition).not.toBeNull();
  });
});
