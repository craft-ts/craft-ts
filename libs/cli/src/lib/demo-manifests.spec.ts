import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCraftCli } from './run.js';
import { captureIo } from './testing.fixture.js';

const workspaceRoot = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..',
);

/**
 * The demonstrators are the proof that the contract describes a real
 * application: they run through the same CLI a user would run, from the
 * workspace root the manifest paths are relative to.
 */
describe('workspace demonstrators', () => {
  it('resolves the SSR demo to a stable manifest', async () => {
    const io = captureIo(workspaceRoot);

    const code = await runCraftCli(
      ['manifest', '--config', 'apps/demo-ssr/craft.deploy.ts'],
      io,
    );

    expect(code).toBe(0);
    expect(io.output.join('\n')).toMatchSnapshot();
  });

  it('resolves the SPA demo to a stable manifest', async () => {
    const io = captureIo(workspaceRoot);

    const code = await runCraftCli(
      ['manifest', '--config', 'apps/demo/craft.deploy.ts'],
      io,
    );

    expect(code).toBe(0);
    expect(io.output.join('\n')).toMatchSnapshot();
  });

  it('passes `check` on the SSR demo against the docker provider', async () => {
    const io = captureIo(workspaceRoot);

    const code = await runCraftCli(
      [
        'check',
        '--config',
        'apps/demo-ssr/craft.deploy.ts',
        '--runtime',
        'node',
        '--platform',
        'docker',
        '--provider',
        'docker',
      ],
      io,
    );

    expect(io.all()).not.toContain('fix:');
    expect(code).toBe(0);
  });

  it('passes `check` on the SPA demo against a static publisher', async () => {
    const io = captureIo(workspaceRoot);

    const code = await runCraftCli(
      [
        'check',
        '--config',
        'apps/demo/craft.deploy.ts',
        '--provider',
        'github-pages',
      ],
      io,
    );

    expect(io.all()).not.toContain('fix:');
    expect(code).toBe(0);
  });

  it('refuses the SSR demo on a provider without a Node runtime', async () => {
    const io = captureIo(workspaceRoot);

    const code = await runCraftCli(
      [
        'check',
        '--config',
        'apps/demo-ssr/craft.deploy.ts',
        '--provider',
        'cloudflare-pages',
      ],
      io,
    );

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain(
      'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
    );
  });
});
