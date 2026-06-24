#!/usr/bin/env node

import { runServicesMigration } from '../scripts/services/migrate-services.js';

type CliOptions = Parameters<typeof runServicesMigration>[0];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { files: [] };
  const files: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--project':
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
  console.log(`Usage: craft-migrate-services [files...] [options]

Options:
  --project <path>       Application tsconfig.
  --root <dir>           Source root. Defaults to cwd.
  --config <path>        craft-dev-tools.config.ts override.
  --dry-run              Analyze without writing (default).
  --write                Write migrated and companion files.
  --check                Fail while legacy services remain.
  --json [path]          Print JSON, or write it to path.
  --fail-on-manual       Fail when manual diagnostics are emitted.
  --no-eslint            Do not run ESLint --fix after --write.
`);
}

runServicesMigration(parseArgs(process.argv.slice(2)))
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
