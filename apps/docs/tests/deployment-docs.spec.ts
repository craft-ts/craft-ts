import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALCHEMY_PRESETS,
  alchemyCredentialNames,
} from '@craft-ts/deploy-alchemy';
import {
  CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES,
  CRAFT_DEPLOYMENT_DIAGNOSTICS,
  CRAFT_DEPLOYMENT_PLATFORMS,
  CRAFT_DEPLOYMENT_PROVIDERS,
  CRAFT_DEPLOYMENT_RUNTIMES,
  CRAFT_RUNTIME_PLATFORMS,
} from '@craft-ts/deploy';
import { readDoc } from './read-doc';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const overview = readDoc('../guide/deployment/index.md');
const manifest = readDoc('../guide/deployment/manifest.md');
const diagnostics = readDoc('../guide/deployment/diagnostics.md');
const providers = readDoc('../guide/deployment/providers.md');
const alchemy = readDoc('../guide/deployment/alchemy.md');

describe('deployment overview', () => {
  it('keeps runtime, platform and provider distinct', () => {
    expect(overview).toContain('**runtime**');
    expect(overview).toContain('**platform**');
    expect(overview).toContain('**provider**');
    expect(overview).toContain(
      'Alchemy is a provider of infrastructure, not a runtime',
    );
  });

  it('documents both static modes', () => {
    expect(overview).toContain('**`spa`**');
    expect(overview).toContain('**`ssg`**');
  });

  it('documents the commands the CLI actually exposes', () => {
    for (const command of ['check', 'manifest', 'providers', 'deploy']) {
      expect(overview).toContain(`npx craft-ts ${command}`);
    }
  });

  it('states that no secret is ever written', () => {
    expect(overview).toContain('never writes a secret');
  });
});

describe('manifest reference', () => {
  it('documents every runtime', () => {
    for (const runtime of CRAFT_DEPLOYMENT_RUNTIMES) {
      expect(manifest).toContain(`\`${runtime}\``);
    }
  });

  it('shows the manifest of the SSR demonstrator verbatim', () => {
    const source = readFileSync(
      join(repoRoot, 'apps/demo-ssr/craft.deploy.ts'),
      'utf8',
    ).trimEnd();

    expect(manifest).toContain(source);
  });

  it('documents the default source map policy', () => {
    expect(manifest).toContain('default: forbidden');
  });
});

describe('diagnostics reference', () => {
  it('documents every code the checker can emit', () => {
    for (const code of CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES) {
      expect(diagnostics).toContain(`### \`${code}\``);
    }
  });

  it('documents no code the checker cannot emit', () => {
    const documented = [
      ...diagnostics.matchAll(/^### `(CRAFT_DEPLOY_[A-Z_]+)`$/gm),
    ].map((match) => match[1]);

    expect(documented).toHaveLength(CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES.length);
    for (const code of documented) {
      expect(CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES).toContain(code);
    }
  });

  it('gives every code a cause and a fix taken from the checker', () => {
    for (const code of CRAFT_DEPLOYMENT_DIAGNOSTIC_CODES) {
      const description = CRAFT_DEPLOYMENT_DIAGNOSTICS[code];
      expect(diagnostics).toContain(`- **Cause** — ${description.cause}`);
      expect(diagnostics).toContain(`- **Fix** — ${description.fix}`);
    }
  });
});

describe('provider matrix', () => {
  it('lists every provider with its real capabilities', () => {
    for (const provider of CRAFT_DEPLOYMENT_PROVIDERS) {
      const rowPattern = new RegExp(`^\\|\\s*\`${provider.name}\`\\s*\\|`);
      const row = providers.split('\n').find((line) => rowPattern.test(line));

      expect(row, `no matrix row for ${provider.name}`).toBeDefined();
      const cells = (row as string)
        .split('|')
        .slice(2, 2 + 7)
        .map((cell) => cell.trim());

      expect(cells).toEqual(
        [
          'static-spa',
          'static-ssg',
          'node-ssr',
          'worker',
          'lambda',
          'infrastructure',
          'local-preview',
        ].map((capability) =>
          provider.capabilities.includes(
            capability as (typeof provider.capabilities)[number],
          )
            ? 'yes'
            : 'no',
        ),
      );
    }
  });

  it('documents the artefact, the preview, the credentials and the limits', () => {
    for (const provider of CRAFT_DEPLOYMENT_PROVIDERS) {
      expect(providers).toContain(`### \`${provider.name}\``);
      expect(providers).toContain(`- **Artefact** — ${provider.artifact}`);
      expect(providers).toContain(
        `- **Credentials** — ${provider.credentials}`,
      );
      for (const limit of provider.limits) {
        expect(providers).toContain(`- **Limit** — ${limit}`);
      }
    }
  });

  it('publishes the runtime and platform compatibility table', () => {
    for (const runtime of CRAFT_DEPLOYMENT_RUNTIMES) {
      const rowPattern = new RegExp(`^\\|\\s*\`${runtime}\`\\s*\\|`);
      const row = providers.split('\n').find((line) => rowPattern.test(line));

      expect(row, `no compatibility row for ${runtime}`).toBeDefined();
      for (const platform of CRAFT_DEPLOYMENT_PLATFORMS) {
        expect((row as string).includes(`\`${platform}\``)).toBe(
          CRAFT_RUNTIME_PLATFORMS[runtime].includes(platform),
        );
      }
    }
  });

  it('says which provider implementation actually ships', () => {
    expect(providers).toContain('One\nimplementation ships today');
    expect(providers).toContain('@craft-ts/deploy-alchemy');
  });
});

describe('Alchemy provider guide', () => {
  it('states that Alchemy provisions rather than runs the application', () => {
    expect(alchemy).toContain('**provider of infrastructure**, not a runtime');
  });

  it('documents every credential the provider actually reads', () => {
    for (const platform of Object.keys(ALCHEMY_PRESETS)) {
      for (const name of alchemyCredentialNames(
        platform as Parameters<typeof alchemyCredentialNames>[0],
      )) {
        expect(alchemy, `${name} is not documented`).toContain(`\`${name}\``);
      }
    }
  });

  it('documents a preset for every platform the package supports', () => {
    for (const platform of Object.keys(ALCHEMY_PRESETS)) {
      expect(alchemy).toContain(`on \`${platform}\``);
    }
  });

  it('documents install, state, stages, preview, outputs and rollback', () => {
    for (const section of [
      '## Install',
      '## Credentials',
      '## State and stages',
      '## Preview before mutating',
      '## Deploy',
      '## Rollback',
      '## What stays in CraftTS, what is delegated',
    ]) {
      expect(alchemy).toContain(section);
    }
  });

  it('says plainly that the adapter has never run against a live account', () => {
    expect(alchemy).toContain(
      'has not been run against a live Cloudflare or AWS account',
    );
  });

  it('is reachable from the provider matrix', () => {
    expect(providers).toContain('./alchemy.md');
  });
});
