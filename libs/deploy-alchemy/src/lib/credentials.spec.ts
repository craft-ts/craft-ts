import { describe, expect, it } from 'vitest';
import {
  alchemyCredentialNames,
  checkAlchemyCredentials,
} from './credentials.js';
import { AWS_CREDENTIALS, CLOUDFLARE_CREDENTIALS } from './testing.fixture.js';

const codesOf = (
  platform: Parameters<typeof checkAlchemyCredentials>[0],
  environment: Record<string, string | undefined>,
) => checkAlchemyCredentials(platform, environment).map((d) => d.code);

describe('checkAlchemyCredentials', () => {
  it('accepts a complete Cloudflare environment', () => {
    expect(codesOf('cloudflare', { ...CLOUDFLARE_CREDENTIALS })).toEqual([]);
  });

  it('accepts a complete AWS environment', () => {
    expect(codesOf('aws', { ...AWS_CREDENTIALS })).toEqual([]);
  });

  it('accepts either form of a credential', () => {
    expect(
      codesOf('aws', {
        AWS_PROFILE: 'craft',
        AWS_DEFAULT_REGION: 'eu-west-3',
        ALCHEMY_PASSWORD: 'passphrase',
      }),
    ).toEqual([]);
  });

  it('reports the missing token by name', () => {
    const diagnostics = checkAlchemyCredentials('cloudflare', {
      CLOUDFLARE_ACCOUNT_ID: 'account',
      ALCHEMY_PASSWORD: 'passphrase',
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING',
        provider: 'alchemy',
        platform: 'cloudflare',
      }),
    ]);
    expect(diagnostics[0]?.message).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('treats a blank value as absent', () => {
    expect(
      codesOf('cloudflare', {
        ...CLOUDFLARE_CREDENTIALS,
        CLOUDFLARE_API_TOKEN: '  ',
      }),
    ).toContain('CRAFT_DEPLOY_PROVIDER_CREDENTIALS_MISSING');
  });

  it('refuses to deploy a state it could not read back', () => {
    expect(
      codesOf('cloudflare', {
        CLOUDFLARE_API_TOKEN: 'token',
        CLOUDFLARE_ACCOUNT_ID: 'account',
      }),
    ).toEqual(['CRAFT_DEPLOY_PROVIDER_STATE_UNAVAILABLE']);
  });

  it('reports a platform Alchemy has no profile for', () => {
    expect(codesOf('github-pages', {})).toEqual([
      'CRAFT_DEPLOY_PROVIDER_PLATFORM_UNSUPPORTED',
    ]);
  });

  it('never puts a value in a diagnostic', () => {
    const diagnostics = checkAlchemyCredentials('cloudflare', {
      CLOUDFLARE_ACCOUNT_ID: 'super-secret-account',
      ALCHEMY_PASSWORD: 'passphrase',
    });

    expect(JSON.stringify(diagnostics)).not.toContain('super-secret-account');
  });
});

describe('alchemyCredentialNames', () => {
  it('lists what a platform reads, for the documentation', () => {
    expect(alchemyCredentialNames('cloudflare')).toContain('ALCHEMY_PASSWORD');
    expect(alchemyCredentialNames('github-pages')).toEqual([]);
  });
});
