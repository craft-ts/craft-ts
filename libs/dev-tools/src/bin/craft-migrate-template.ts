#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { migrateTemplateToCraft } from '../template-migration.js';

async function main(argv: string[]): Promise<number> {
  let inputFile: string | undefined;
  let componentName: string | undefined;
  let includeImport = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--component-name') componentName = argv[++index];
    else if (argument === '--no-import') includeImport = false;
    else if (argument === '--help') {
      printHelp();
      return 0;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown argument: ${argument}`);
    } else if (inputFile) {
      throw new Error('Only one template file can be provided.');
    } else inputFile = argument;
  }
  const source = inputFile
    ? await readFile(inputFile, 'utf8')
    : await readStdin();
  const result = migrateTemplateToCraft(source, {
    componentName,
    includeImport,
  });
  for (const diagnostic of result.diagnostics) {
    console.error(`${diagnostic.code}: ${diagnostic.message}`);
  }
  process.stdout.write(result.code);
  return 0;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (value += chunk));
    process.stdin.on('end', () => resolve(value));
    process.stdin.on('error', reject);
  });
}

function printHelp(): void {
  console.log(`Usage: craft-migrate-template [template-file] [options]

Converts an HTML/Web Component snippet into a Craft template callback.

Options:
  --component-name <name>  Wrap the result in a complete craftComponent.
  --no-import              Omit the generated @craft-ts/component import.
  --help                   Show this help.

When no file is provided, the template is read from stdin.
`);
}

main(process.argv.slice(2))
  .then((exitCode) => (process.exitCode = exitCode))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
