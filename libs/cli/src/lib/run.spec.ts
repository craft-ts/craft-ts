import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCraftCli } from './run.js';
import {
  captureIo,
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

const writeManifest = (manifest: unknown) =>
  workspace.write('craft.deploy.json', JSON.stringify(manifest));

const staticManifest = {
  name: 'demo',
  runtime: 'static',
  platform: 'github-pages',
  static: { mode: 'spa' },
  client: { build: 'vite build', outDir: 'dist' },
};

describe('runCraftCli', () => {
  it('prints the help and fails when no command is given', async () => {
    const io = captureIo(workspace.root);

    expect(await runCraftCli([], io)).toBe(1);
    expect(io.output.join('\n')).toContain('craft-ts <command>');
  });

  it('says in the help that the tooling is experimental', async () => {
    const io = captureIo(workspace.root);
    await runCraftCli(['help'], io);

    expect(io.output.join('\n')).toContain('Experimental:');
  });

  it('lists every command it can actually run', async () => {
    const io = captureIo(workspace.root);
    await runCraftCli(['help'], io);

    for (const command of ['check', 'manifest', 'providers', 'deploy']) {
      expect(io.output.join('\n')).toContain(command);
    }
  });

  it('keeps runtime, platform and provider distinct in the help', async () => {
    const io = captureIo(workspace.root);
    await runCraftCli(['help'], io);
    const help = io.output.join('\n');

    expect(help).toContain('runtime');
    expect(help).toContain('platform');
    expect(help).toContain('provider');
  });

  it('rejects an unknown command', async () => {
    const io = captureIo(workspace.root);

    expect(await runCraftCli(['rollback'], io)).toBe(1);
    expect(io.errors.join('\n')).toContain('Unknown command: rollback');
  });

  describe('check', () => {
    it('passes on a valid manifest', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['check'], io)).toBe(0);
      expect(io.output.join('\n')).toContain('Deployment check passed');
    });

    it('fails when no manifest is found', async () => {
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['check'], io)).toBe(1);
      expect(io.errors.join('\n')).toContain('CRAFT_DEPLOY_CONFIG_NOT_FOUND');
    });

    it('reports the fix next to every diagnostic', async () => {
      writeManifest({ ...staticManifest, runtime: 'worker' });
      const io = captureIo(workspace.root);

      await runCraftCli(['check'], io);

      expect(io.errors.join('\n')).toContain('fix:');
    });

    it('emits a machine-readable report with --json', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['check', '--json'], io)).toBe(0);
      const report = JSON.parse(io.output.join('\n')) as {
        passed: boolean;
        manifest: { protocolVersion: string; runtime: string };
      };

      expect(report.passed).toBe(true);
      expect(report.manifest.runtime).toBe('static');
      expect(report.manifest.protocolVersion).toBe('1');
    });

    it('fails on an unknown option instead of checking something else', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['check', '--providers', 'vercel'], io)).toBe(1);
      expect(io.errors.join('\n')).toContain('Unknown option(s)');
    });

    it('checks the provider capabilities when one is named', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['check', '--provider', 'docker'], io)).toBe(1);
      expect(io.errors.join('\n')).toContain(
        'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
      );
    });
  });

  describe('manifest', () => {
    it('prints the resolved manifest', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['manifest'], io)).toBe(0);
      const resolved = JSON.parse(io.output.join('\n')) as {
        protocolVersion: string;
        artifact: { sourceMaps: string };
      };

      expect(resolved.protocolVersion).toBe('1');
      expect(resolved.artifact.sourceMaps).toBe('forbidden');
    });

    it('writes an immutable artefact next to the build output', async () => {
      writeManifest(staticManifest);
      const io = captureIo(workspace.root);
      const out = 'dist/demo/craft-deployment-manifest.json';

      expect(await runCraftCli(['manifest', '--out', out], io)).toBe(0);

      const first = readFileSync(join(workspace.root, out), 'utf8');
      await runCraftCli(['manifest', '--out', out], captureIo(workspace.root));

      expect(readFileSync(join(workspace.root, out), 'utf8')).toBe(first);
    });

    it('refuses to emit a manifest that does not validate', async () => {
      writeManifest({
        name: 'demo',
        runtime: 'worker',
        platform: 'cloudflare',
      });
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['manifest'], io)).toBe(1);
      expect(io.errors.join('\n')).toContain(
        'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
      );
    });
  });

  describe('providers', () => {
    it('lists the capability matrix', async () => {
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['providers'], io)).toBe(0);
      expect(io.output.join('\n')).toContain('alchemy');
      expect(io.output.join('\n')).toContain('capabilities:');
    });

    it('emits the matrix as JSON', async () => {
      const io = captureIo(workspace.root);

      expect(await runCraftCli(['providers', '--json'], io)).toBe(0);
      const providers = JSON.parse(io.output.join('\n')) as readonly {
        name: string;
      }[];

      expect(providers.map((provider) => provider.name)).toContain('docker');
    });
  });
});
