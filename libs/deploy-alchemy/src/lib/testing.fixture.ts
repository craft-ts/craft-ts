import {
  resolveCraftDeploymentManifest,
  type CraftDeploymentDefinition,
  type CraftDeploymentRequest,
} from '@craft-ts/deploy';
import type {
  AlchemyOpenOptions,
  AlchemyResourceRequest,
  AlchemyResourceState,
  AlchemyRuntime,
  AlchemyScope,
} from './runtime.js';

export function request(
  definition: CraftDeploymentDefinition,
  overrides: Partial<Omit<CraftDeploymentRequest, 'manifest'>> = {},
): CraftDeploymentRequest {
  return {
    manifest: resolveCraftDeploymentManifest(definition),
    rootDir: overrides.rootDir ?? '/workspace',
    stage: overrides.stage ?? 'production',
  };
}

export type RecordingRuntime = AlchemyRuntime &
  Readonly<{
    /** Every scope opened, in order, with its phase. */
    opened: AlchemyOpenOptions[];
    /** Every resource applied, in order. */
    applied: AlchemyResourceRequest[];
    finalized: number;
    disposed: number;
  }>;

/**
 * An Alchemy runtime that records instead of provisioning.
 *
 * The point of the port is that a preview can be proven not to mutate: this
 * fake makes "did anything call `apply`?" an assertion.
 */
export function recordingRuntime(
  existing: readonly AlchemyResourceState[] = [],
  outputsFor: (
    resource: AlchemyResourceRequest,
  ) => Readonly<Record<string, string>> = () => ({}),
): RecordingRuntime {
  const opened: AlchemyOpenOptions[] = [];
  const applied: AlchemyResourceRequest[] = [];
  const counters = { finalized: 0, disposed: 0 };

  const scope: AlchemyScope = {
    read: async () => existing,
    apply: async (resource) => {
      applied.push(resource);
      return {
        type: resource.type,
        name: resource.name,
        outputs: outputsFor(resource),
        properties: resource.properties,
      };
    },
    finalize: async () => {
      counters.finalized += 1;
    },
    dispose: async () => {
      counters.disposed += 1;
    },
  };

  return {
    version: '0.70.0-test',
    opened,
    applied,
    get finalized() {
      return counters.finalized;
    },
    get disposed() {
      return counters.disposed;
    },
    open: async (options) => {
      opened.push(options);
      return scope;
    },
  } as RecordingRuntime;
}

export const CLOUDFLARE_CREDENTIALS = Object.freeze({
  CLOUDFLARE_API_TOKEN: 'token',
  CLOUDFLARE_ACCOUNT_ID: 'account',
  ALCHEMY_PASSWORD: 'passphrase',
});

export const AWS_CREDENTIALS = Object.freeze({
  AWS_ACCESS_KEY_ID: 'key',
  AWS_REGION: 'eu-west-3',
  ALCHEMY_PASSWORD: 'passphrase',
});
