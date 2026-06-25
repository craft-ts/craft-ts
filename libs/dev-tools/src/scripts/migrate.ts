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
  changedFiles: string[];
  diagnostics: {
    primitives: MigratePrimitivesResult['diagnostics'];
    services: MigrateServicesResult['diagnostics'];
    routes: MigrateRoutesResult['diagnostics'];
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

  if (!options.json) log('1/3 Migrating primitives and Signal Forms...');
  const primitives = await runPrimitivesMigration({
    ...shared,
    eslint: options.eslint,
  });

  if (!options.json) log('2/3 Migrating Angular services...');
  const services = await runServicesMigration({
    ...shared,
    configFilePath: options.configFilePath,
    eslint: options.eslint,
  });

  if (!options.json) log('3/3 Migrating Angular routes...');
  const routes = await runRoutesMigration({
    ...shared,
    collectionName: options.collectionName,
    parentMount: options.parentMount,
    parentNames: options.parentNames,
  });

  const result: MigrateResult = {
    primitives,
    services,
    routes,
    changedFiles: [
      ...new Set([
        ...primitives.changedFiles,
        ...services.changedFiles,
        ...routes.changedFiles,
      ]),
    ],
    diagnostics: {
      primitives: primitives.diagnostics,
      services: services.diagnostics,
      routes: routes.diagnostics,
    },
    exitCode: Math.max(
      primitives.exitCode,
      services.exitCode,
      routes.exitCode,
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
      routes.diagnostics.length;
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
