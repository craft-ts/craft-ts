import type {
  CraftDeploymentDiagnostic,
  CraftDeploymentSeverity,
} from './diagnostics.js';
import {
  CRAFT_DEPLOYMENT_PLATFORMS,
  CRAFT_DEPLOYMENT_RUNTIMES,
  CRAFT_SOURCE_MAP_POLICIES,
  CRAFT_STATIC_MODES,
  type CraftDeploymentDefinition,
  type CraftDeploymentPlatform,
  type CraftDeploymentRuntime,
} from './manifest.js';
import { isRuntimeSupportedByPlatform } from './providers.js';

export type CraftDeploymentValidation = Readonly<{
  /** `null` when a structural error makes the manifest unusable. */
  definition: CraftDeploymentDefinition | null;
  diagnostics: readonly CraftDeploymentDiagnostic[];
}>;

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
/** A route is pre-renderable only when it maps to exactly one document. */
const STATIC_ROUTE = /^\/[^\s:*?#]*$/;

const SECTION_BY_RUNTIME: Readonly<
  Record<CraftDeploymentRuntime, readonly string[]>
> = Object.freeze({
  static: ['static', 'client'],
  node: ['server'],
  worker: ['worker'],
  lambda: ['lambda'],
});

const RUNTIME_SECTIONS = ['static', 'server', 'worker', 'lambda'] as const;

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Validates the structure and the pure semantics of a deployment manifest.
 *
 * Everything checked here is decidable without touching the filesystem, so the
 * same function guards a hand-written `craft.deploy.ts`, a manifest parsed
 * from JSON and a manifest received by a provider.
 */
export function validateCraftDeploymentDefinition(
  value: unknown,
): CraftDeploymentValidation {
  const diagnostics: CraftDeploymentDiagnostic[] = [];
  const report = (
    diagnostic: Omit<CraftDeploymentDiagnostic, 'severity'> &
      Partial<Pick<CraftDeploymentDiagnostic, 'severity'>>,
  ) => {
    diagnostics.push({ severity: 'error', ...diagnostic });
  };

  if (!isRecord(value)) {
    report({
      code: 'CRAFT_DEPLOY_MANIFEST_NOT_AN_OBJECT',
      message: `The manifest is a ${describe(value)} instead of an object.`,
      fix: 'Export the object returned by `defineCraftDeployment`.',
    });
    return { definition: null, diagnostics };
  }

  let structural = true;
  const missing = (path: string, expected: string) => {
    structural = false;
    report({
      code: 'CRAFT_DEPLOY_MANIFEST_MISSING_FIELD',
      path,
      message: `\`${path}\` is missing.`,
      fix: expected,
    });
  };
  const invalid = (
    path: string,
    expected: string,
    severity: CraftDeploymentSeverity = 'error',
  ) => {
    if (severity === 'error') structural = false;
    report({
      code: 'CRAFT_DEPLOY_MANIFEST_INVALID_FIELD',
      path,
      severity,
      message: `\`${path}\` is invalid.`,
      fix: expected,
    });
  };

  if (!isNonEmptyString(value['name'])) {
    missing('name', 'Give the deployment a non-empty name.');
  }
  if (
    value['environment'] !== undefined &&
    !isNonEmptyString(value['environment'])
  ) {
    invalid('environment', 'Use a non-empty string such as `production`.');
  }

  const runtime = value['runtime'];
  const knownRuntime = CRAFT_DEPLOYMENT_RUNTIMES.includes(
    runtime as CraftDeploymentRuntime,
  );
  if (!knownRuntime) {
    structural = false;
    report({
      code: 'CRAFT_DEPLOY_MANIFEST_UNKNOWN_RUNTIME',
      path: 'runtime',
      message: `\`runtime\` is ${describe(runtime)}.`,
      fix: `Use one of ${CRAFT_DEPLOYMENT_RUNTIMES.join(', ')}.`,
    });
  }

  const platform = value['platform'];
  const knownPlatform = CRAFT_DEPLOYMENT_PLATFORMS.includes(
    platform as CraftDeploymentPlatform,
  );
  if (!knownPlatform) {
    structural = false;
    report({
      code: 'CRAFT_DEPLOY_MANIFEST_UNKNOWN_PLATFORM',
      path: 'platform',
      message: `\`platform\` is ${describe(platform)}.`,
      fix: `Use one of ${CRAFT_DEPLOYMENT_PLATFORMS.join(', ')}.`,
    });
  }

  if (knownRuntime) {
    const typedRuntime = runtime as CraftDeploymentRuntime;
    for (const section of SECTION_BY_RUNTIME[typedRuntime]) {
      if (!isRecord(value[section])) {
        structural = false;
        report({
          code: 'CRAFT_DEPLOY_MANIFEST_SECTION_MISSING',
          path: section,
          runtime: typedRuntime,
          message: `The \`${typedRuntime}\` runtime requires a \`${section}\` section.`,
          fix: `Add \`${section}\` to the manifest.`,
        });
      }
    }
    for (const section of RUNTIME_SECTIONS) {
      if (
        value[section] !== undefined &&
        !SECTION_BY_RUNTIME[typedRuntime].includes(section)
      ) {
        report({
          code: 'CRAFT_DEPLOY_MANIFEST_SECTION_UNEXPECTED',
          path: section,
          runtime: typedRuntime,
          message: `\`${section}\` does not belong to the \`${typedRuntime}\` runtime.`,
          fix: `Remove \`${section}\`, or switch the runtime to the one that uses it.`,
        });
      }
    }
  }

  const client = value['client'];
  if (client !== undefined) {
    if (!isRecord(client)) {
      invalid('client', 'Use an object with `build` and `outDir`.');
    } else {
      if (!isNonEmptyString(client['build'])) {
        missing('client.build', 'Declare the command building the client.');
      }
      if (!isNonEmptyString(client['outDir'])) {
        missing(
          'client.outDir',
          'Declare the directory that command writes to.',
        );
      }
    }
  }

  const staticSection = value['static'];
  if (isRecord(staticSection)) {
    const mode = staticSection['mode'];
    if (!CRAFT_STATIC_MODES.includes(mode as never)) {
      structural = false;
      invalid('static.mode', `Use one of ${CRAFT_STATIC_MODES.join(', ')}.`);
    }
    if (
      staticSection['fallback'] !== undefined &&
      !isNonEmptyString(staticSection['fallback'])
    ) {
      invalid('static.fallback', 'Use a document name such as `index.html`.');
    }
    const routes = staticSection['routes'];
    if (routes !== undefined && !isStringArray(routes)) {
      invalid('static.routes', 'Use an array of absolute route paths.');
    } else if (mode === 'ssg') {
      const list = (routes ?? []) as readonly string[];
      if (list.length === 0) {
        report({
          code: 'CRAFT_DEPLOY_SSG_ROUTES_MISSING',
          path: 'static.routes',
          runtime: 'static',
          message: 'The `ssg` mode declares no route to pre-render.',
          fix: 'List the routes in `static.routes`, or switch the mode to `spa`.',
        });
      }
      for (const [index, route] of list.entries()) {
        if (!STATIC_ROUTE.test(route)) {
          report({
            code: 'CRAFT_DEPLOY_SSG_ROUTE_NOT_STATIC',
            path: `static.routes[${index}]`,
            runtime: 'static',
            message: `\`${route}\` does not designate a single document.`,
            fix: 'Expand the route into literal paths, or move it to `static.serverRoutes`.',
          });
        }
      }
    }
    if (
      staticSection['serverRoutes'] !== undefined &&
      !isStringArray(staticSection['serverRoutes'])
    ) {
      invalid(
        'static.serverRoutes',
        'Use an array of route paths that need a server runtime.',
      );
    }
  }

  const server = value['server'];
  if (isRecord(server)) {
    if (!isNonEmptyString(server['entry'])) {
      missing('server.entry', 'Declare the SSR entry produced by the build.');
    }
    for (const key of ['healthPath', 'readyPath'] as const) {
      const path = server[key];
      if (!isNonEmptyString(path)) {
        missing(`server.${key}`, 'Declare an absolute HTTP path.');
      } else if (!path.startsWith('/')) {
        invalid(`server.${key}`, 'Start the path with `/`.');
      }
    }
    for (const key of ['build', 'start'] as const) {
      if (server[key] !== undefined && !isNonEmptyString(server[key])) {
        invalid(`server.${key}`, 'Use a non-empty command.');
      }
    }
    if (server['source'] !== undefined && !isNonEmptyString(server['source'])) {
      invalid('server.source', 'Use the path of the module producing `entry`.');
    }
  }

  const worker = value['worker'];
  if (isRecord(worker)) {
    if (!isNonEmptyString(worker['entry'])) {
      missing(
        'worker.entry',
        'Declare the module exporting `fetch(request, env, ctx)`.',
      );
    }
    if (worker['source'] !== undefined && !isNonEmptyString(worker['source'])) {
      invalid('worker.source', 'Use the path of the module producing `entry`.');
    }
    const bindings = worker['bindings'];
    if (bindings !== undefined) {
      if (!Array.isArray(bindings)) {
        invalid('worker.bindings', 'Use an array of `{ name, type }`.');
      } else {
        for (const [index, binding] of bindings.entries()) {
          if (
            !isRecord(binding) ||
            !isNonEmptyString(binding['name']) ||
            !isNonEmptyString(binding['type'])
          ) {
            invalid(
              `worker.bindings[${index}]`,
              'Use `{ name, type }` with non-empty strings.',
            );
          }
        }
      }
    }
  }

  const lambda = value['lambda'];
  if (isRecord(lambda)) {
    if (!isNonEmptyString(lambda['entry'])) {
      missing('lambda.entry', 'Declare the Function URL handler module.');
    }
    if (lambda['source'] !== undefined && !isNonEmptyString(lambda['source'])) {
      invalid('lambda.source', 'Use the path of the module producing `entry`.');
    }
    if (
      lambda['permissions'] !== undefined &&
      !isStringArray(lambda['permissions'])
    ) {
      invalid('lambda.permissions', 'Use an array of permission identifiers.');
    }
  }

  const functions = value['functions'];
  if (functions !== undefined) {
    if (!isRecord(functions)) {
      invalid('functions', 'Use an object with an `entry`.');
    } else {
      if (!isNonEmptyString(functions['entry'])) {
        missing(
          'functions.entry',
          'Declare the module building the server-function registry.',
        );
      }
      const basePath = functions['basePath'];
      if (basePath !== undefined) {
        if (!isNonEmptyString(basePath)) {
          invalid('functions.basePath', 'Use an absolute HTTP path.');
        } else if (!basePath.startsWith('/')) {
          invalid('functions.basePath', 'Start the path with `/`.');
        }
      }
      const ids = functions['ids'];
      if (ids !== undefined && !isStringArray(ids)) {
        invalid('functions.ids', 'Use an array of identifiers.');
      } else {
        const seen = new Set<string>();
        for (const [index, id] of (
          (ids ?? []) as readonly string[]
        ).entries()) {
          if (seen.has(id)) {
            report({
              code: 'CRAFT_DEPLOY_FUNCTION_ID_DUPLICATE',
              path: `functions.ids[${index}]`,
              message: `The server-function identifier \`${id}\` is declared twice.`,
              fix: 'Keep one declaration per identifier.',
            });
          }
          seen.add(id);
        }
      }
    }
  }

  const env = value['env'];
  if (env !== undefined) {
    if (!Array.isArray(env)) {
      invalid('env', 'Use an array of `{ name, required }`.');
    } else {
      for (const [index, variable] of env.entries()) {
        const path = `env[${index}]`;
        if (!isRecord(variable)) {
          invalid(path, 'Use `{ name, required }`.');
          continue;
        }
        const name = variable['name'];
        if (!isNonEmptyString(name)) {
          missing(`${path}.name`, 'Declare the variable name.');
        } else if (!ENV_NAME.test(name)) {
          report({
            code: 'CRAFT_DEPLOY_ENV_NAME_INVALID',
            path: `${path}.name`,
            message: `\`${name}\` is not an upper snake case identifier.`,
            fix: 'Rename the variable to `UPPER_SNAKE_CASE`.',
          });
        }
        if (typeof variable['required'] !== 'boolean') {
          missing(
            `${path}.required`,
            'State whether the deployment fails without it.',
          );
        }
        for (const forbidden of ['value', 'default'] as const) {
          if (variable[forbidden] !== undefined) {
            report({
              code: 'CRAFT_DEPLOY_ENV_VALUE_FORBIDDEN',
              path: `${path}.${forbidden}`,
              message: `\`${path}\` carries a \`${forbidden}\`, and the manifest is committed.`,
              fix: 'Remove it and provide the value through the CI or the provider secret store.',
            });
          }
        }
      }
    }
  }

  const artifact = value['artifact'];
  if (artifact !== undefined) {
    if (!isRecord(artifact)) {
      invalid('artifact', 'Use an object describing the produced artefact.');
    } else {
      for (const key of ['publicDir', 'serverEntry', 'start'] as const) {
        if (artifact[key] !== undefined && !isNonEmptyString(artifact[key])) {
          invalid(`artifact.${key}`, 'Use a non-empty string.');
        }
      }
      if (
        artifact['configFiles'] !== undefined &&
        !isStringArray(artifact['configFiles'])
      ) {
        invalid('artifact.configFiles', 'Use an array of file paths.');
      }
      if (
        artifact['sourceMaps'] !== undefined &&
        !CRAFT_SOURCE_MAP_POLICIES.includes(artifact['sourceMaps'] as never)
      ) {
        invalid(
          'artifact.sourceMaps',
          `Use one of ${CRAFT_SOURCE_MAP_POLICIES.join(', ')}.`,
        );
      }
    }
  }

  if (knownRuntime && knownPlatform) {
    const typedRuntime = runtime as CraftDeploymentRuntime;
    const typedPlatform = platform as CraftDeploymentPlatform;
    if (!isRuntimeSupportedByPlatform(typedRuntime, typedPlatform)) {
      report({
        code: 'CRAFT_DEPLOY_RUNTIME_PLATFORM_INCOMPATIBLE',
        path: 'platform',
        runtime: typedRuntime,
        platform: typedPlatform,
        message: `\`${typedPlatform}\` cannot execute the \`${typedRuntime}\` runtime.`,
        fix: 'Change the runtime or the platform; see the compatibility matrix.',
      });
    }
  }

  return {
    definition: structural
      ? (value as unknown as CraftDeploymentDefinition)
      : null,
    diagnostics,
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return `\`${value}\``;
  return `a ${typeof value}`;
}
