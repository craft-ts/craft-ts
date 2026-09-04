import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCraftDeploymentProvider } from '@craft-ts/deploy';
import { createAlchemyDeploymentProvider } from './provider.js';
import {
  CLOUDFLARE_CREDENTIALS,
  recordingRuntime,
  request,
} from './testing.fixture.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'craft-alchemy-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const write = (path: string, content = 'x') => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
};

const workerRequest = () =>
  request(
    {
      name: 'demo',
      runtime: 'worker',
      platform: 'cloudflare',
      worker: { entry: 'dist/worker.js' },
      client: { build: 'vite build', outDir: 'dist/browser' },
    },
    { rootDir: root },
  );

describe('createAlchemyDeploymentProvider', () => {
  it('takes its capabilities from the published matrix', () => {
    const provider = createAlchemyDeploymentProvider({
      runtime: async () => recordingRuntime(),
    });

    expect(provider.name).toBe('alchemy');
    expect(provider.capabilities).toEqual(
      findCraftDeploymentProvider('alchemy')?.capabilities,
    );
  });

  describe('preview', () => {
    it('opens a read scope and mutates nothing', async () => {
      const runtime = recordingRuntime();
      const provider = createAlchemyDeploymentProvider({
        runtime: async () => runtime,
        environment: { ...CLOUDFLARE_CREDENTIALS },
      });

      const plan = await provider.preview(workerRequest());

      expect(runtime.opened).toEqual([
        { app: 'demo', stage: 'production', phase: 'read', rootDir: root },
      ]);
      expect(runtime.applied).toEqual([]);
      expect(runtime.finalized).toBe(0);
      expect(runtime.disposed).toBe(1);
      expect(plan.resources.map((resource) => resource.action)).toEqual([
        'create',
      ]);
    });

    it('names the Alchemy version and the stage in the notes', async () => {
      const provider = createAlchemyDeploymentProvider({
        runtime: async () => recordingRuntime(),
      });

      const plan = await provider.preview(workerRequest());

      expect(plan.notes[0]).toContain('2.0.0-beta.76-test');
      expect(plan.notes[0]).toContain('production');
    });

    it('surfaces the planning diagnostics instead of hiding them', async () => {
      const provider = createAlchemyDeploymentProvider({
        runtime: async () => recordingRuntime(),
      });

      const plan = await provider.preview(
        request(
          {
            name: 'demo',
            runtime: 'worker',
            platform: 'cloudflare',
            worker: {
              entry: 'dist/worker.js',
              bindings: [{ name: 'MYSTERY', type: 'hyperdrive' }],
            },
          },
          { rootDir: root },
        ),
      );

      expect(plan.notes.join(' ')).toContain(
        'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
      );
    });
  });

  describe('deploy', () => {
    it('applies every resource, then finalizes once', async () => {
      const runtime = recordingRuntime(
        [],
        (resource): Readonly<Record<string, string>> =>
          resource.type === 'cloudflare:Worker'
            ? { url: 'https://demo.workers.dev' }
            : { id: 'kv-1' },
      );
      const provider = createAlchemyDeploymentProvider({
        runtime: async () => runtime,
      });

      const result = await provider.deploy(
        request(
          {
            name: 'demo',
            runtime: 'worker',
            platform: 'cloudflare',
            worker: {
              entry: 'dist/worker.js',
              bindings: [{ name: 'SESSIONS', type: 'kv' }],
            },
          },
          { rootDir: root },
        ),
      );

      expect(runtime.opened[0]?.phase).toBe('up');
      expect(runtime.applied.map((resource) => resource.type)).toEqual([
        'cloudflare:KV.Namespace',
        'cloudflare:Worker',
      ]);
      expect(runtime.finalized).toBe(1);
      expect(result).toEqual({
        provider: 'alchemy',
        stage: 'production',
        url: 'https://demo.workers.dev',
        outputs: {
          'demo-production-sessions.id': 'kv-1',
          'demo-production-worker.url': 'https://demo.workers.dev',
        },
      });
    });

    it('refuses to touch anything when the plan has an error', async () => {
      const runtime = recordingRuntime();
      const provider = createAlchemyDeploymentProvider({
        runtime: async () => runtime,
      });

      await expect(
        provider.deploy(
          request(
            {
              name: 'demo',
              runtime: 'worker',
              platform: 'cloudflare',
              worker: {
                entry: 'dist/worker.js',
                bindings: [{ name: 'MYSTERY', type: 'hyperdrive' }],
              },
            },
            { rootDir: root },
          ),
        ),
      ).rejects.toThrow('CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE');

      expect(runtime.applied).toEqual([]);
      expect(runtime.finalized).toBe(0);
    });
  });

  describe('check', () => {
    const provider = (
      environment: Record<string, string | undefined>,
      failing = false,
    ) =>
      createAlchemyDeploymentProvider({
        environment,
        runtime: failing
          ? async () => {
              throw new Error('Cannot find package alchemy');
            }
          : async () => recordingRuntime(),
      });

    it('passes once credentials, artefacts and Alchemy are all there', async () => {
      write('dist/browser/index.html');
      write('dist/worker.js');

      expect(
        await provider({ ...CLOUDFLARE_CREDENTIALS }).check?.(workerRequest()),
      ).toEqual([]);
    });

    it('reports the missing credentials', async () => {
      write('dist/browser/index.html');
      write('dist/worker.js');

      const diagnostics = (await provider({}).check?.(workerRequest())) ?? [];

      expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        expect.arrayContaining([
          'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
        ]),
      );
    });

    it('reports the artefact Alchemy would upload and that is missing', async () => {
      const diagnostics =
        (await provider({ ...CLOUDFLARE_CREDENTIALS }).check?.(
          workerRequest(),
        )) ?? [];

      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'CRAFT_DEPLOY_ARTIFACT_MISSING',
          path: 'artifact.publicDir',
        }),
      );
    });

    it('reports Alchemy itself when it cannot be loaded', async () => {
      write('dist/browser/index.html');
      write('dist/worker.js');

      const diagnostics =
        (await provider({ ...CLOUDFLARE_CREDENTIALS }, true).check?.(
          workerRequest(),
        )) ?? [];

      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: 'CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING',
          provider: 'alchemy',
        }),
      ]);
    });
  });
});
