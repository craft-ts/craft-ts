import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCraftDeployment } from './check.js';
import type { CraftDeploymentDiagnostic } from './diagnostics.js';
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

const find = (
  diagnostics: readonly CraftDeploymentDiagnostic[],
  code: string,
) => diagnostics.filter((diagnostic) => diagnostic.code === code);

describe('checkCraftDeployment', () => {
  it('stops at the manifest when it cannot be resolved', () => {
    const result = checkCraftDeployment({
      rootDir: workspace.root,
      definition: { name: 'demo' },
    });

    expect(result.passed).toBe(false);
    expect(result.manifest).toBeNull();
  });

  describe('worker runtime', () => {
    const workerDefinition = {
      name: 'demo',
      runtime: 'worker',
      platform: 'cloudflare',
      worker: { entry: 'dist/worker.js', source: 'src/worker.ts' },
    } as const;

    it('refuses a Node built-in reachable from the entry', () => {
      workspace.write(
        'src/worker.ts',
        `import { handle } from './handler';\nexport default { fetch: handle };\n`,
      );
      workspace.write(
        'src/handler.ts',
        `import { readFile } from 'node:fs/promises';\nexport const handle = () => readFile('x');\n`,
      );
      workspace.mkdir('dist');
      workspace.write('dist/worker.js', 'export default {};');

      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: workerDefinition,
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_NODE_BUILTIN_IMPORT')).toEqual([
        expect.objectContaining({
          severity: 'error',
          file: 'src/handler.ts',
          line: 1,
          runtime: 'worker',
          platform: 'cloudflare',
        }),
      ]);
    });

    it('accepts an entry that only uses Web APIs', () => {
      workspace.write(
        'src/worker.ts',
        `export default { fetch: (request: Request) => new Response(request.url) };\n`,
      );
      workspace.write('dist/worker.js', 'export default {};');

      const result = checkCraftDeployment({
        rootDir: workspace.root,
        definition: workerDefinition,
      });

      expect(result.passed).toBe(true);
    });

    it('ignores a Node built-in named inside a comment', () => {
      workspace.write(
        'src/worker.ts',
        `// import { readFile } from 'node:fs';\nexport default {};\n`,
      );
      workspace.write('dist/worker.js', 'export default {};');

      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: workerDefinition,
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_NODE_BUILTIN_IMPORT')).toEqual([]);
    });
  });

  describe('node runtime', () => {
    const nodeDefinition = (source: string) =>
      ({
        name: 'demo',
        runtime: 'node',
        platform: 'docker',
        server: {
          entry: 'dist/server.js',
          source,
          healthPath: '/health',
          readyPath: '/ready',
        },
      }) as const;

    it('refuses an SSR entry that never serves the declared routes', () => {
      workspace.write('src/server.ts', `export const start = () => {};\n`);
      workspace.write('dist/server.js', 'export const start = () => {};');

      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: nodeDefinition('src/server.ts'),
      }).diagnostics;

      expect(diagnostics.map((d) => d.code)).toEqual(
        expect.arrayContaining([
          'CRAFT_DEPLOY_HEALTH_PATH_MISSING',
          'CRAFT_DEPLOY_READY_PATH_MISSING',
        ]),
      );
    });

    it('accepts an SSR entry serving both routes', () => {
      workspace.write(
        'src/server.ts',
        `const routes = ['/health', '/ready'];\nexport default routes;\n`,
      );
      workspace.write('dist/server.js', 'export default [];');

      const result = checkCraftDeployment({
        rootDir: workspace.root,
        definition: nodeDefinition('src/server.ts'),
      });

      expect(result.passed).toBe(true);
    });

    it('warns about an environment variable read but not declared', () => {
      workspace.write(
        'src/server.ts',
        `const routes = ['/health', '/ready'];\nexport const port = process.env.PORT;\n`,
      );
      workspace.write('dist/server.js', 'export default [];');

      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: nodeDefinition('src/server.ts'),
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_ENV_UNDECLARED')).toEqual([
        expect.objectContaining({ severity: 'warning' }),
      ]);
    });

    it('stays silent once the variable is declared', () => {
      workspace.write(
        'src/server.ts',
        `const routes = ['/health', '/ready'];\nexport const port = process.env.PORT;\n`,
      );
      workspace.write('dist/server.js', 'export default [];');

      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: {
          ...nodeDefinition('src/server.ts'),
          env: [{ name: 'PORT', required: false }],
        },
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_ENV_UNDECLARED')).toEqual([]);
    });
  });

  describe('declared paths', () => {
    const definition = {
      name: 'demo',
      runtime: 'node',
      platform: 'docker',
      server: {
        entry: 'dist/server.js',
        healthPath: '/health',
        readyPath: '/ready',
      },
    } as const;

    it('tolerates a missing build output before the build', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition,
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_PATH_MISSING')).toEqual([
        expect.objectContaining({ severity: 'warning', path: 'server.entry' }),
      ]);
    });

    it('refuses the same missing output once the artefact is inspected', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition,
        artifact: true,
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_PATH_MISSING')).toEqual([
        expect.objectContaining({ severity: 'error', path: 'server.entry' }),
      ]);
    });

    it('refuses a missing source path at any time', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: { ...definition, functions: { entry: 'src/server.ts' } },
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_PATH_MISSING')).toContainEqual(
        expect.objectContaining({ severity: 'error', path: 'functions.entry' }),
      );
    });
  });

  describe('requested target', () => {
    const definition = {
      name: 'demo',
      runtime: 'node',
      platform: 'docker',
      server: {
        entry: 'dist/server.js',
        healthPath: '/health',
        readyPath: '/ready',
      },
    } as const;

    it('refuses a runtime the manifest does not declare', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition,
        runtime: 'worker',
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_RUNTIME_MISMATCH')).toHaveLength(
        1,
      );
    });

    it('refuses a platform the manifest does not declare', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition,
        platform: 'cloudflare',
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_PLATFORM_MISMATCH')).toHaveLength(
        1,
      );
    });
  });

  describe('provider', () => {
    const staticDefinition = {
      name: 'demo',
      runtime: 'static',
      platform: 'cloudflare',
      static: { mode: 'ssg', routes: ['/'] },
      client: { build: 'vite build', outDir: 'dist' },
    } as const;

    it('reports an unknown provider', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: staticDefinition,
        provider: 'heroku',
      }).diagnostics;

      expect(find(diagnostics, 'CRAFT_DEPLOY_PROVIDER_UNKNOWN')).toHaveLength(
        1,
      );
    });

    it('accepts a provider declaring the capability and the platform', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: staticDefinition,
        provider: 'cloudflare-pages',
      }).diagnostics;

      expect(
        diagnostics.filter((d) => d.code.startsWith('CRAFT_DEPLOY_PROVIDER')),
      ).toEqual([]);
    });

    it('refuses a provider missing the runtime capability', () => {
      const diagnostics = checkCraftDeployment({
        rootDir: workspace.root,
        definition: {
          name: 'demo',
          runtime: 'node',
          platform: 'docker',
          server: {
            entry: 'dist/server.js',
            healthPath: '/health',
            readyPath: '/ready',
          },
        },
        provider: 'github-pages',
      }).diagnostics;

      expect(
        find(diagnostics, 'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING'),
      ).toEqual([
        expect.objectContaining({ provider: 'github-pages', runtime: 'node' }),
      ]);
    });
  });

  it('warns about a server-function identifier absent from the registry', () => {
    workspace.write(
      'src/server.ts',
      `export const functions = ['demo.users.list'];\n`,
    );

    const diagnostics = checkCraftDeployment({
      rootDir: workspace.root,
      definition: {
        name: 'demo',
        runtime: 'node',
        platform: 'docker',
        server: {
          entry: 'dist/server.js',
          healthPath: '/health',
          readyPath: '/ready',
        },
        functions: {
          entry: 'src/server.ts',
          ids: ['demo.users.list', 'demo.users.remove'],
        },
      },
    }).diagnostics;

    expect(find(diagnostics, 'CRAFT_DEPLOY_FUNCTION_ID_UNKNOWN')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: 'functions.ids[1]',
      }),
    ]);
  });
});
