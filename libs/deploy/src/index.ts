export {
  CRAFT_DEPLOYMENT_PLATFORMS,
  CRAFT_DEPLOYMENT_PROTOCOL_VERSION,
  CRAFT_DEPLOYMENT_RUNTIMES,
  CRAFT_SOURCE_MAP_POLICIES,
  CRAFT_STATIC_MODES,
  defineCraftDeployment,
} from './lib/manifest.js';
export type {
  CraftDeploymentArtifact,
  CraftDeploymentArtifactInput,
  CraftDeploymentBinding,
  CraftDeploymentClient,
  CraftDeploymentDefinition,
  CraftDeploymentEnvironmentVariable,
  CraftDeploymentFunctions,
  CraftDeploymentFunctionsInput,
  CraftDeploymentLambda,
  CraftDeploymentLambdaInput,
  CraftDeploymentManifest,
  CraftDeploymentPlatform,
  CraftDeploymentRuntime,
  CraftDeploymentServer,
  CraftDeploymentServerInput,
  CraftDeploymentStatic,
  CraftDeploymentStaticInput,
  CraftDeploymentWorker,
  CraftDeploymentWorkerInput,
  CraftLambdaDeploymentDefinition,
  CraftLambdaDeploymentManifest,
  CraftNodeDeploymentDefinition,
  CraftNodeDeploymentManifest,
  CraftSourceMapPolicy,
  CraftStaticDeploymentDefinition,
  CraftStaticDeploymentManifest,
  CraftStaticMode,
  CraftWorkerDeploymentDefinition,
  CraftWorkerDeploymentManifest,
} from './lib/manifest.js';

export {
  CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES,
  CRAFT_DEPLOYMENT_DIAGNOSTICS,
} from './lib/diagnostics.js';
export type {
  CraftDeploymentDiagnostic,
  CraftDeploymentDiagnosticCode,
  CraftDeploymentDiagnosticDescription,
  CraftDeploymentSeverity,
} from './lib/diagnostics.js';

export {
  formatCraftDeploymentDiagnostic,
  formatCraftDeploymentPlan,
} from './lib/format.js';

export {
  parseCraftDeploymentManifest,
  resolveCraftDeploymentManifest,
  serializeCraftDeploymentManifest,
} from './lib/protocol.js';
export type { CraftDeploymentParseResult } from './lib/protocol.js';

export { validateCraftDeploymentDefinition } from './lib/validate.js';
export type { CraftDeploymentValidation } from './lib/validate.js';

export {
  CRAFT_DEPLOYMENT_CAPABILITIES,
  CRAFT_DEPLOYMENT_PROVIDERS,
  CRAFT_DEPLOYMENT_RESOURCE_ACTIONS,
  CRAFT_RUNTIME_PLATFORMS,
  findCraftDeploymentProvider,
  isCraftDeploymentProviderModule,
  isRuntimeSupportedByPlatform,
  requiredCapability,
} from './lib/providers.js';
export type {
  CraftDeploymentCapability,
  CraftDeploymentPlan,
  CraftDeploymentPlannedResource,
  CraftDeploymentProvider,
  CraftDeploymentProviderDescriptor,
  CraftDeploymentProviderModule,
  CraftDeploymentRequest,
  CraftDeploymentResourceAction,
  CraftDeploymentResult,
} from './lib/providers.js';

export { checkCraftDeployment } from './lib/check.js';
export type {
  CraftDeploymentCheckOptions,
  CraftDeploymentCheckResult,
} from './lib/check.js';

export { checkCraftDeploymentArtifact } from './lib/artifact.js';
export type { CraftArtifactCheckOptions } from './lib/artifact.js';

export {
  collectEnvironmentReads,
  isNodeBuiltin,
  readCraftModuleGraph,
} from './lib/sources.js';
export type { CraftModuleGraph, CraftModuleImport } from './lib/sources.js';
