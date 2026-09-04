import { describe, expect, it } from 'vitest';
import { cloudflarePreset } from './cloudflare.js';
import { request } from '../testing.fixture.js';

const staticSite = (mode: 'spa' | 'ssg', routes?: readonly string[]) =>
  request({
    name: 'demo',
    runtime: 'static',
    platform: 'cloudflare',
    static: { mode, routes },
    client: { build: 'vite build', outDir: 'dist' },
  });

const worker = (
  bindings?: readonly { name: string; type: string }[],
  outDir?: string,
) =>
  request({
    name: 'demo',
    runtime: 'worker',
    platform: 'cloudflare',
    worker: { entry: 'dist/worker.js', bindings },
    ...(outDir ? { client: { build: 'vite build', outDir } } : {}),
  });

describe('cloudflare preset', () => {
  describe('static runtime', () => {
    it('uploads the public directory as a StaticSite', () => {
      const result = cloudflarePreset(staticSite('spa'));

      expect(result.resources).toEqual([
        expect.objectContaining({
          type: 'cloudflare:Website.StaticSite',
          name: 'demo-production-site',
          properties: {
            command: 'vite build',
            outdir: 'dist',
            assets: { notFoundHandling: 'single-page-application' },
          },
        }),
      ]);
    });

    it('reports the pre-rendered route count in ssg mode', () => {
      const result = cloudflarePreset(staticSite('ssg', ['/', '/about']));

      expect(result.resources[0]?.properties).toMatchObject({
        assets: { notFoundHandling: '404-page' },
      });
      expect(result.notes.join(' ')).toContain('2 pre-rendered route(s)');
    });

    it('warns about routes that still need a server runtime', () => {
      const result = cloudflarePreset(
        request({
          name: 'demo',
          runtime: 'static',
          platform: 'cloudflare',
          static: {
            mode: 'ssg',
            routes: ['/'],
            serverRoutes: ['/users/:id'],
          },
          client: { build: 'vite build', outDir: 'dist' },
        }),
      );

      expect(result.notes.join(' ')).toContain('still need a server runtime');
    });
  });

  describe('worker runtime', () => {
    it('declares the worker last, after the resources it binds', () => {
      const result = cloudflarePreset(
        worker([
          { name: 'SESSIONS', type: 'kv' },
          { name: 'UPLOADS', type: 'r2' },
        ]),
      );

      expect(result.resources.map((resource) => resource.type)).toEqual([
        'cloudflare:KV.Namespace',
        'cloudflare:R2.Bucket',
        'cloudflare:Worker',
      ]);
    });

    it('names every resource with the stage', () => {
      const result = cloudflarePreset(
        request(
          {
            name: 'demo',
            runtime: 'worker',
            platform: 'cloudflare',
            worker: { entry: 'dist/worker.js' },
          },
          { stage: 'preview-42' },
        ),
      );

      expect(result.resources[0]?.name).toBe('demo-preview-42-worker');
    });

    it('serves the client output from the worker when there is one', () => {
      const result = cloudflarePreset(worker([], 'dist/browser'));

      expect(result.resources[0]?.properties).toMatchObject({
        assets: 'dist/browser',
      });
      expect(result.notes.join(' ')).toContain('dist/browser');
    });

    it('never creates a secret binding, and says where the value comes from', () => {
      const result = cloudflarePreset(
        worker([{ name: 'API_TOKEN', type: 'secret' }]),
      );

      expect(result.resources.map((resource) => resource.type)).toEqual([
        'cloudflare:Worker',
      ]);
      expect(result.notes.join(' ')).toContain('the plan never carries it');
    });

    it('refuses a binding type Alchemy has no resource for', () => {
      const result = cloudflarePreset(
        worker([{ name: 'MYSTERY', type: 'hyperdrive' }]),
      );

      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
          provider: 'alchemy',
        }),
      ]);
    });

    it('carries the environment variable names, never a value', () => {
      const result = cloudflarePreset(
        request({
          name: 'demo',
          runtime: 'worker',
          platform: 'cloudflare',
          worker: { entry: 'dist/worker.js' },
          env: [{ name: 'API_URL', required: true }],
        }),
      );

      expect(result.resources[0]?.properties['environment']).toBe('API_URL');
    });
  });

  it('refuses a runtime Cloudflare cannot execute', () => {
    const result = cloudflarePreset(
      request({
        name: 'demo',
        runtime: 'node',
        platform: 'cloudflare',
        server: {
          entry: 'dist/server.js',
          healthPath: '/health',
          readyPath: '/ready',
        },
      }),
    );

    expect(result.resources).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe(
      'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
    );
  });
});
