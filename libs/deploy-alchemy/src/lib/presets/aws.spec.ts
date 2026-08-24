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
        'aws:LambdaFunction',
        'aws:LambdaFunctionUrl',
      ]);
      expect(result.resources[1]?.properties).toMatchObject({
        function: 'demo-production-function',
        authType: 'NONE',
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
        'aws:Bucket',
        'aws:CloudFrontDistribution',
      ]);
      expect(result.resources[0]?.properties).toMatchObject({ public: false });
      expect(result.resources[1]?.properties).toMatchObject({
        origin: 'demo-production-assets',
        notFoundResponse: 'index.html',
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

    it('falls back to a Fargate service', () => {
      const result = awsPreset(node('node dist/server.js'));

      expect(result.resources.map((resource) => resource.type)).toEqual([
        'aws:EcsCluster',
        'aws:EcsService',
      ]);
      expect(result.resources[1]?.properties).toMatchObject({
        readyPath: '/ready',
      });
    });

    it('says the image build stays outside CraftTS', () => {
      expect(awsPreset(node('node dist/server.js')).notes.join(' ')).toContain(
        'image build stays outside CraftTS',
      );
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
