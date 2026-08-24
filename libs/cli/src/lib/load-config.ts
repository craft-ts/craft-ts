import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CraftDeploymentDiagnostic } from '@craft-ts/deploy';

/** Manifest file names looked up, in priority order. */
export const CRAFT_DEPLOYMENT_CONFIG_FILES = [
  'craft.deploy.ts',
  'craft.deploy.mts',
  'craft.deploy.mjs',
  'craft.deploy.js',
  'craft.deploy.json',
] as const;

export type LoadedCraftDeploymentConfig = Readonly<{
  /** Path relative to the root, or `null` when nothing was loaded. */
  file: string | null;
  definition: unknown;
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

export type LoadCraftDeploymentConfigOptions = Readonly<{
  rootDir: string;
  /** Explicit manifest path, relative to the root or absolute. */
  config?: string;
}>;

/**
 * Finds and loads the deployment manifest.
 *
 * Loading is a separate step from checking so a provider, a test or a build
 * can hand a manifest object over without ever touching a config file.
 */
export async function loadCraftDeploymentConfig(
  options: LoadCraftDeploymentConfigOptions,
): Promise<LoadedCraftDeploymentConfig> {
  const rootDir = resolve(options.rootDir);
  const file = locate(rootDir, options.config);

  if (!file) {
    return {
      file: null,
      definition: null,
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_CONFIG_NOT_FOUND',
          severity: 'error',
          message: options.config
            ? `\`${options.config}\` does not exist.`
            : `No deployment manifest was found in \`${rootDir}\`.`,
          fix: `Create one of ${CRAFT_DEPLOYMENT_CONFIG_FILES.join(', ')}, or pass \`--config\`.`,
        },
      ],
    };
  }

  const relativeFile = relative(rootDir, file) || file;

  if (file.endsWith('.json')) {
    try {
      return {
        file: relativeFile,
        definition: JSON.parse(readFileSync(file, 'utf8')),
        diagnostics: [],
      };
    } catch (error) {
      return loadFailure(relativeFile, error);
    }
  }

  try {
    const module = await importModule(file);
    const definition = (module as { default?: unknown }).default;
    if (definition === undefined) {
      return {
        file: relativeFile,
        definition: null,
        diagnostics: [
          {
            code: 'CRAFT_DEPLOY_CONFIG_NO_DEFAULT_EXPORT',
            severity: 'error',
            file: relativeFile,
            message: `\`${relativeFile}\` exports no default.`,
            fix: 'Add `export default defineCraftDeployment({ ... })`.',
          },
        ],
      };
    }
    return { file: relativeFile, definition, diagnostics: [] };
  } catch (error) {
    return loadFailure(relativeFile, error);
  }
}

function loadFailure(
  file: string,
  error: unknown,
): LoadedCraftDeploymentConfig {
  return {
    file,
    definition: null,
    diagnostics: [
      {
        code: 'CRAFT_DEPLOY_CONFIG_LOAD_FAILED',
        severity: 'error',
        file,
        message: `\`${file}\` could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fix: 'Fix the reported error, run the CLI under a TypeScript loader, or commit a `craft.deploy.json`.',
      },
    ],
  };
}

function locate(rootDir: string, config?: string): string | null {
  if (config) {
    const path = isAbsolute(config) ? config : resolve(rootDir, config);
    return existsSync(path) ? path : null;
  }
  for (const name of CRAFT_DEPLOYMENT_CONFIG_FILES) {
    const path = join(rootDir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

type TypeScriptModule = Readonly<{
  ModuleKind: Readonly<Record<string, number>>;
  ScriptTarget: Readonly<Record<string, number>>;
  transpileModule(
    input: string,
    options: {
      compilerOptions: Record<string, unknown>;
      fileName?: string;
    },
  ): { outputText: string };
}>;

async function importModule(file: string): Promise<unknown> {
  if (!/\.m?ts$/.test(file)) {
    return await import(pathToFileURL(file).href);
  }
  try {
    // Recent Node versions strip types themselves, and a TypeScript loader
    // such as tsx makes this branch the only one ever taken.
    return await import(pathToFileURL(file).href);
  } catch (error) {
    if (!isTypeStrippingFailure(error)) throw error;
    return await importTranspiled(file);
  }
}

function isTypeStrippingFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return (
    code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
    code === 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' ||
    /Unknown file extension|Unsupported file extension|TypeScript/i.test(
      error.message,
    )
  );
}

/**
 * Transpiles the manifest with the TypeScript installed next to it and imports
 * the result from a sibling file, so relative imports and package resolution
 * keep working exactly as they do for the original.
 */
async function importTranspiled(file: string): Promise<unknown> {
  const requireFromConfig = createRequire(file);
  const typescript = requireFromConfig('typescript') as TypeScriptModule;
  const { outputText } = typescript.transpileModule(
    readFileSync(file, 'utf8'),
    {
      fileName: file,
      compilerOptions: {
        module: typescript.ModuleKind['ESNext'],
        target: typescript.ScriptTarget['ES2022'],
        verbatimModuleSyntax: false,
      },
    },
  );

  const temporary = join(
    dirname(file),
    `.craft-deploy.${process.pid}.${Date.now()}.mjs`,
  );
  writeFileSync(temporary, outputText, 'utf8');
  try {
    return await import(pathToFileURL(temporary).href);
  } finally {
    rmSync(temporary, { force: true });
  }
}
