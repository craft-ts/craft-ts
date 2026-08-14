import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  runPrimitivesMigration,
  type MigratePrimitivesResult,
} from './primitives/migrate-primitives.js';
import {
  runRoutesMigration,
  type MigrateRoutesResult,
} from './routes/migrate-routes.js';
import {
  runServicesMigration,
  type MigrateServicesResult,
} from './services/migrate-services.js';
import {
  runComponentsMigration,
  type MigrateComponentsResult,
} from './components/migrate-components.js';
import {
  runArchitectureMigration,
  type MigrateArchitectureResult,
} from './architecture/migrate-architecture.js';

export type MigrateOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  configFilePath?: string;
  files?: readonly string[];
  write?: boolean;
  check?: boolean;
  json?: boolean;
  jsonFilePath?: string;
  failOnManual?: boolean;
  eslint?: boolean;
  collectionName?: string;
  parentMount?: string;
  parentNames?: readonly string[];
  log?: (message: string) => void;
};

export type MigrateResult = {
  primitives: MigratePrimitivesResult;
  services: MigrateServicesResult;
  routes: MigrateRoutesResult;
  components: MigrateComponentsResult;
  architecture: MigrateArchitectureResult;
  changedFiles: string[];
  diagnostics: {
    primitives: MigratePrimitivesResult['diagnostics'];
    services: MigrateServicesResult['diagnostics'];
    routes: MigrateRoutesResult['diagnostics'];
    components: MigrateComponentsResult['diagnostics'];
  };
  exitCode: number;
};

export async function runMigration(
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const log = options.log ?? console.log;
  const stepLog = options.json ? () => undefined : log;
  const shared = {
    rootDir: options.rootDir,
    tsConfigFilePath: options.tsConfigFilePath,
    files: options.files,
    write: options.write,
    check: options.check,
    failOnManual: options.failOnManual,
    log: stepLog,
  };

  if (!options.json) log('1/5 Migrating primitives and Signal Forms...');
  const primitives = await runPrimitivesMigration({
    ...shared,
    eslint: options.eslint,
  });

  if (!options.json) log('2/5 Migrating Angular services...');
  const services = await runServicesMigration({
    ...shared,
    configFilePath: options.configFilePath,
    eslint: options.eslint,
  });

  if (!options.json) log('3/5 Migrating Angular routes...');
  const routes = await runRoutesMigration({
    ...shared,
    collectionName: options.collectionName,
    parentMount: options.parentMount,
    parentNames: options.parentNames,
  });

  if (!options.json) log('4/5 Migrating Craft components and directives...');
  const components = await runComponentsMigration({
    ...shared,
    eslint: options.eslint,
  });

  if (!options.json) log('5/5 Scaffolding architecture tests...');
  const architecture = await runArchitectureMigration({
    rootDir: options.rootDir,
    tsConfigFilePath: options.tsConfigFilePath,
    write: options.write,
    check: options.check,
    log: stepLog,
  });

  const result: MigrateResult = {
    primitives,
    services,
    routes,
    components,
    architecture,
    changedFiles: [
      ...new Set([
        ...primitives.changedFiles,
        ...services.changedFiles,
        ...routes.changedFiles,
        ...components.changedFiles,
        ...architecture.changedFiles,
      ]),
    ],
    diagnostics: {
      primitives: primitives.diagnostics,
      services: services.diagnostics,
      routes: routes.diagnostics,
      components: components.diagnostics,
    },
    exitCode: Math.max(
      primitives.exitCode,
      services.exitCode,
      routes.exitCode,
      components.exitCode,
      architecture.exitCode,
    ),
  };

  if (options.jsonFilePath) {
    const path = resolve(options.jsonFilePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  if (options.json) log(JSON.stringify(result, null, 2));
  else {
    const manualCount =
      primitives.diagnostics.length +
      services.diagnostics.length +
      routes.diagnostics.length +
      components.diagnostics.length;
    log(
      `Migration complete: ${result.changedFiles.length} changed file(s), ${manualCount} manual diagnostic(s).`,
    );
    if (manualCount > 0) {
      log(
        'Review the diagnostics, then run the project type-check, tests and production build.',
      );
    }
  }

  return result;
}
