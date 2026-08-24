import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCraftCli } from '../run.js';
import {
  captureIo,
  createTemporaryWorkspace,
  type TemporaryWorkspace,
} from '../testing.fixture.js';

let workspace: TemporaryWorkspace;

beforeEach(() => {
  workspace = createTemporaryWorkspace();
  workspace.write(
    'craft.deploy.json',
    JSON.stringify({
      name: 'demo',
      environment: 'staging',
      runtime: 'static',
      platform: 'cloudflare',
      static: { mode: 'spa' },
      client: { build: 'vite build', outDir: 'dist' },
    }),
  );
  workspace.write('dist/index.html', '<!doctype html>');
});

afterEach(() => {
  workspace.dispose();
});

/**
 * A provider module written to disk, because the CLI resolves providers at run
 * time: importing a stub from the spec would not exercise the loading path.
 */
const writeProvider = (body: string, file = 'fake-provider.mjs'): string => {
  workspace.write(file, body);
  return join(workspace.root, file);
};

const RECORDING_PROVIDER = `
import { appendFileSync } from 'node:fs';

const log = (entry) =>
  appendFileSync(new URL('./calls.log', import.meta.url), entry + '\\n');

export function createCraftDeploymentProvider() {
  return {
    name: 'fake',
    capabilities: ['static-spa', 'local-preview'],
    async check() {
      log('check');
      return [];
    },
    async preview(request) {
      log('preview');
      return {
        provider: 'fake',
        stage: request.stage,
        resources: [
          {
            type: 'fake:Site',
            name: 'demo-site',
            action: 'create',
            details: { directory: request.manifest.artifact.publicDir },
          },
        ],
        notes: ['nothing real happens here'],
      };
    },
    async deploy(request) {
      log('deploy');
      return {
        provider: 'fake',
        stage: request.stage,
        url: 'https://demo.example',
        outputs: { 'demo-site.id': 'site-1' },
      };
    },
  };
}
`;

