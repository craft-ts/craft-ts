#!/usr/bin/env node

import { runRoutesMigration } from '../scripts/routes/migrate-routes.js';

type CliOptions = Parameters<typeof runRoutesMigration>[0];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { files: [] };
  const files: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--root':
        options.rootDir = argv[++index];
        break;
      case '--project':
      case '--tsconfig':
        options.tsConfigFilePath = argv[++index];
        break;
      case '--write':
        options.write = true;
        break;
      case '--dry-run':
        options.write = false;
        break;
      case '--check':
        options.check = true;
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
      case '--json':
        options.jsonFilePath = argv[++index];
        break;
      case '--fail-on-manual':
        options.failOnManual = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (argument.startsWith('-')) throw new Error(`Unknown argument: ${argument}`);
        files.push(argument);
    }
  }
  options.files = files;
  return options;
}

function printHelp(): void {
  console.log(`Usage: craft-migrate-routes [files...] [options]

Options:
  --root <dir>                 Source root. Defaults to cwd.
  --project, --tsconfig <path> Application tsconfig.
  --dry-run                    Analyze and print without writing (default).
  --write                      Write migrated files.
  --check                      Fail when legacy Routes collections remain.
  --collection-name <name>    Override the inferred craftRoutes name.
  --parent-mount <path>        Pin the collection with ParentRoutes<path>.
  --parent-names <a,b>         Named providers inherited at the mount point.
  --json <path>                Write the complete migration report as JSON.
  --fail-on-manual             Fail when manual diagnostics are emitted.
`);
}

runRoutesMigration(parseArgs(process.argv.slice(2)))
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
