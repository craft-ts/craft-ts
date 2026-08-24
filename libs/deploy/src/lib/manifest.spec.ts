import { describe, expect, it } from 'vitest';
import {
  CRAFT_DEPLOYMENT_PROTOCOL_VERSION,
  defineCraftDeployment,
} from './manifest.js';
import {
  parseCraftDeploymentManifest,
  resolveCraftDeploymentManifest,
  serializeCraftDeploymentManifest,
} from './protocol.js';

const nodeDefinition = defineCraftDeployment({
  name: 'demo',
  runtime: 'node',
  platform: 'docker',
  server: {
    entry: 'dist/server.js',
    healthPath: '/health',
    readyPath: '/ready',
  },
});

describe('defineCraftDeployment', () => {
  it('returns the definition untouched and frozen', () => {
    expect(Object.isFrozen(nodeDefinition)).toBe(true);
    expect(nodeDefinition.name).toBe('demo');
    expect(nodeDefinition).not.toHaveProperty('protocolVersion');
  });
});

describe('resolveCraftDeploymentManifest', () => {
  it('stamps the protocol version and the default environment', () => {
    const manifest = resolveCraftDeploymentManifest(nodeDefinition);

    expect(manifest.protocolVersion).toBe(CRAFT_DEPLOYMENT_PROTOCOL_VERSION);
    expect(manifest.environment).toBe('production');
  });

  it('refuses source maps unless the deployment opts out', () => {
    expect(
      resolveCraftDeploymentManifest(nodeDefinition).artifact.sourceMaps,
    ).toBe('forbidden');
  });

  it('derives the artefact from the runtime sections', () => {
    const manifest = resolveCraftDeploymentManifest(
      defineCraftDeployment({
        name: 'demo',
        runtime: 'node',
        platform: 'node',
        client: { build: 'vite build', outDir: 'dist/browser' },
        server: {
          entry: 'dist/server.js',
          start: 'node dist/server.js',
          healthPath: '/health',
          readyPath: '/ready',
        },
      }),
    );

    expect(manifest.artifact).toMatchObject({
      publicDir: 'dist/browser',
      serverEntry: 'dist/server.js',
      start: 'node dist/server.js',
    });
  });

  it('applies the static and functions defaults', () => {
    const manifest = resolveCraftDeploymentManifest(
      defineCraftDeployment({
        name: 'demo',
        runtime: 'static',
        platform: 'github-pages',
        static: { mode: 'spa' },
        client: { build: 'vite build', outDir: 'dist' },
        functions: { entry: 'src/server.ts' },
      }),
    );

    expect(manifest.runtime === 'static' && manifest.static).toEqual({
      mode: 'spa',
      fallback: 'index.html',
      routes: [],
      serverRoutes: [],
    });
    expect(manifest.functions).toEqual({
      entry: 'src/server.ts',
      basePath: '/api',
      ids: [],
    });
  });

  it('is idempotent, so a resolved manifest resolves to itself', () => {
    const once = resolveCraftDeploymentManifest(nodeDefinition);
    const twice = resolveCraftDeploymentManifest(once);

    expect(twice).toEqual(once);
  });
});

describe('serializeCraftDeploymentManifest', () => {
  it('sorts keys so two builds of the same input are byte-identical', () => {
    const manifest = resolveCraftDeploymentManifest(nodeDefinition);
    const serialized = serializeCraftDeploymentManifest(manifest);

    expect(serialized).toBe(serializeCraftDeploymentManifest(manifest));
    expect(serialized.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(serialized))).toEqual([
      'artifact',
      'env',
      'environment',
      'name',
      'platform',
      'protocolVersion',
      'runtime',
      'server',
    ]);
  });

  it('round-trips through the parser', () => {
    const manifest = resolveCraftDeploymentManifest(nodeDefinition);
    const parsed = parseCraftDeploymentManifest(
      serializeCraftDeploymentManifest(manifest),
    );

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.manifest).toEqual(manifest);
  });
});

describe('parseCraftDeploymentManifest', () => {
  it('reports a manifest produced by another protocol version', () => {
    const manifest = resolveCraftDeploymentManifest(nodeDefinition);
    const json = serializeCraftDeploymentManifest({
      ...manifest,
      protocolVersion: '99',
    });

    const parsed = parseCraftDeploymentManifest(json);

    expect(parsed.manifest).toBeNull();
    expect(parsed.diagnostics.map((d) => d.code)).toContain(
      'CRAFT_DEPLOY_PROTOCOL_VERSION_UNSUPPORTED',
    );
  });

  it('reports a manifest without a protocol version', () => {
    const parsed = parseCraftDeploymentManifest(
      JSON.stringify({ ...nodeDefinition }),
    );

    expect(parsed.diagnostics.map((d) => d.code)).toContain(
      'CRAFT_DEPLOY_MANIFEST_MISSING_FIELD',
    );
  });

  it('reports invalid JSON as a load failure', () => {
    const parsed = parseCraftDeploymentManifest('{ not json');

    expect(parsed.manifest).toBeNull();
    expect(parsed.diagnostics[0]?.code).toBe('CRAFT_DEPLOY_CONFIG_LOAD_FAILED');
  });
});
