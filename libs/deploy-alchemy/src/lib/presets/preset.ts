import type {
  CraftDeploymentDiagnostic,
  CraftDeploymentRequest,
} from '@craft-ts/deploy';
import type { AlchemyResourceRequest } from '../runtime.js';

export type AlchemyPresetResult = Readonly<{
  resources: readonly AlchemyResourceRequest[];
  /** Facts an operator should know before approving the plan. */
  notes: readonly string[];
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

export type AlchemyPreset = (
  request: CraftDeploymentRequest,
) => AlchemyPresetResult;

/** Names only: a manifest never carries a value, and neither does a plan. */
export function environmentNames(request: CraftDeploymentRequest): string {
  return request.manifest.env.map((variable) => variable.name).join(', ');
}

export function unsupported(
  message: string,
  fix: string,
  request: CraftDeploymentRequest,
): CraftDeploymentDiagnostic {
  return {
    code: 'CRAFT_DEPLOY_PROVIDER_UNSUPPORTED_RESOURCE',
    severity: 'error',
    provider: 'alchemy',
    runtime: request.manifest.runtime,
    platform: request.manifest.platform,
    message,
    fix,
  };
}
