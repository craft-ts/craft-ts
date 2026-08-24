import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isCraftDeploymentProviderModule,
  type CraftDeploymentDiagnostic,
  type CraftDeploymentProvider,
} from '@craft-ts/deploy';

export type LoadedCraftDeploymentProvider = Readonly<{
  provider: CraftDeploymentProvider | null;
  /** Module specifier that was resolved, for diagnostics. */
  specifier: string;
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

export type LoadCraftDeploymentProviderOptions = Readonly<{
  name: string;
  /** Project the provider is resolved from. */
  rootDir: string;
  /** Explicit module specifier, overriding `@craft-ts/deploy-<name>`. */
  module?: string;
  /** Options handed to the provider factory. */
  providerOptions?: Readonly<Record<string, unknown>>;
}>;

/**
 * Resolves a provider package at run time.
 *
 * The CLI has no dependency on any provider: it imports
 * `@craft-ts/deploy-<name>` from the project being deployed and reads the one
 * factory the contract defines. Adding a provider never means changing the CLI.
 */
export async function loadCraftDeploymentProvider(
  options: LoadCraftDeploymentProviderOptions,
): Promise<LoadedCraftDeploymentProvider> {
  const specifier = options.module ?? `@craft-ts/deploy-${options.name}`;

  let module: unknown;
  try {
    module = await importFromProject(specifier, options.rootDir);
  } catch (error) {
    return {
      provider: null,
      specifier,
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_PROVIDER_NOT_INSTALLED',
          severity: 'error',
          provider: options.name,
          message: `\`${specifier}\` could not be imported: ${messageOf(error)}`,
          fix: `Install \`${specifier}\`, or pass \`--provider-module\` with the module that exports the provider.`,
        },
      ],
    };
  }

  if (!isCraftDeploymentProviderModule(module)) {
    return {
      provider: null,
      specifier,
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_PROVIDER_INVALID_MODULE',
          severity: 'error',
          provider: options.name,
          message: `\`${specifier}\` exports no \`createCraftDeploymentProvider\` factory.`,
          fix: 'Export `createCraftDeploymentProvider(options?)` returning a `CraftDeploymentProvider`.',
        },
      ],
    };
  }

  const provider = module.createCraftDeploymentProvider(
    options.providerOptions ?? {},
  );

  if (provider.name !== options.name && options.module === undefined) {
    return {
      provider,
      specifier,
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_PROVIDER_INVALID_MODULE',
          severity: 'warning',
          provider: options.name,
          message: `\`${specifier}\` provides \`${provider.name}\`, not \`${options.name}\`.`,
          fix: 'Use the provider name the package declares, or pass `--provider-module` explicitly.',
        },
      ],
    };
  }

  return { provider, specifier, diagnostics: [] };
}

/**
 * Resolves from the deployed project, not from wherever the CLI is installed:
 * a globally installed `craft-ts` must still find the provider a project
 * declares in its own dependencies.
 */
async function importFromProject(
  specifier: string,
  rootDir: string,
): Promise<unknown> {
  try {
    const requireFromProject = createRequire(join(rootDir, 'package.json'));
    const resolved = requireFromProject.resolve(specifier);
    return await import(pathToFileURL(resolved).href);
  } catch {
    return await import(specifier);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
