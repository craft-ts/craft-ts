#!/usr/bin/env node

import { runMigration, type MigrateOptions } from '../scripts/migrate.js';

function parseArgs(argv: string[]): MigrateOptions {
  const options: MigrateOptions = { files: [] };
  const files: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--project':
      case '--tsconfig':
        options.tsConfigFilePath = argv[++index];
        break;
      case '--root':
        options.rootDir = argv[++index];
        break;
      case '--config':
        options.configFilePath = argv[++index];
        break;
      case '--dry-run':
        options.write = false;
        break;
      case '--write':
        options.write = true;
        break;
      case '--check':
        options.check = true;
        break;
      case '--json':
        if (argv[index + 1] && !argv[index + 1].startsWith('-'))
          options.jsonFilePath = argv[++index];
        else options.json = true;
        break;
      case '--fail-on-manual':
        options.failOnManual = true;
        break;
      case '--no-eslint':
        options.eslint = false;
        break;
      case '--collection-name':
        options.collectionName = argv[++index];
        break;
      case '--parent-mount':
        options.parentMount = argv[++index];
        break;
      case '--parent-names':
        options.parentNames = argv[++index].split(',').filter(Boolean);
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (argument.startsWith('-'))
          throw new Error(`Unknown argument: ${argument}`);
        files.push(argument);
    }
  }
  options.files = files;
  return options;
}

function printHelp(): void {
  console.log(`Usage: craft-migrate [files...] [options]

Runs the primitive, service and route migrations in that order.

Options:
  --project, --tsconfig <path> Application tsconfig.
  --root <dir>                 Source root. Defaults to cwd.
  --config <path>              craft-dev-tools.config.ts override.
  --dry-run                    Analyze without writing (default).
  --write                      Write migrated files.
  --check                      Fail while supported legacy code remains.
  --json [path]                Print the combined report, or write it to path.
  --fail-on-manual             Fail when manual diagnostics are emitted.
  --no-eslint                  Do not run ESLint --fix after writes.
  --collection-name <name>     Override the inferred root routes name.
  --parent-mount <path>        Pin a route collection to its parent mount.
  --parent-names <a,b>         Named providers inherited by the route collection.
`);
}

runMigration(parseArgs(process.argv.slice(2)))
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