const calls = (): readonly string[] => {
  try {
    return readFileSync(join(workspace.root, 'calls.log'), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
};

describe('craft-ts deploy', () => {
  it('requires a provider, because a deployment is always delegated', async () => {
    const io = captureIo(workspace.root);

    expect(await runCraftCli(['deploy', 'preview'], io)).toBe(1);
    expect(io.errors.join('\n')).toContain('`--provider` is required');
  });

  it('rejects an unknown subcommand', async () => {
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(['deploy', 'rollback', '--provider', 'fake'], io),
    ).toBe(1);
    expect(io.errors.join('\n')).toContain('Unknown deploy subcommand');
  });

  it('reports a provider package that is not installed', async () => {
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(['deploy', 'preview', '--provider', 'nowhere'], io),
    ).toBe(1);
    expect(io.errors.join('\n')).toContain(
      'CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED',
    );
  });

  it('reports a module that exports no provider factory', async () => {
    const module = writeProvider('export const nothing = true;\n');
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(
        [
          'deploy',
          'preview',
          '--provider',
          'fake',
          '--provider-module',
          module,
        ],
        io,
      ),
    ).toBe(1);
    expect(io.errors.join('\n')).toContain(
      'CRAFT_DEPLOY_PROVIDER_INVALID_MODULE',
    );
  });

  it('stops on a manifest that does not pass the check', async () => {
    workspace.write(
      'craft.deploy.json',
      JSON.stringify({
        name: 'demo',
        runtime: 'worker',
        platform: 'cloudflare',
      }),
    );
    const module = writeProvider(RECORDING_PROVIDER);
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(
        [
          'deploy',
          'preview',
          '--provider',
          'fake',
          '--provider-module',
          module,
        ],
        io,
      ),
    ).toBe(1);
    expect(io.errors.join('\n')).toContain(
      'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
    );
    expect(calls()).toEqual([]);
  });

  it('refuses a provider that does not declare the required capability', async () => {
    workspace.write(
      'craft.deploy.json',
      JSON.stringify({
        name: 'demo',
        runtime: 'static',
        platform: 'cloudflare',
        static: { mode: 'ssg', routes: ['/'] },
        client: { build: 'vite build', outDir: 'dist' },
      }),
    );
    const module = writeProvider(RECORDING_PROVIDER);
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(
        [
          'deploy',
          'preview',
          '--provider',
          'fake',
          '--provider-module',
          module,
        ],
        io,
      ),
    ).toBe(1);
    expect(io.errors.join('\n')).toContain(
      'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
    );
    expect(calls()).toEqual([]);
  });

  describe('preview', () => {
    it('shows the plan and never deploys', async () => {
      const module = writeProvider(RECORDING_PROVIDER);
      const io = captureIo(workspace.root);

      expect(
        await runCraftCli(
          [
            'deploy',
            'preview',
            '--provider',
            'fake',
            '--provider-module',
            module,
          ],
          io,
        ),
      ).toBe(0);

      expect(calls()).toEqual(['check', 'preview']);
      expect(io.output.join('\n')).toContain('create    fake:Site demo-site');
      expect(io.output.join('\n')).toContain(
        'Preview only: nothing was created',
      );
    });

    it('takes the stage from the manifest environment by default', async () => {
      const module = writeProvider(RECORDING_PROVIDER);
      const io = captureIo(workspace.root);

      await runCraftCli(
        [
          'deploy',
          'preview',
          '--provider',
          'fake',
          '--provider-module',
          module,
        ],
        io,
      );

      expect(io.output.join('\n')).toContain('stage staging');
    });

    it('honours an explicit stage', async () => {
      const module = writeProvider(RECORDING_PROVIDER);
      const io = captureIo(workspace.root);

      await runCraftCli(
        [
          'deploy',
          'preview',
          '--provider',
          'fake',
          '--provider-module',
          module,
          '--stage',
          'preview-42',
        ],
        io,
      );

      expect(io.output.join('\n')).toContain('stage preview-42');
    });
  });

  describe('apply', () => {
    it('refuses to deploy a plan nobody approved', async () => {
      const module = writeProvider(RECORDING_PROVIDER);
      const io = captureIo(workspace.root);

      expect(
        await runCraftCli(
          ['deploy', '--provider', 'fake', '--provider-module', module],
          io,
        ),
      ).toBe(1);

      expect(calls()).toEqual(['check', 'preview']);
      expect(io.errors.join('\n')).toContain(
        'CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED',
      );
    });

    it('previews before applying, even with --yes', async () => {
      const module = writeProvider(RECORDING_PROVIDER);
      const io = captureIo(workspace.root);

      expect(
        await runCraftCli(
          [
            'deploy',
            '--provider',
            'fake',
            '--provider-module',
            module,
            '--yes',
          ],
          io,
        ),
      ).toBe(0);

      expect(calls()).toEqual(['check', 'preview', 'deploy']);
      expect(io.output.join('\n')).toContain('url: https://demo.example');
      expect(io.output.join('\n')).toContain('output demo-site.id: site-1');
      expect(io.output.join('\n')).toContain('Deployed to stage `staging`');
    });

    it('stops on a provider check error, before previewing', async () => {
      const module = writeProvider(`
export function createCraftDeploymentProvider() {
  return {
    name: 'fake',
    capabilities: ['static-spa'],
    async check() {
      return [
        {
          code: 'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
          severity: 'error',
          message: 'no token',
          fix: 'export one',
        },
      ];
    },
    async preview() {
      throw new Error('preview must not run');
    },
    async deploy() {
      throw new Error('deploy must not run');
    },
  };
}
`);
      const io = captureIo(workspace.root);

      expect(
        await runCraftCli(
          [
            'deploy',
            '--provider',
            'fake',
            '--provider-module',
            module,
            '--yes',
          ],
          io,
        ),
      ).toBe(1);
      expect(io.errors.join('\n')).toContain(
        'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
      );
    });

    it('reports a provider that throws without pretending anything happened', async () => {
      const module = writeProvider(`
export function createCraftDeploymentProvider() {
  return {
    name: 'fake',
    capabilities: ['static-spa'],
    async preview(request) {
      return { provider: 'fake', stage: request.stage, resources: [], notes: [] };
    },
    async deploy() {
      throw new Error('the API said no');
    },
  };
}
`);
      const io = captureIo(workspace.root);

      expect(
        await runCraftCli(
          [
            'deploy',
            '--provider',
            'fake',
            '--provider-module',
            module,
            '--yes',
          ],
          io,
        ),
      ).toBe(1);
      expect(io.errors.join('\n')).toContain('the API said no');
      expect(io.errors.join('\n')).toContain('nothing was recorded by CraftTS');
    });
  });

  it('emits a machine-readable report with --json', async () => {
    const module = writeProvider(RECORDING_PROVIDER);
    const io = captureIo(workspace.root);

    expect(
      await runCraftCli(
        [
          'deploy',
          '--provider',
          'fake',
          '--provider-module',
          module,
          '--yes',
          '--json',
        ],
        io,
      ),
    ).toBe(0);

    const report = JSON.parse(io.output.join('\n')) as {
      applied: boolean;
      plan: { stage: string };
      result: { url: string };
    };

    expect(report.applied).toBe(true);
    expect(report.plan.stage).toBe('staging');
    expect(report.result.url).toBe('https://demo.example');
  });
});
