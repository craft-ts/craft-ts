import type {
  CraftDeploymentDiagnostic,
  CraftDeploymentPlatform,
} from '@craft-ts/deploy';

export type AlchemyEnvironment = Readonly<Record<string, string | undefined>>;

type CredentialRule = Readonly<{
  /** Any one of these names satisfies the rule. */
  anyOf: readonly string[];
  purpose: string;
}>;

/**
 * Credentials each platform needs. The tooling never reads a value beyond
 * checking that it is set, and never writes one anywhere.
 */
const RULES: Partial<
  Record<CraftDeploymentPlatform, readonly CredentialRule[]>
> = {
  cloudflare: [
    {
      anyOf: [
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_API_KEY',
        'ALCHEMY_PROFILE',
      ],
      purpose: 'authenticate against the Cloudflare API',
    },
    {
      anyOf: ['CLOUDFLARE_ACCOUNT_ID', 'ALCHEMY_PROFILE'],
      purpose: 'select the Cloudflare account the resources belong to',
    },
  ],
  aws: [
    {
      anyOf: ['AWS_ACCESS_KEY_ID', 'AWS_PROFILE', 'AWS_ROLE_ARN'],
      purpose: 'authenticate against the AWS API',
    },
    {
      anyOf: ['AWS_REGION', 'AWS_DEFAULT_REGION'],
      purpose: 'select the AWS region the resources belong to',
    },
  ],
};

export function checkAlchemyCredentials(
  platform: CraftDeploymentPlatform,
  environment: AlchemyEnvironment,
): readonly CraftDeploymentDiagnostic[] {
  const diagnostics: CraftDeploymentDiagnostic[] = [];
  const isSet = (name: string) => (environment[name] ?? '').trim().length > 0;

  for (const rule of RULES[platform] ?? []) {
    if (rule.anyOf.some(isSet)) continue;
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
      severity: 'error',
      provider: 'alchemy',
      platform,
      message: `None of ${rule.anyOf.join(', ')} is set, and Alchemy needs one to ${rule.purpose}.`,
      fix: `Export ${rule.anyOf[0]} in the shell or the CI secret store; never write it in the manifest.`,
    });
  }

  if (RULES[platform] === undefined || (RULES[platform] ?? []).length === 0) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
      severity: 'error',
      provider: 'alchemy',
      platform,
      message: `Alchemy has no credential profile for \`${platform}\`.`,
      fix: 'Deploy to `cloudflare` or `aws`, or use another provider.',
    });
  }

  return diagnostics;
}

/** Credential names a platform reads, for documentation and error messages. */
export function alchemyCredentialNames(
  platform: CraftDeploymentPlatform,
): readonly string[] {
  const rules = RULES[platform] ?? [];
  if (rules.length === 0) return [];
  return [...new Set(rules.flatMap((rule) => rule.anyOf))];
}
