#!/usr/bin/env node

import { runComponentsMigration } from '../scripts/components/migrate-components.js';

type Options = Parameters<typeof runComponentsMigration>[0];

function parseArgs(argv: string[]): Options {
  const options: Options = { files: [] };
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
        options.json = true;
        break;
      case '--fail-on-manual':
        options.failOnManual = true;
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
  console.log(`Usage: craft-migrate-components [files...] [options]

Migrates the legacy component(...) factory to craftComponent(name, ...).

Options:
  --project, --tsconfig <path> Application tsconfig.
  --root <dir>                 Source root. Defaults to cwd.
  --dry-run                    Analyze without writing (default).
  --write                      Write migrated files.
  --check                      Fail while legacy component calls remain.
  --json                       Print JSON.
  --fail-on-manual             Fail when manual diagnostics are emitted.
`);
}

runComponentsMigration(parseArgs(process.argv.slice(2)))
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
