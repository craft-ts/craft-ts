#!/usr/bin/env node

import { runArchitectureMigration } from '../scripts/architecture/migrate-architecture.js';

type Options = Parameters<typeof runArchitectureMigration>[0];

function parseArgs(argv: string[]): Options {
  const options: Options = {};
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
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (argument.startsWith('-'))
          throw new Error(`Unknown argument: ${argument}`);
        throw new Error(`Unexpected argument: ${argument}`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`Usage: craft-migrate-architecture [options]

Scaffolds the baseline CraftTS architecture test suite (Vitest, Node).

Options:
  --project, --tsconfig <path> Application tsconfig.
  --root <dir>                 Source root. Defaults to cwd.
  --dry-run                    Analyze without writing (default).
  --write                      Write the architecture suite, overwriting it.
  --check                      Fail when the suite is missing or drifted.
  --json [path]                Print JSON, or write it to path.
`);
}

runArchitectureMigration(parseArgs(process.argv.slice(2)))
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
