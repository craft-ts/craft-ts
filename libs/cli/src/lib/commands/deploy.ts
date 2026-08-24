import { resolve } from 'node:path';
import {
  checkCraftDeployment,
  formatCraftDeploymentDiagnostic,
  formatCraftDeploymentPlan,
  requiredCapability,
  type CraftDeploymentDiagnostic,
  type CraftDeploymentPlan,
  type CraftDeploymentRequest,
  type CraftDeploymentResult,
} from '@craft-ts/deploy';
import { parseArguments } from '../args.js';
import type { CraftCliIo } from '../io.js';
import { loadCraftDeploymentConfig } from '../load-config.js';
import { loadCraftDeploymentProvider } from '../load-provider.js';

const SPEC = {
  values: ['config', 'root', 'provider', 'provider-module', 'stage'],
  flags: ['json', 'yes', 'help'],
} as const;

export const DEPLOY_HELP = `craft-ts deploy — hand the checked manifest to a deployment provider

Usage:
  craft-ts deploy preview --provider <name>
  craft-ts deploy --provider <name> --yes

Options:
  --provider <name>        Provider to delegate to, resolved from @craft-ts/deploy-<name>
  --provider-module <spec> Import the provider from this module instead
  --stage <name>           Target stage (default: the manifest environment)
  --config <path>          Manifest to read (default: craft.deploy.* in the root)
  --root <dir>             Directory the manifest paths are relative to
  --json                   Emit a machine-readable report
  --yes                    Apply the plan; without it, deploy stops after the preview

\`preview\` never mutates anything. \`deploy\` runs the same checks and the same
preview first, and refuses to apply until \`--yes\` approves the plan.`;

/**
 * Runs the deployment pipeline: check, provider check, preview, then apply.
 *
 * No step is skippable, and applying is the only step that needs consent: a
 * plan an operator has not seen is never executed.
 */
