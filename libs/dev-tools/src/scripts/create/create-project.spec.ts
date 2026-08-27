import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCraftProject,
  normalizeCreateOptions,
  parseCreateAgents,
} from './create-project';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createFixture(
  mode: 'plain' | 'effect',
  agents = ['codex', 'cursor', 'cloud-code'] as const,
) {
  const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-'));
  temporaryDirectories.push(root);
  return createCraftProject({
    directory: 'starter',
    rootDir: root,
    mode,
    agents,
  });
}

describe('createCraftProject', () => {
  it('normalizes legacy aliases and independent runtime axes', () => {
    expect(
      normalizeCreateOptions({ directory: 'starter', mode: 'effect' }),
    ).toMatchObject({
      frontendRuntime: 'effect',
      backendRuntime: 'none',
      i18n: {
        enabled: true,
        locales: ['en-US', 'fr-FR'],
        defaultLocale: 'en-US',
      },
      designSystem: 'basic',
      typedCss: true,
    });
    expect(
      normalizeCreateOptions({
        directory: 'starter',
        frontendRuntime: 'plain',
        backendRuntime: 'effect',
        i18n: 'none',
        designSystem: 'none',
        typedCss: false,
      }),
    ).toMatchObject({ frontendRuntime: 'plain', backendRuntime: 'effect' });
    expect(
      normalizeCreateOptions({
        directory: 'starter',
        references: 'craft-ts',
        referenceMode: 'context',
        cloneCraftTs: false,
      }).references.mode,
    ).toBe('context');
  });

  it('rejects contradictory locale and reference choices before writing', () => {
    expect(() =>
      normalizeCreateOptions({
        directory: 'starter',
        i18n: 'none',
        locales: ['fr-FR'],
      }),
    ).toThrow(/require i18n/);
    expect(() =>
      normalizeCreateOptions({ directory: 'starter', references: 'all' }),
    ).toThrow(/EffectTS references require/);
  });

  it('keeps npm dependencies when a CraftTS source reference is cloned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-source-links-'));
    temporaryDirectories.push(root);
    const clone = join(root, 'starter/.references/craft-ts');
    await mkdir(clone, { recursive: true });
    await writeFile(join(clone, 'README.md'), 'fixture');
    execFileSync('git', ['init', '--quiet'], { cwd: clone });
    execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
      cwd: clone,
    });
    execFileSync('git', ['config', 'user.name', 'fixture'], { cwd: clone });
    execFileSync('git', ['add', 'README.md'], { cwd: clone });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: clone });
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: ['codex'],
      references: 'craft-ts',
      referenceMode: 'context',
      cloneCraftTs: true,
      i18n: 'none',
      typedCss: true,
      force: true,
    });
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies['@craft-ts/core']).toBe('^0.7.0-beta.15');
    expect(packageJson.dependencies['@craft-ts/core']).not.toContain('file:');
    expect(
      await readFile(join(result.directory, 'tsconfig.json'), 'utf8'),
    ).not.toContain('.references/craft-ts');
    const viteConfig = await readFile(
      join(result.directory, 'vite.config.ts'),
      'utf8',
    );
    expect(viteConfig).not.toContain('.references/craft-ts');
    expect(viteConfig).toContain("from '@craft-ts/style/vite'");
    const referenceUpdater = await readFile(
      join(result.directory, 'scripts/update-references.mjs'),
      'utf8',
    );
    expect(referenceUpdater).toContain("'git', ['fetch'");
    expect(referenceUpdater).not.toContain('npm install');
    expect(referenceUpdater).not.toContain('pnpm');
    expect(referenceUpdater).not.toContain('run build');
    expect(
      await readFile(join(result.directory, 'AGENTS.md'), 'utf8'),
    ).toContain('agent context only');
    expect(
      await readFile(join(result.directory, 'src/app/app.ts'), 'utf8'),
    ).toContain("from '@craft-ts/component'");
    const app = await readFile(
      join(result.directory, 'src/app/app.ts'),
      'utf8',
    );
    expect(app).toContain(
      "a('home', {}, 'Home').pipe(CraftRouterLink({ to: '' }))",
    );
    expect(app).toContain(
      "span({ class: 'starter-experimental-badge' }, 'Experimental · feedback welcome')",
    );
    expect(app).not.toContain('craftRouterLink:');
    expect(
      await readFile(join(result.directory, 'src/styles.css'), 'utf8'),
    ).toContain('.starter-experimental-badge');
  });

  it('keeps npm dependencies when both CraftTS and EffectTS references are cloned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-both-references-'));
    temporaryDirectories.push(root);
    for (const name of ['craft-ts', 'effect-ts']) {
      const clone = join(root, `starter/.references/${name}`);
      await mkdir(clone, { recursive: true });
      await writeFile(join(clone, 'README.md'), name);
      execFileSync('git', ['init', '--quiet'], { cwd: clone });
      execFileSync('git', ['config', 'user.email', 'fixture@example.test'], {
        cwd: clone,
      });
      execFileSync('git', ['config', 'user.name', 'fixture'], { cwd: clone });
      execFileSync('git', ['add', 'README.md'], { cwd: clone });
      execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], {
        cwd: clone,
      });
    }

    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: ['codex'],
      frontendRuntime: 'effect',
      references: 'all',
      cloneCraftTs: true,
      cloneEffectTs: true,
      i18n: 'none',
      typedCss: false,
      force: true,
    });
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.effect).toBe('^4.0.0-rc.110');
    expect(packageJson.dependencies['@craft-ts/effect']).toBe('^0.7.0-beta.15');
    expect(
      Object.values(packageJson.dependencies).every(
        (value) => !value.startsWith('file:'),
      ),
    ).toBe(true);
    expect(
      await readFile(join(result.directory, 'tsconfig.json'), 'utf8'),
    ).not.toContain('.references/');
    const agents = await readFile(join(result.directory, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('.references/craft-ts');
    expect(agents).toContain('.references/effect-ts');
    expect(agents).toContain(
      'always import CraftTS and EffectTS from the npm dependencies',
    );
  });

  it('omits disabled feature surfaces and returns the effective config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-minimal-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
      i18n: 'none',
      designSystem: 'none',
      typedCss: false,
    });
    expect(result.frontendRuntime).toBe('plain');
    expect(result.backendRuntime).toBe('none');
    expect(result.config.i18n.enabled).toBe(false);
    await expect(
      readFile(join(result.directory, 'src/i18n/catalog.ts'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(join(result.directory, 'src/app/ui/ui.style.ts'), 'utf8'),
    ).rejects.toThrow();
    expect(
      await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain("craftRoute('services'");
    expect(
      await readFile(join(result.directory, 'AGENTS.md'), 'utf8'),
    ).toContain('Effect is not selected');
  });

  it('uses a local delayed welcome response when no backend is configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-local-welcome-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
      i18n: 'none',
      designSystem: 'none',
    });
    const api = await readFile(
      join(result.directory, 'src/app/api.ts'),
      'utf8',
    );
    const homePage = await readFile(
      join(result.directory, 'src/app/home-page.ts'),
      'utf8',
    );

    expect(api).not.toContain('CraftHttpClient');
    expect(api).toContain('craftSleep');
    expect(api).toContain('title:');
    expect(homePage).toContain('String((yield* welcomeQuery.value())?.title)');
    expect(homePage).toContain('String((yield* welcomeQuery.value())?.body)');

    const effectResult = await createCraftProject({
      directory: 'effect-starter',
      rootDir: root,
      mode: 'effect',
      agents: [],
      i18n: 'none',
      designSystem: 'none',
    });
    const effectDomain = await readFile(
      join(effectResult.directory, 'src/app/domain.ts'),
      'utf8',
    );
    expect(effectDomain).not.toContain("fetch('/api/welcome')");
    expect(effectDomain).toContain("Effect.sleep('10 millis')");
  });

  it('initializes Git and ignores generated local artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-git-init-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
    });
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: result.directory,
      encoding: 'utf8',
    }).trim();
    const gitignore = await readFile(
      join(result.directory, '.gitignore'),
      'utf8',
    );

    expect(realpathSync(gitRoot)).toBe(realpathSync(result.directory));
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('dist/');
    expect(
      execFileSync('git', ['check-ignore', '--quiet', 'node_modules/example'], {
        cwd: result.directory,
      }),
    ).toBeInstanceOf(Buffer);
  });

  it('creates a framework-independent plain starter with the complete quality gate', async () => {
    const result = await createFixture('plain');
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(result.mode).toBe('plain');
    expect(packageJson.dependencies['@craft-ts/core']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n-effect']).toBeUndefined();
    expect(packageJson.dependencies.effect).toBeUndefined();
    expect(packageJson.devDependencies.effect).toBeUndefined();
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
    expect(
      packageJson.devDependencies['@craft-ts/function-registry-mcp'],
    ).toBeDefined();
    expect(
      await readFile(join(result.directory, 'vite.config.ts'), 'utf8'),
    ).toContain('forwardConsole: true');
    expect(
      await readFile(join(result.directory, 'src/app/app.config.ts'), 'utf8'),
    ).toContain('provideCraftDevTools');
    expect(
      await readFile(join(result.directory, '.mcp.json'), 'utf8'),
    ).toContain('craft-ts-logs');
    expect(
      await readFile(
        join(result.directory, '.github/workflows/ci.yml'),
        'utf8',
      ),
    ).toContain('npm run typecheck');
    expect(
      await readFile(join(result.directory, 'scripts/typecheck.mjs'), 'utf8'),
    ).toContain('typecheck-status.json');
    expect(
      await readFile(
        join(result.directory, 'src/dev-typecheck-indicator.ts'),
        'utf8',
      ),
    ).toContain('Type checking failed — app is still running');
    expect(
      await readFile(
        join(result.directory, 'src/dev-typecheck-indicator.ts'),
        'utf8',
      ),
    ).toContain('Dismiss type-check warning');
    expect(
      await readFile(join(result.directory, 'src/styles.css'), 'utf8'),
    ).toContain(".craft-typecheck-indicator[data-status='failed']");
    expect(
      await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain('craftRoutes');
    expect(
      await readFile(join(result.directory, 'src/app/api.ts'), 'utf8'),
    ).toContain('craftSleep');
    expect(
      await readFile(join(result.directory, 'src/i18n/catalog.ts'), 'utf8'),
    ).toContain('baseCatalog');
    expect(
      await readFile(join(result.directory, 'src/i18n/typography.ts'), 'utf8'),
    ).toContain('lineHeight');
    expect(
      await readFile(join(result.directory, 'e2e/i18n.spec.ts'), 'utf8'),
    ).toContain('document.fonts.ready');
    expect(
      await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8'),
    ).toContain('craftRules.configs.recommended.rules');
    expect(
      await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8'),
    ).toContain('craftRules.configs.security.rules');
    expect(
      await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8'),
    ).toContain('craft-ts/no-effect-import-in-frontend');
    expect(
      await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8'),
    ).toContain("console: 'readonly'");
    expect(
      await readFile(
        join(result.directory, 'architecture/architecture.spec.ts'),
        'utf8',
      ),
    ).toContain('loadArchitectureGraph');
    expect(
      await readFile(
        join(result.directory, '.cursor/skills/craft-ts-project/SKILL.md'),
        'utf8',
      ),
    ).toContain('architecture/');
    expect(
      await readFile(join(result.directory, 'GEMINI.md'), 'utf8'),
    ).toContain('CraftTS project');
  });

  it('ships a design system the build plugin can actually emit', async () => {
    const result = await createFixture('plain', ['codex']);
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The vocabulary ships to the browser; the scenario matrix never does.
    expect(packageJson.dependencies['@craft-ts/style']).toBeDefined();
    expect(
      packageJson.devDependencies['@craft-ts/style-testing'],
    ).toBeDefined();

    // Without the plugin the sheet below typechecks and emits nothing at all,
    // which is the failure mode this assertion exists to catch.
    const viteConfig = await readFile(
      join(result.directory, 'vite.config.ts'),
      'utf8',
    );
    expect(viteConfig).toContain("from '@craft-ts/style/vite'");
    expect(viteConfig).toContain('craftStyle(');
    expect(viteConfig).toContain('dumpPath');
    expect(
      await readFile(join(result.directory, 'src/main.ts'), 'utf8'),
    ).toContain("import 'virtual:craft-style.css'");
    expect(
      await readFile(join(result.directory, 'src/types.d.ts'), 'utf8'),
    ).toContain("declare module 'virtual:craft-style.css'");

    const sheet = await readFile(
      join(result.directory, 'src/app/ui/ui.style.ts'),
      'utf8',
    );
    expect(sheet).toContain('definePalette(');
    expect(sheet).toContain("defineStateAxis('tone'");
    expect(sheet).toContain("cssVars('app'");

    const components = await readFile(
      join(result.directory, 'src/app/ui/components.ts'),
      'utf8',
    );
    expect(components).toContain(
      "button('continue', { class: surface.card, type: 'button' }, 'Continue')",
    );

    // The variant travels as an attribute; the class stays constant. A starter
    // that shipped `class: 'error'` would teach the opposite on day one.
    const homePage = await readFile(
      join(result.directory, 'src/app/home-page.ts'),
      'utf8',
    );
    expect(homePage).toContain('class: surface.card');
    expect(homePage).toContain("'data-tone': 'danger'");
    expect(homePage).not.toContain("class: '");

    // The three moved rules must not also survive as global CSS.
    const styles = await readFile(
      join(result.directory, 'src/styles.css'),
      'utf8',
    );
    expect(styles).not.toContain('.card {');
    expect(styles).not.toContain('.muted {');
    expect(styles).not.toContain('.error {');

    expect(
      await readFile(
        join(result.directory, '.agents/skills/craft-ts-project/SKILL.md'),
        'utf8',
      ),
    ).toContain('no-raw-class');
  });

  it('creates an Effect v4 starter with a separate Effect skill and Layer boundary', async () => {
    const result = await createFixture('effect', ['codex']);
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.dependencies.effect).toBe('^4.0.0-rc.110');
    expect(packageJson.dependencies['@craft-ts/effect']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n']).toBeDefined();
    expect(packageJson.dependencies['@craft-ts/i18n-effect']).toBeDefined();
    expect(packageJson.devDependencies?.['@effect/tsgo']).toBe('^0.24.3');
    expect(packageJson.devDependencies?.['aria-query']).toBe('^5.3.2');
    expect(packageJson.devDependencies?.typescript).toBe('^6.0.3');
    expect(
      await readFile(join(result.directory, 'src/app/domain.ts'), 'utf8'),
    ).toContain('Layer.succeed');
    expect(
      await readFile(join(result.directory, 'tsconfig.effect.json'), 'utf8'),
    ).toContain('@effect/language-service');
    expect(
      await readFile(join(result.directory, 'src/app/app.config.ts'), 'utf8'),
    ).toContain('Layer.mergeAll(WelcomeRepositoryLive, i18nLayer)');
    expect(
      await readFile(join(result.directory, 'src/i18n/effect.ts'), 'utf8'),
    ).toContain('translateEffectRaw<AppLocales, Key>');
    expect(
      await readFile(join(result.directory, 'src/app/home-page.ts'), 'utf8'),
    ).toContain("i18n.t('order.summary'");
    const homePage = await readFile(
      join(result.directory, 'src/app/home-page.ts'),
      'utf8',
    );
    expect(homePage).toContain('readWelcomeField');
    expect(homePage).not.toContain('const welcome =');
    expect(
      await readFile(
        join(result.directory, '.agents/skills/craft-ts-effect-v4/SKILL.md'),
        'utf8',
      ),
    ).toContain('Effect v4');
    expect(
      await readFile(join(result.directory, 'README.md'), 'utf8'),
    ).toContain('effect-check');
    expect(
      await readFile(
        join(result.directory, '.github/workflows/ci.yml'),
        'utf8',
      ),
    ).toContain('npm run effect-check');
    expect(
      await readFile(join(result.directory, 'eslint.config.mjs'), 'utf8'),
    ).toContain('craftRules.configs.effect.rules');
  });

  it('shares Effect i18n helpers with an Effect backend and plain frontend', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'craft-ts-create-backend-effect-'),
    );
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
      frontendRuntime: 'plain',
      backendRuntime: 'effect',
      i18n: 'strict',
    });

    expect(result.frontendRuntime).toBe('plain');
    expect(result.backendRuntime).toBe('effect');
    const agents = await readFile(join(result.directory, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Frontend runtime: **plain**');
    expect(agents).toContain('Backend runtime: **effect**');
    expect(agents).toContain('The browser runtime is plain');
    expect(
      await readFile(
        join(result.directory, 'src/server/application.ts'),
        'utf8',
      ),
    ).toContain('executeEffect');
    expect(
      await readFile(
        join(result.directory, 'src/server/application.ts'),
        'utf8',
      ),
    ).toContain('runtimeLayer');
    expect(
      await readFile(join(result.directory, 'src/server/node-http.ts'), 'utf8'),
    ).toContain('body: request as unknown as BodyInit');
    expect(
      await readFile(join(result.directory, 'src/server/server.ts'), 'utf8'),
    ).not.toContain('IncomingMessage');
    expect(
      await readFile(
        join(result.directory, 'src/starter.fn-serveur.ts'),
        'utf8',
      ),
    ).toContain('ServerFunctionSuccess');
    expect(
      await readFile(
        join(result.directory, 'src/starter.fn-serveur.ts'),
        'utf8',
      ),
    ).toContain('.use(starterMiddleware)');
    expect(
      await readFile(join(result.directory, 'src/app/app.ts'), 'utf8'),
    ).not.toMatch(
      /@craft-ts\/effect|from ['"]effect['"]|provideLayer|queryEffect/,
    );
    expect(
      await readFile(join(result.directory, 'src/server/i18n.ts'), 'utf8'),
    ).toContain("from '@craft-ts/i18n-effect'");
    await expect(
      readFile(join(result.directory, 'src/i18n/effect.ts'), 'utf8'),
    ).rejects.toThrow();
    expect(
      await readFile(
        join(result.directory, 'src/server/application.ts'),
        'utf8',
      ),
    ).toContain('Layer.mergeAll(StarterRepositoryLive, serverI18nLayer)');
    await expect(
      readFile(join(result.directory, 'src/i18n/effect-layer.ts'), 'utf8'),
    ).rejects.toThrow();
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
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts).toMatchObject({
      'i18n:check': 'craft i18n check',
      'i18n:test': 'craft i18n test',
    });
    expect(
      await readFile(join(result.directory, 'index.html'), 'utf8'),
    ).toContain('<html lang="fr-FR"');
    expect(
      await readFile(
        join(result.directory, 'src/i18n/locales/fr-FR.ts'),
        'utf8',
      ),
    ).toContain('defineLocaleLike');
    expect(
      await readFile(join(result.directory, 'src/i18n/runtime.ts'), 'utf8'),
    ).toContain('const locales = [enUS, frFR] as const;');
    expect(
      await readFile(join(result.directory, 'src/i18n/runtime.ts'), 'utf8'),
    ).toContain('createI18nRuntime<typeof locales>({');
    expect(
      await readFile(
        join(result.directory, '.github/workflows/ci.yml'),
        'utf8',
      ),
    ).toContain('npm run i18n:check');
  });

  it('can generate a domain-first starter without explanatory demo pages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-domain-first-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
      demoPages: false,
      domain: 'animal',
      i18n: 'none',
      designSystem: 'none',
      typedCss: false,
    });

    expect(result.config.demoPages).toBe(false);
    expect(result.config.domain).toBe('animal');
    await expect(
      readFile(join(result.directory, 'src/app/home-page.ts'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(join(result.directory, 'src/app/about-page.ts'), 'utf8'),
    ).rejects.toThrow();
    expect(
      await readFile(
        join(result.directory, 'src/app/features/animal/animal-page.ts'),
        'utf8',
      ),
    ).toContain('animal feature boundary');
    expect(
      await readFile(join(result.directory, 'src/app/app.routes.ts'), 'utf8'),
    ).toContain("path: 'animal'");
    expect(
      await readFile(join(result.directory, 'README.md'), 'utf8'),
    ).toContain('no explanatory demo pages');
    expect(
      await readFile(join(result.directory, 'src/app/app.ts'), 'utf8'),
    ).not.toContain('  span,');
  });

  it('generates a one-shot reset command for the default demo starter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-ts-create-reset-'));
    temporaryDirectories.push(root);
    const result = await createCraftProject({
      directory: 'starter',
      rootDir: root,
      agents: [],
      i18n: 'none',
      designSystem: 'none',
      typedCss: false,
    });
    const packageJson = JSON.parse(
      await readFile(join(result.directory, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['reset:starter']).toBe(
      'node scripts/reset-starter.mjs',
    );
    expect(
      await readFile(join(result.directory, '.craft/starter.json'), 'utf8'),
    ).toContain('"status": "demo"');

    const output = execFileSync(
      process.execPath,
      ['scripts/reset-starter.mjs'],
      {
        cwd: result.directory,
        encoding: 'utf8',
      },
    );
    expect(output).toContain('Reset complete');
    await expect(
      readFile(join(result.directory, 'src/app/home-page.ts'), 'utf8'),
    ).rejects.toThrow();
    expect(
      await readFile(
        join(result.directory, 'src/app/features/feature/feature-page.ts'),
        'utf8',
      ),
    ).toContain('feature feature boundary');
    expect(
      await readFile(join(result.directory, '.craft/starter.json'), 'utf8'),
    ).toContain('"status": "domain"');

    const secondOutput = execFileSync(
      process.execPath,
      ['scripts/reset-starter.mjs'],
      {
        cwd: result.directory,
        encoding: 'utf8',
      },
    );
    expect(secondOutput).toContain('already in domain-first state');
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
