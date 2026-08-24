import type {
  CraftDeploymentDiagnostic,
  CraftDeploymentPlan,
  CraftDeploymentPlannedResource,
  CraftDeploymentRequest,
} from '@craft-ts/deploy';
import { awsPreset } from './presets/aws.js';
import { cloudflarePreset } from './presets/cloudflare.js';
import type { AlchemyPreset } from './presets/preset.js';
import type {
  AlchemyResourceRequest,
  AlchemyResourceState,
} from './runtime.js';

export const ALCHEMY_PRESETS: Readonly<Record<string, AlchemyPreset>> =
  Object.freeze({
    cloudflare: cloudflarePreset,
    aws: awsPreset,
  });

export type AlchemyPlanInput = Readonly<{
  request: CraftDeploymentRequest;
  /** What Alchemy already records for this application and stage. */
  existing: readonly AlchemyResourceState[];
}>;

export type AlchemyPlanResult = Readonly<{
  plan: CraftDeploymentPlan;
  /** Resources to apply, in declaration order, when the plan is approved. */
  resources: readonly AlchemyResourceRequest[];
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

/**
 * Turns a manifest and the recorded state into the list of actions a
 * deployment would take.
 *
 * The function is pure: it reads no environment, opens no connection and
 * touches no infrastructure, which is what makes a preview trustworthy.
 */
export function planAlchemyDeployment(
  input: AlchemyPlanInput,
): AlchemyPlanResult {
  const { request, existing } = input;
  const preset = ALCHEMY_PRESETS[request.manifest.platform];

  if (!preset) {
    return {
      plan: {
        provider: 'alchemy',
        stage: request.stage,
        resources: [],
        notes: [],
      },
      resources: [],
      diagnostics: [
        {
          code: 'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
          severity: 'error',
          provider: 'alchemy',
          platform: request.manifest.platform,
          message: `Alchemy has no preset for \`${request.manifest.platform}\`.`,
          fix: `Use one of ${Object.keys(ALCHEMY_PRESETS).join(', ')}, or another provider.`,
        },
      ],
    };
  }

  const { resources, notes, diagnostics } = preset(request);
  const declared = new Set(resources.map(identify));
  const planned: CraftDeploymentPlannedResource[] = resources.map(
    (resource) => ({
      type: resource.type,
      name: resource.name,
      action: actionFor(resource, existing),
      details: describe(resource.properties),
    }),
  );

  // A resource Alchemy still records but the manifest no longer declares is
  // deleted on finalize; a preview that hid it would understate the change.
  for (const state of existing) {
    if (declared.has(identify(state))) continue;
    planned.push({
      type: state.type,
      name: state.name,
      action: 'delete',
      details: describe(state.outputs),
    });
  }

  return {
    plan: {
      provider: 'alchemy',
      stage: request.stage,
      resources: planned,
      notes,
    },
    resources,
    diagnostics,
  };
}

function identify(resource: { type: string; name: string }): string {
  return `${resource.type}#${resource.name}`;
}

function actionFor(
  resource: AlchemyResourceRequest,
  existing: readonly AlchemyResourceState[],
): CraftDeploymentPlannedResource['action'] {
  const recorded = existing.find(
    (state) => identify(state) === identify(resource),
  );
  if (!recorded) return 'create';
  if (!recorded.properties) return 'update';
  return sameProperties(recorded.properties, resource.properties)
    ? 'unchanged'
    : 'update';
}

function sameProperties(
  recorded: Readonly<Record<string, unknown>>,
  declared: Readonly<Record<string, unknown>>,
): boolean {
  return stableJson(recorded) === stableJson(declared);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Renders properties as the flat, secret-free facts a preview shows. */
function describe(
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    details[key] = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  }
  return details;
}