export async function runDeployCommand(
  argv: readonly string[],
  io: CraftCliIo,
): Promise<number> {
  const parsed = parseArguments(argv, SPEC);
  if (parsed.flags.has('help')) {
    io.write(DEPLOY_HELP);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    io.writeError(`Unknown option(s): ${parsed.unknown.join(', ')}`);
    io.writeError(DEPLOY_HELP);
    return 1;
  }

  const mode = parsed.command === 'preview' ? 'preview' : 'deploy';
  if (parsed.command !== null && parsed.command !== 'preview') {
    io.writeError(`Unknown deploy subcommand: ${parsed.command}`);
    io.writeError(DEPLOY_HELP);
    return 1;
  }

  const providerName = parsed.values['provider'];
  const providerModule = parsed.values['provider-module'];
  if (!providerName) {
    io.writeError(
      '`--provider` is required: a deployment is always delegated.',
    );
    io.writeError(DEPLOY_HELP);
    return 1;
  }

  const json = parsed.flags.has('json');
  const rootDir = resolve(io.cwd, parsed.values['root'] ?? '.');
  const report = createReporter(io, json);

  const loaded = await loadCraftDeploymentConfig({
    rootDir,
    config: parsed.values['config'],
  });
  if (loaded.definition === null) {
    return report.fail(loaded.diagnostics);
  }

  // The manifest is checked on its own here: the authority on what a provider
  // can do is the provider itself, loaded just below, not the documented
  // matrix — which is what lets a project deploy with a provider CraftTS does
  // not ship.
  const checked = checkCraftDeployment({
    rootDir,
    definition: loaded.definition,
  });
  if (!checked.passed || checked.manifest === null) {
    return report.fail([...loaded.diagnostics, ...checked.diagnostics]);
  }
  report.warnings(checked.diagnostics);

  const provider = await loadCraftDeploymentProvider({
    name: providerName,
    rootDir,
    module: providerModule,
  });
  if (!provider.provider) {
    return report.fail(provider.diagnostics);
  }
  report.warnings(provider.diagnostics);

  const capability = requiredCapability(
    checked.manifest.runtime,
    checked.manifest.runtime === 'static'
      ? checked.manifest.static.mode
      : undefined,
  );
  if (!provider.provider.capabilities.includes(capability)) {
    return report.fail([
      {
        code: 'CRAFT_DEPLOY_PROVIDER_CAPABILITY_MISSING',
        severity: 'error',
        provider: provider.provider.name,
        runtime: checked.manifest.runtime,
        message: `\`${provider.provider.name}\` declares ${provider.provider.capabilities.join(', ') || 'no capability'} and this manifest needs \`${capability}\`.`,
        fix: `Choose a provider declaring \`${capability}\`, or change the runtime or the static mode.`,
      },
    ]);
  }

  const request: CraftDeploymentRequest = {
    manifest: checked.manifest,
    rootDir,
    stage: parsed.values['stage'] ?? checked.manifest.environment,
  };

  try {
    const providerDiagnostics =
      (await provider.provider.check?.(request)) ?? [];
    if (providerDiagnostics.some((d) => d.severity === 'error')) {
      return report.fail(providerDiagnostics);
    }
    report.warnings(providerDiagnostics);

    const plan = await provider.provider.preview(request);
    report.plan(plan);

    if (mode === 'preview') return report.done(plan, null);

    if (!parsed.flags.has('yes')) {
      return report.fail([
        {
          code: 'CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED',
          severity: 'error',
          provider: providerName,
          message: `The plan above would change ${mutating(plan)} resource(s) on stage \`${request.stage}\`.`,
          fix: 'Re-run with `--yes` once the plan is approved.',
        },
      ]);
    }

    return report.done(plan, await provider.provider.deploy(request));
  } catch (error) {
    return report.fail([
      {
        code: 'CRAFT_DEPLOY_PROVIDER_TOOLCHAIN_MISSING',
        severity: 'error',
        provider: providerName,
        message: `\`${providerName}\` failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fix: 'Read the provider error above; nothing was recorded by CraftTS.',
      },
    ]);
  }
}

function mutating(plan: CraftDeploymentPlan): number {
  return plan.resources.filter((resource) => resource.action !== 'unchanged')
    .length;
}

type Reporter = Readonly<{
  warnings(diagnostics: readonly CraftDeploymentDiagnostic[]): void;
  plan(plan: CraftDeploymentPlan): void;
  fail(diagnostics: readonly CraftDeploymentDiagnostic[]): number;
  done(plan: CraftDeploymentPlan, result: CraftDeploymentResult | null): number;
}>;

function createReporter(io: CraftCliIo, json: boolean): Reporter {
  const collected: CraftDeploymentDiagnostic[] = [];

  return {
    warnings(diagnostics) {
      collected.push(...diagnostics);
      if (json) return;
      for (const diagnostic of diagnostics) {
        io.write(formatCraftDeploymentDiagnostic(diagnostic));
      }
    },
    plan(plan) {
      if (json) return;
      io.write(formatCraftDeploymentPlan(plan));
    },
    fail(diagnostics) {
      const all = [...collected, ...diagnostics];
      if (json) {
        io.write(
          JSON.stringify(
            { applied: false, plan: null, result: null, diagnostics: all },
            null,
            2,
          ),
        );
        return 1;
      }
      for (const diagnostic of diagnostics) {
        io.writeError(formatCraftDeploymentDiagnostic(diagnostic));
      }
      io.writeError(
        `Deployment stopped with ${
          all.filter((d) => d.severity === 'error').length
        } error(s).`,
      );
      return 1;
    },
    done(plan, result) {
      if (json) {
        io.write(
          JSON.stringify(
            {
              applied: result !== null,
              plan,
              result,
              diagnostics: collected,
            },
            null,
            2,
          ),
        );
        return 0;
      }
      if (!result) {
        io.write('Preview only: nothing was created, updated or deleted.');
        return 0;
      }
      if (result.url) io.write(`url: ${result.url}`);
      for (const [key, value] of Object.entries(result.outputs)) {
        io.write(`output ${key}: ${value}`);
      }
      io.write(
        `Deployed to stage \`${result.stage}\` with ${result.provider}.`,
      );
      return 0;
    },
  };
}
