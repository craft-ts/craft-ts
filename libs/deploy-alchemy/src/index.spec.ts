import { describe, expect, it } from 'vitest';
import { isCraftDeploymentProviderModule } from '@craft-ts/deploy';
import * as module from './index.js';
import { recordingRuntime, request } from './lib/testing.fixture.js';
import type { CraftDeploymentDefinition } from '@craft-ts/deploy';

/** One manifest per shape a preset can plan, so no resource type is missed. */
const PRESET_CASES: readonly CraftDeploymentDefinition[] = [
  {
    name: 'demo',
    runtime: 'static',
    platform: 'cloudflare',
    static: { mode: 'spa' },
    client: { build: 'vite build', outDir: 'dist' },
  },
  {
    name: 'demo',
    runtime: 'worker',
    platform: 'cloudflare',
    worker: {
      entry: 'dist/worker.js',
      bindings: [
        { name: 'SESSIONS', type: 'kv' },
        { name: 'UPLOADS', type: 'r2' },
        { name: 'DB', type: 'd1' },
        { name: 'JOBS', type: 'queue' },
        { name: 'ROOMS', type: 'durable_object' },
      ],
    },
  },
  {
    name: 'demo',
    runtime: 'static',
    platform: 'aws',
    static: { mode: 'ssg', routes: ['/'] },
    client: { build: 'vite build', outDir: 'dist' },
  },
  {
    name: 'demo',
    runtime: 'lambda',
    platform: 'aws',
    lambda: { entry: 'dist/lambda.js' },
  },
  {
    name: 'demo',
    runtime: 'node',
    platform: 'aws',
    server: {
      entry: 'dist/server.js',
      start: 'node dist/server.js',
      healthPath: '/health',
      readyPath: '/ready',
    },
  },
];

describe('provider module contract', () => {
  it('satisfies the factory the CLI looks for', () => {
    expect(isCraftDeploymentProviderModule(module)).toBe(true);
  });

  it('builds a usable provider through that factory', async () => {
    const runtime = recordingRuntime();
    const provider = module.createCraftDeploymentProvider({
      runtime: async () => runtime,
    });

    const plan = await provider.preview(
      request({
        name: 'demo',
        runtime: 'static',
        platform: 'cloudflare',
        static: { mode: 'spa' },
        client: { build: 'vite build', outDir: 'dist' },
      }),
    );

    expect(provider.name).toBe('alchemy');
    expect(plan.resources[0]?.type).toBe('cloudflare:StaticSite');
    expect(runtime.applied).toEqual([]);
  });

  it('maps each resource type to the Alchemy module of its platform', () => {
    const mapped = Object.entries(module.ALCHEMY_RESOURCE_EXPORTS);

    expect(mapped.length).toBeGreaterThan(0);
    for (const [type, target] of mapped) {
      expect(target.module).toBe(`alchemy/${type.split(':')[0]}`);
      expect(target.export.length).toBeGreaterThan(0);
    }
  });

  it('has an Alchemy export for every resource the presets can plan', () => {
    const planned = new Set(
      Object.values(module.ALCHEMY_PRESETS).flatMap((preset) =>
        PRESET_CASES.flatMap((definition) =>
          preset(request(definition)).resources.map(
            (resource) => resource.type,
          ),
        ),
      ),
    );

    expect(planned.size).toBeGreaterThan(0);
    for (const type of planned) {
      expect(Object.keys(module.ALCHEMY_RESOURCE_EXPORTS)).toContain(type);
    }
  });
});
