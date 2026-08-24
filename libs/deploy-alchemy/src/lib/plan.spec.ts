import { describe, expect, it } from 'vitest';
import { planAlchemyDeployment } from './plan.js';
import { request } from './testing.fixture.js';

const workerRequest = request({
  name: 'demo',
  runtime: 'worker',
  platform: 'cloudflare',
  worker: { entry: 'dist/worker.js' },
});

const plan = (
  existing: Parameters<typeof planAlchemyDeployment>[0]['existing'],
) => planAlchemyDeployment({ request: workerRequest, existing }).plan;

describe('planAlchemyDeployment', () => {
  it('creates what the state does not record', () => {
    expect(plan([]).resources).toEqual([
      expect.objectContaining({
        type: 'cloudflare:Worker',
        name: 'demo-production-worker',
        action: 'create',
      }),
    ]);
  });

  it('updates what the state records without its properties', () => {
    expect(
      plan([
        {
          type: 'cloudflare:Worker',
          name: 'demo-production-worker',
          outputs: { url: 'https://demo.workers.dev' },
        },
      ]).resources[0]?.action,
    ).toBe('update');
  });

  it('reports a resource whose properties did not move as unchanged', () => {
    const declared = planAlchemyDeployment({
      request: workerRequest,
      existing: [],
    });

    expect(
      plan([
        {
          type: 'cloudflare:Worker',
          name: 'demo-production-worker',
          outputs: {},
          properties: declared.resources[0]?.properties ?? {},
        },
      ]).resources[0]?.action,
    ).toBe('unchanged');
  });

  it('updates a resource whose properties moved', () => {
    expect(
      plan([
        {
          type: 'cloudflare:Worker',
          name: 'demo-production-worker',
          outputs: {},
          properties: { entrypoint: 'dist/old-worker.js' },
        },
      ]).resources[0]?.action,
    ).toBe('update');
  });

  it('shows the deletion of a resource the manifest no longer declares', () => {
    const resources = plan([
      {
        type: 'cloudflare:KVNamespace',
        name: 'demo-production-sessions',
        outputs: { id: 'kv-1' },
      },
    ]).resources;

    expect(resources).toContainEqual(
      expect.objectContaining({
        type: 'cloudflare:KVNamespace',
        action: 'delete',
      }),
    );
  });

  it('carries the stage so a preview cannot be read as production', () => {
    const preview = planAlchemyDeployment({
      request: request(
        {
          name: 'demo',
          runtime: 'worker',
          platform: 'cloudflare',
          worker: { entry: 'dist/worker.js' },
        },
        { stage: 'preview-42' },
      ),
      existing: [],
    });

    expect(preview.plan.stage).toBe('preview-42');
    expect(preview.plan.resources[0]?.name).toContain('preview-42');
  });

  it('refuses a platform no preset covers', () => {
    const result = planAlchemyDeployment({
      request: request({
        name: 'demo',
        runtime: 'static',
        platform: 'netlify',
        static: { mode: 'spa' },
        client: { build: 'vite build', outDir: 'dist' },
      }),
      existing: [],
    });

    expect(result.resources).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe(
      'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
    );
  });

  it('renders the properties as flat, readable details', () => {
    const details = plan([]).resources[0]?.details ?? {};

    expect(details['entrypoint']).toBe('dist/worker.js');
    expect(
      Object.values(details).every((value) => typeof value === 'string'),
    ).toBe(true);
  });
});
