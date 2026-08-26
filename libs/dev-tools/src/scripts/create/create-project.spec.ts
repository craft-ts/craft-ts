import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCraftProject,
  normalizeCreateOptions,
  parseCreateAgents,
  pruneEffectReference,
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
  it('normalizes legacy aliases and independent runtime axes', () => {
    expect(normalizeCreateOptions({ directory: 'starter', mode: 'effect' })).toMatchObject({
      frontendRuntime: 'effect',
      backendRuntime: 'none',
      i18n: { enabled: true, locales: ['en-US', 'fr-FR'], defaultLocale: 'en-US' },
      designSystem: 'basic',
      typedCss: true,
    });
    expect(normalizeCreateOptions({
      directory: 'starter',
      frontendRuntime: 'plain',
      backendRuntime: 'effect',
      i18n: 'none',
      designSystem: 'none',
      typedCss: false,
    })).toMatchObject({ frontendRuntime: 'plain', backendRuntime: 'effect' });
    expect(normalizeCreateOptions({
      directory: 'starter', references: 'craft-ts', referenceMode: 'source', cloneCraftTs: false,
    }).references.mode).toBe('source');
  });

  it('rejects contradictory locale and reference choices before writing', () => {
    expect(() => normalizeCreateOptions({ directory: 'starter', i18n: 'none', locales: ['fr-FR'] })).toThrow(
      /require i18n/,
    );
    expect(() => normalizeCreateOptions({ directory: 'starter', references: 'all' })).toThrow(
      /EffectTS references require/,
    );
  });

  it('prunes Effect demos, learn content and packages from a plain Craft reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-reference-'));
    temporaryDirectories.push(root);
    await Promise.all([
      mkdir(join(root, 'apps/demo-effect'), { recursive: true }),
      mkdir(join(root, 'apps/demo-with-server-function'), { recursive: true }),
      mkdir(join(root, 'apps/docs/learn-effect'), { recursive: true }),
      mkdir(join(root, 'libs/effect'), { recursive: true }),
      mkdir(join(root, 'libs/i18n-effect'), { recursive: true }),
    ]);
    await writeFile(join(root, 'apps/demo-effect/file.ts'), 'effect');
    await writeFile(join(root, 'apps/docs/learn-effect/index.md'), 'effect');
    await writeFile(join(root, 'libs/effect/package.json'), '{}');
    await writeFile(join(root, 'libs/i18n-effect/package.json'), '{}');

    pruneEffectReference(root);

    expect(existsSync(join(root, 'apps/demo-effect'))).toBe(false);
    expect(existsSync(join(root, 'apps/demo-with-server-function'))).toBe(false);
    expect(existsSync(join(root, 'apps/docs/learn-effect'))).toBe(false);
    expect(existsSync(join(root, 'libs/effect'))).toBe(false);
    expect(existsSync(join(root, 'libs/i18n-effect'))).toBe(false);
  });

  it('keeps scoped imports while source-linking a cloned CraftTS reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-source-links-'));
    temporaryDirectories.push(root);
    const clone = join(root, 'starter/.references/craft-ts');
    await mkdir(clone, { recursive: true });
    await writeFile(join(clone, 'README.md'), 'fixture');
    execFileSync('git', ['init', '--quiet'], { cwd: clone });
    execFileSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: clone });
    execFileSync('git', ['config', 'user.name', 'fixture'], { cwd: clone });
    execFileSync('git', ['add', 'README.md'], { cwd: clone });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: clone });
    const result = await createCraftProject({
      directory: 'starter', rootDir: root, agents: [], references: 'craft-ts',
      referenceMode: 'source', cloneCraftTs: true, i18n: 'none', typedCss: true, force: true,
    });
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies['@craft-ts/core']).toBe('file:.references/craft-ts/libs/core');
    expect(await readFile(join(result.directory, 'tsconfig.json'), 'utf8')).toContain(
      '"@craft-ts/core": [\n        "./.references/craft-ts/libs/core/src/index.ts"',
    );
    const viteConfig = await readFile(join(result.directory, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('./.references/craft-ts/libs/core/src/index.ts');
    expect(viteConfig).toContain("from './.references/craft-ts/libs/style/src/plugin/vite.ts'");
    expect(await readFile(join(result.directory, 'src/app/app.ts'), 'utf8')).toContain(
      "from '@craft-ts/component'",
    );
  });

  it('omits disabled feature surfaces and returns the effective config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-minimal-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter', rootDir: root, agents: [], i18n: 'none',
      designSystem: 'none', typedCss: false,
    });
    expect(result.frontendRuntime).toBe('plain');
    expect(result.backendRuntime).toBe('none');
    expect(result.config.i18n.enabled).toBe(false);
    await expect(readFile(join(result.directory, 'src/i18n/catalog.ts'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(result.directory, 'src/app/ui/ui.style.ts'), 'utf8')).rejects.toThrow();
    expect(await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8')).toContain("path: 'services'");
  });

  it('creates a framework-independent plain starter with the complete quality gate', async () => {
    const result = await createFixture('plain');
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(result.mode).toBe('plain');
    expect(packageJson.dependencies['@craft-ts/core']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n-effect']).toBeUndefined();
    expect(packageJson.dependencies.effect).toBeUndefined();
    expect(packageJson.devDependencies?.typescript).toBe('^6.0.3');
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
    expect(await readFile(join(result.directory, 'src/dev-typecheck-indicator.ts'), 'utf8')).toContain(
      'Type checking failed — app is still running',
    );
    expect(await readFile(join(result.directory, 'src/dev-typecheck-indicator.ts'), 'utf8')).toContain(
      'Dismiss type-check warning',
    );
    expect(await readFile(join(result.directory, 'src/styles.css'), 'utf8')).toContain(
      ".craft-typecheck-indicator[data-status='failed']",
    );
    expect(await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8')).toContain('craftRoutes');
    expect(await readFile(join(result.directory, 'src/app/api.ts'), 'utf8')).toContain('CraftHttpClient');
    expect(await readFile(join(result.directory, 'src/i18n/catalog.ts'), 'utf8')).toContain('baseCatalog');
    expect(await readFile(join(result.directory, 'src/i18n/typography.ts'), 'utf8')).toContain('lineHeight');
    expect(await readFile(join(result.directory, 'e2e/i18n.spec.ts'), 'utf8')).toContain('document.fonts.ready');
    expect(await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8')).toContain(
      'craftRules.configs.recommended.rules',
    );
    expect(await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8')).toContain(
      'craftRules.configs.security.rules',
    );
    expect(await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8')).toContain(
      'craft-ts/no-effect-import-in-frontend',
    );
    expect(await readFile(join(result.directory, 'architecture/architecture.spec.ts'), 'utf8')).toContain('loadArchitectureGraph');
    expect(await readFile(join(result.directory, '.cursor/skills/craft-ts-project/SKILL.md'), 'utf8')).toContain('architecture/');
    expect(await readFile(join(result.directory, 'GEMINI.md'), 'utf8')).toContain('CraftTS project');
  });

  it('ships a design system the build plugin can actually emit', async () => {
    const result = await createFixture('plain', ['codex']);
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The vocabulary ships to the browser; the scenario matrix never does.
    expect(packageJson.dependencies['@craft-ts/style']).toBeDefined();
    expect(packageJson.devDependencies['@craft-ts/style-testing']).toBeDefined();

    // Without the plugin the sheet below typechecks and emits nothing at all,
    // which is the failure mode this assertion exists to catch.
    const viteConfig = await readFile(join(result.directory, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("from '@craft-ts/style/vite'");
    expect(viteConfig).toContain('craftStyle(');
    expect(viteConfig).toContain('dumpPath');
    expect(await readFile(join(result.directory, 'src/main.ts'), 'utf8')).toContain(
      "import 'virtual:craft-style.css'",
    );
    expect(await readFile(join(result.directory, 'src/types.d.ts'), 'utf8')).toContain(
      "declare module 'virtual:craft-style.css'",
    );

    const sheet = await readFile(join(result.directory, 'src/app/ui/ui.style.ts'), 'utf8');
    expect(sheet).toContain('definePalette(');
    expect(sheet).toContain("defineStateAxis('tone'");
    expect(sheet).toContain("cssVars('app'");

    // The variant travels as an attribute; the class stays constant. A starter
    // that shipped `class: 'error'` would teach the opposite on day one.
    const homePage = await readFile(join(result.directory, 'src/app/home-page.ts'), 'utf8');
    expect(homePage).toContain('class: surface.card');
    expect(homePage).toContain("'data-tone': 'danger'");
    expect(homePage).not.toContain("class: '");

    // The three moved rules must not also survive as global CSS.
    const styles = await readFile(join(result.directory, 'src/styles.css'), 'utf8');
    expect(styles).not.toContain('.card {');
    expect(styles).not.toContain('.muted {');
    expect(styles).not.toContain('.error {');

    expect(
      await readFile(join(result.directory, '.agents/skills/craft-ts-project/SKILL.md'), 'utf8'),
    ).toContain('no-raw-class');
  });

  it('creates an Effect v4 starter with a separate Effect skill and Layer boundary', async () => {
    const result = await createFixture('effect', ['codex']);
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.effect).toBe('^4.0.0-rc.110');
    expect(packageJson.dependencies['@craft-ts/effect']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n-effect']).toBeDefined();
    expect(packageJson.devDependencies?.typescript).toBe('^6.0.3');
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

  it('generates explicit locale parity and strict i18n scripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-i18n-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      mode: 'plain',
      agents: [],
      locales: ['en-US', 'fr-FR'],
      defaultLocale: 'fr-FR',
      i18n: 'strict',
    });
    const packageJson = JSON.parse(await readFile(join(result.directory, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts).toMatchObject({
      'i18n:check': 'craft i18n check',
      'i18n:test': 'craft i18n test',
    });
    expect(await readFile(join(result.directory, 'index.html'), 'utf8')).toContain('<html lang="fr-FR"');
    expect(await readFile(join(result.directory, 'src/i18n/locales/fr-FR.ts'), 'utf8')).toContain('defineLocaleLike');
    expect(await readFile(join(result.directory, '.github/workflows/ci.yml'), 'utf8')).toContain('npm run i18n:check');
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
