import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCraftDeploymentConfig } from './load-config.js';
import {
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

describe('loadCraftDeploymentConfig', () => {
  it('reports that no manifest exists', async () => {
    const loaded = await loadCraftDeploymentConfig({ rootDir: workspace.root });

    expect(loaded.file).toBeNull();
    expect(loaded.diagnostics[0]?.code).toBe('CRAFT_DEPLOY_CONFIG_NOT_FOUND');
  });

  it('reads a JSON manifest', async () => {
    workspace.write(
      'craft.deploy.json',
      JSON.stringify({ name: 'demo', runtime: 'static' }),
    );

    const loaded = await loadCraftDeploymentConfig({ rootDir: workspace.root });

    expect(loaded.file).toBe('craft.deploy.json');
    expect(loaded.definition).toEqual({ name: 'demo', runtime: 'static' });
  });

  it('reports invalid JSON', async () => {
    workspace.write('craft.deploy.json', '{ not json');

    const loaded = await loadCraftDeploymentConfig({ rootDir: workspace.root });

    expect(loaded.diagnostics[0]?.code).toBe('CRAFT_DEPLOY_CONFIG_LOAD_FAILED');
  });

  it('reads the default export of an ESM manifest', async () => {
    workspace.write(
      'craft.deploy.mjs',
      `export default { name: 'demo', runtime: 'static' };\n`,
    );

    const loaded = await loadCraftDeploymentConfig({ rootDir: workspace.root });

    expect(loaded.definition).toEqual({ name: 'demo', runtime: 'static' });
  });

  it('reports a module without a default export', async () => {
    workspace.write('craft.deploy.mjs', `export const config = {};\n`);

    const loaded = await loadCraftDeploymentConfig({ rootDir: workspace.root });

    expect(loaded.diagnostics[0]?.code).toBe(
      'CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT',
    );
  });

  it('honours an explicit --config path', async () => {
    workspace.write(
      'config/staging.deploy.json',
      JSON.stringify({ name: 'staging' }),
    );

    const loaded = await loadCraftDeploymentConfig({
      rootDir: workspace.root,
      config: 'config/staging.deploy.json',
    });

    expect(loaded.file).toBe('config/staging.deploy.json');
  });

  it('reports an explicit path that does not exist', async () => {
    const loaded = await loadCraftDeploymentConfig({
      rootDir: workspace.root,
      config: 'nope.deploy.json',
    });

    expect(loaded.diagnostics[0]?.code).toBe('CRAFT_DEPLOY_CONFIG_NOT_FOUND');
  });
});
