import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCraftProject,
  parseCreateAgents,
} from './create-project';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createFixture(mode: 'plain' | 'effect', agents = ['codex', 'cursor', 'cloud-code'] as const) {
  const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-'));
  temporaryDirectories.push(root);
  return createCraftProject({ directory: 'starter', rootDir: root, mode, agents });
}

describe('createCraftProject', () => {
  it('creates a framework-independent plain starter with the complete quality gate', async () => {
    const result = await createFixture('plain');
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(result.mode).toBe('plain');
    expect(packageJson.dependencies['@craft-ts/core']).toBeDefined();
    expect(packageJson.dependencies.effect).toBeUndefined();
    expect(packageJson.devDependencies?.typescript).toBe('^7.0.2');
    expect(packageJson.scripts).toMatchObject({
      lint: 'eslint .',
      architecture: expect.stringContaining('vitest'),
      e2e: 'playwright test',
      typecheck: 'node scripts/typecheck.mjs',
      'logs:server': 'craft-ts-log-server',
      'logs:mcp': 'craft-ts-log-mcp',
      'registry:mcp': 'craft-ts-registry-mcp',
    });
    expect(packageJson.devDependencies['@craft-ts/log-server']).toBeDefined();
    expect(packageJson.devDependencies['@craft-ts/log-mcp']).toBeDefined();
    expect(packageJson.devDependencies['@craft-ts/function-registry-mcp']).toBeDefined();
    expect(await readFile(join(result.directory, 'vite.config.ts'), 'utf8')).toContain(
      'forwardConsole: true',
    );
    expect(await readFile(join(result.directory, 'src/app/app.config.ts'), 'utf8')).toContain(
      'provideCraftDevTools',
    );
    expect(await readFile(join(result.directory, '.mcp.json'), 'utf8')).toContain(
      'craft-ts-logs',
    );
    expect(await readFile(join(result.directory, '.github/workflows/ci.yml'), 'utf8')).toContain(
      'npm run typecheck',
    );
    expect(await readFile(join(result.directory, 'scripts/typecheck.mjs'), 'utf8')).toContain(
      'typecheck-status.json',
    );
    expect(await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8')).toContain('craftRoutes');
    expect(await readFile(join(result.directory, 'src/app/api.ts'), 'utf8')).toContain('CraftHttpClient');
    expect(await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8')).toContain(
      'craftRules.configs.recommended.rules',
    );
    expect(await readFile(join(result.directory, 'architecture/architecture.spec.ts'), 'utf8')).toContain('loadArchitectureGraph');
    expect(await readFile(join(result.directory, '.cursor/skills/craft-ts-project/SKILL.md'), 'utf8')).toContain('architecture/');
    expect(await readFile(join(result.directory, 'GEMINI.md'), 'utf8')).toContain('CraftTS project');
  });

  it('creates an Effect v4 starter with a separate Effect skill and Layer boundary', async () => {
    const result = await createFixture('effect', ['codex']);
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.effect).toBe('^4.0.0-rc.110');
    expect(packageJson.dependencies['@craft-ts/effect']).toBeDefined();
    expect(packageJson.devDependencies?.typescript).toBe('^7.0.2');
    expect(await readFile(join(result.directory, 'src/app/domain.ts'), 'utf8')).toContain('Layer.succeed');
    expect(await readFile(join(result.directory, '.agents/skills/craft-ts-effect-v4/SKILL.md'), 'utf8')).toContain('Effect v4');
    expect(await readFile(join(result.directory, 'README.md'), 'utf8')).toContain('effect-check');
    expect(await readFile(join(result.directory, '.github/workflows/ci.yml'), 'utf8')).toContain(
      'npm run effect-check',
    );
    expect(await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8')).toContain(
      'craftRules.configs.effect.rules',
    );
  });
});

describe('parseCreateAgents', () => {
  it('supports the three editor/agent families and aliases', () => {
    expect(parseCreateAgents('codex,cursor,claude,cloud-code,gemini')).toEqual([
      'codex',
      'cursor',
      'claude-code',
      'cloud-code',
    ]);
    expect(parseCreateAgents('none')).toEqual([]);
  });
});
