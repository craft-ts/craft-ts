import { describe, expect, it } from 'vitest';
import {
  CRAFT_DEPLOYMENT_CAPABILITIES,
  CRAFT_DEPLOYMENT_PROVIDERS,
  CRAFT_RUNTIME_PLATFORMS,
  findCraftDeploymentProvider,
  isRuntimeSupportedByPlatform,
  requiredCapability,
} from './providers.js';
import {
  CRAFT_DEPLOYMENT_PLATFORMS,
  CRAFT_DEPLOYMENT_RUNTIMES,
} from './manifest.js';

describe('provider matrix', () => {
  it('names every provider once', () => {
    const names = CRAFT_DEPLOYMENT_PROVIDERS.map((provider) => provider.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('documents each provider well enough to choose it', () => {
    for (const provider of CRAFT_DEPLOYMENT_PROVIDERS) {
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.platforms.length).toBeGreaterThan(0);
      expect(provider.artifact.length).toBeGreaterThan(0);
      expect(provider.credentials.length).toBeGreaterThan(0);
      expect(provider.limits.length).toBeGreaterThan(0);
    }
  });

  it('only uses documented capabilities and platforms', () => {
    for (const provider of CRAFT_DEPLOYMENT_PROVIDERS) {
      for (const capability of provider.capabilities) {
        expect(CRAFT_DEPLOYMENT_CAPABILITIES).toContain(capability);
      }
      for (const platform of provider.platforms) {
        expect(CRAFT_DEPLOYMENT_PLATFORMS).toContain(platform);
      }
    }
  });

  it('is looked up by name', () => {
    expect(findCraftDeploymentProvider('alchemy')?.capabilities).toContain(
      'infrastructure',
    );
    expect(findCraftDeploymentProvider('heroku')).toBeUndefined();
  });
});

describe('requiredCapability', () => {
  it('splits the static runtime by mode', () => {
    expect(requiredCapability('static', 'spa')).toBe('static-spa');
    expect(requiredCapability('static', 'ssg')).toBe('static-ssg');
  });

  it('maps the server runtimes to their capability', () => {
    expect(requiredCapability('node')).toBe('node-ssr');
    expect(requiredCapability('worker')).toBe('worker');
    expect(requiredCapability('lambda')).toBe('lambda');
  });
});

describe('runtime and platform compatibility', () => {
  it('covers every runtime', () => {
    for (const runtime of CRAFT_DEPLOYMENT_RUNTIMES) {
      expect(CRAFT_RUNTIME_PLATFORMS[runtime].length).toBeGreaterThan(0);
    }
  });

  it('keeps the worker runtime on Cloudflare only', () => {
    expect(isRuntimeSupportedByPlatform('worker', 'cloudflare')).toBe(true);
    expect(isRuntimeSupportedByPlatform('worker', 'aws')).toBe(false);
  });

  it('serves a static artefact from every platform', () => {
    for (const platform of CRAFT_DEPLOYMENT_PLATFORMS) {
      expect(isRuntimeSupportedByPlatform('static', platform)).toBe(true);
    }
  });

  it('never sends a Node server to a platform without one', () => {
    expect(isRuntimeSupportedByPlatform('node', 'github-pages')).toBe(false);
    expect(isRuntimeSupportedByPlatform('node', 'cloudflare')).toBe(false);
  });

  it('offers a provider for every runtime it declares supported', () => {
    for (const runtime of CRAFT_DEPLOYMENT_RUNTIMES) {
      const capability = requiredCapability(
        runtime,
        runtime === 'static' ? 'ssg' : undefined,
      );
      expect(
        CRAFT_DEPLOYMENT_PROVIDERS.some((provider) =>
          provider.capabilities.includes(capability),
        ),
      ).toBe(true);
    }
  });
});
