import type { CraftDeploymentProvider } from '@craft-ts/deploy';
import {
  createAlchemyDeploymentProvider,
  type AlchemyProviderOptions,
} from './lib/provider.js';

export { createAlchemyDeploymentProvider } from './lib/provider.js';
export type { AlchemyProviderOptions } from './lib/provider.js';

/**
 * The factory the CraftTS CLI looks for when it resolves
 * `@craft-ts/deploy-alchemy`. Keeping the name generic is what lets the CLI
 * load any provider package without knowing it exists.
 */
export function createCraftDeploymentProvider(
  options: Readonly<Record<string, unknown>> = {},
): CraftDeploymentProvider {
  return createAlchemyDeploymentProvider(options as AlchemyProviderOptions);
}

export {
  alchemyCredentialNames,
  checkAlchemyCredentials,
} from './lib/credentials.js';
export type { AlchemyEnvironment } from './lib/credentials.js';

export { ALCHEMY_PRESETS, planAlchemyDeployment } from './lib/plan.js';
export type { AlchemyPlanInput, AlchemyPlanResult } from './lib/plan.js';

export { awsPreset } from './lib/presets/aws.js';
export { cloudflarePreset } from './lib/presets/cloudflare.js';
export type {
  AlchemyPreset,
  AlchemyPresetResult,
} from './lib/presets/preset.js';

export { alchemyResourceName } from './lib/naming.js';

export {
  ALCHEMY_RESOURCE_EXPORTS,
  loadAlchemyRuntime,
} from './lib/alchemy-runtime.js';

export type {
  AlchemyOpenOptions,
  AlchemyPhase,
  AlchemyResourceRequest,
  AlchemyResourceState,
  AlchemyRuntime,
  AlchemyRuntimeLoader,
  AlchemyScope,
} from './lib/runtime.js';
