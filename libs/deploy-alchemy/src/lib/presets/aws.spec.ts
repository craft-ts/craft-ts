import { describe, expect, it } from 'vitest';
import { awsPreset } from './aws.js';
import { request } from '../testing.fixture.js';

describe('aws preset', () => {
  describe('lambda runtime', () => {
    const lambda = request({
      name: 'demo',
      runtime: 'lambda',
      platform: 'aws',
      lambda: { entry: 'dist/lambda.js', permissions: ['s3:GetObject'] },
      functions: { entry: 'src/server.ts', ids: ['demo.users.list'] },
    });

    it('exposes the function through a Function URL', () => {
      const result = awsPreset(lambda);

      expect(result.resources.map((resource) => resource.type)).toEqual([
        'aws:Lambda.Function',
      ]);
      expect(result.resources[0]?.properties).toMatchObject({
        functionUrl: true,
      });
    });

    it('keeps the server-function protocol intact', () => {
      expect(awsPreset(lambda).notes.join(' ')).toContain(
        '{ id, input, context }',
      );
    });

    it('warns when no permission is declared', () => {
      const result = awsPreset(
        request({
          name: 'demo',
          runtime: 'lambda',
          platform: 'aws',
          lambda: { entry: 'dist/lambda.js' },
        }),
      );

      expect(result.notes.join(' ')).toContain('No permission is declared');
    });
  });

  describe('static runtime', () => {
    it('puts a distribution in front of a private bucket', () => {
      const result = awsPreset(
        request({
          name: 'demo',
          runtime: 'static',
          platform: 'aws',
          static: { mode: 'spa' },
          client: { build: 'vite build', outDir: 'dist' },
        }),
      );

      expect(result.resources.map((resource) => resource.type)).toEqual([
        'aws:Website.StaticSite',
      ]);
      expect(result.resources[0]?.properties).toMatchObject({
        path: 'dist',
        spa: true,
      });
    });
  });

  describe('node runtime', () => {
    const node = (start?: string) =>
      request({
        name: 'demo',
        runtime: 'node',
        platform: 'aws',
        server: {
          entry: 'dist/server.js',
          ...(start ? { start } : {}),
          healthPath: '/health',
          readyPath: '/ready',
        },
      });

    it('refuses a generic Node artefact', () => {
      const result = awsPreset(node('node dist/server.js'));

      expect(result.resources).toEqual([]);
      expect(result.diagnostics[0]?.message).toContain('Alchemy ECS');
    });

    it('refuses a service with no start command', () => {
      const result = awsPreset(node());

      expect(result.resources).toEqual([]);
      expect(result.diagnostics[0]?.code).toBe(
        'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
      );
    });
  });

  it('refuses a runtime AWS cannot execute', () => {
    const result = awsPreset(
      request({
        name: 'demo',
        runtime: 'worker',
        platform: 'aws',
        worker: { entry: 'dist/worker.js' },
      }),
    );

    expect(result.diagnostics[0]?.code).toBe(
      'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
    );
  });
});
