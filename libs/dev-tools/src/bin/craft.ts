#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  listAngularProjects,
  runRouteAdd,
  runRouteSplit,
  type RouteAddOptions,
  type RouteCommandPlan,
  type RouteCommandResult,
  type RouteSplitOptions,
} from '../scripts/routes/route-command.js';
import {
  runRouteVerification,
  type RouteVerificationResult,
} from '../scripts/routes/verify-routes.js';
import {
  createCraftProject,
  createModeFromFlag,
  parseCreateAgents,
} from '../scripts/create/create-project.js';
import { runSecurityCheck } from '../scripts/security-check.js';
import { spawnSync } from 'node:child_process';

type CommonOptions = {
  rootDir?: string;
  project?: string;
  parent?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  keepFixtures?: boolean;
};

async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'create') {
    return await runCreate(argv.slice(1));
  }
  if (argv[0] === 'graph') {
    const { spawn } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const graphBin = fileURLToPath(new URL('./craft-graph.js', import.meta.url));
    const child = spawn(process.execPath, [graphBin, ...argv.slice(1)], {
      stdio: 'inherit',
    });
    return await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
  }
  if (argv[0] === 'security' && argv[1] === 'check') {
    const rootIndex = argv.indexOf('--root');
    const rootDir = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
    const result = runSecurityCheck({ rootDir, strict: argv.includes('--strict') });
    for (const diagnostic of result.diagnostics) {
      const line = `${diagnostic.file}:${diagnostic.line} ${diagnostic.code}: ${diagnostic.message}`;
      if (diagnostic.severity === 'error') console.error(line);
      else console.warn(`warning ${line}`);
    }
    const errors = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'error',
    ).length;
    if (result.passed) {
      console.log(
        `Craft security check passed${result.diagnostics.length > 0 ? ` (${result.diagnostics.length} warning(s))` : ''}.`,
      );
    } else {
      console.error(`Craft security check failed with ${errors} error(s).`);
    }
    return result.passed ? 0 : 1;
  }
  if (argv[0] === 'i18n' && ['check', 'test'].includes(argv[1] ?? '')) {
    return runI18nCommand(argv[1] as 'check' | 'test');
  }
  if (argv[0] !== 'route' || !['add', 'split', 'verify'].includes(argv[1] ?? '')) {
    printHelp();
    return argv.includes('--help') ? 0 : 1;
  }
  const command = argv[1];
  const parsed = parseArgs(argv.slice(2));
  if (parsed.help) {
    printHelp();
    return 0;
  }
  const common: CommonOptions = {
    rootDir: parsed.values['root'],
    project: parsed.values['project'] ?? parsed.values['tsconfig'],
    parent: parsed.values['parent'],
    dryRun: parsed.flags.has('dry-run'),
    yes: parsed.flags.has('yes'),
    json: parsed.flags.has('json'),
    keepFixtures: parsed.flags.has('keep-fixtures'),
  };

  const readline = createInterface({ input, output });
  try {
    if (!common.project && !common.yes) {
      const projects = listAngularProjects(common.rootDir);
      if (projects.length > 1) {
        output.write(
          projects
            .map((project, index) => `${index + 1}. ${project}`)
            .join('\n') + '\n',
        );
        const selected = Number(
          await readline.question('Angular project number: '),
        );
        common.project = projects[selected - 1];
        if (!common.project) throw new Error('Invalid project selection.');
      }
    }
    const confirm = async (_plan: RouteCommandPlan) =>
      /^y(?:es)?$/i.test(await readline.question('Apply this plan? [y/N] '));
    if (command === 'verify') {
      const result = await runRouteVerification({
        rootDir: common.rootDir,
        project: common.project,
        json: common.json,
        keepFixtures: common.keepFixtures,
      });
      printVerificationResult(result, common.json === true);
      return result.exitCode;
    }
    let result: RouteCommandResult;
    if (command === 'add') {
      const options: RouteAddOptions = {
        ...common,
        path:
          parsed.positionals[0] ?? (await readline.question('Route path: ')),
        component: parsed.values['component'],
        createComponent: parsed.values['create-component'],
        featureFile: parsed.values['feature-file'],
        redirectTo: parsed.values['redirect-to'],
        confirm,
      };
      if (
        !options.component &&
        !options.createComponent &&
        !options.redirectTo
      ) {
        const kind = (
          await readline.question(
            'Target: [e]xisting component, [c]reate component, [r]edirect? ',
          )
        ).toLowerCase();
        if (kind.startsWith('e')) {
          options.component = await readline.question(
            'Component <file#Class>: ',
          );
        } else if (kind.startsWith('c')) {
          options.createComponent = await readline.question(
            'Angular component name/path: ',
          );
        } else if (kind.startsWith('r')) {
          options.redirectTo = await readline.question('Redirect target: ');
        }
      }
      result = await runRouteAdd(options);
    } else {
      const parent = common.parent;
      const prefix = parsed.values['prefix'];
      const target = parsed.values['target'];
      if (!parent || !prefix || !target) {
        throw new Error(
          'route split requires --parent, --prefix, and --target.',
        );
      }
      const options: RouteSplitOptions = {
        ...common,
        parent,
        prefix,
        target,
        confirm,
      };
      result = await runRouteSplit(options);
    }
    printResult(result, common.json === true);
    return result.exitCode;
  } finally {
    readline.close();
  }
}

function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const positionals: string[] = [];
  let help = false;
  const valueOptions = new Set([
    'root',
    'project',
    'tsconfig',
    'parent',
    'component',
    'create-component',
    'feature-file',
    'redirect-to',
    'prefix',
    'target',
  ]);
  const flagOptions = new Set(['dry-run', 'yes', 'json', 'keep-fixtures']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument.startsWith('--')) {
      const name = argument.slice(2);
      if (valueOptions.has(name)) {
        const value = argv[++index];
        if (!value || value.startsWith('--')) {
          throw new Error(`Missing value for --${name}.`);
        }
        values[name] = value;
      } else if (flagOptions.has(name)) {
        flags.add(name);
      } else {
        throw new Error(`Unknown option --${name}.`);
      }
    } else {
      positionals.push(argument);
    }
  }
  return { values, flags, positionals, help };
}

type CreateArgs = {
  directory?: string;
  effect?: string;
  agents?: string;
  locales?: string;
  defaultLocale?: string;
  i18n?: 'strict' | 'loose';
  flags: Set<string>;
  help: boolean;
};

function parseCreateArgs(argv: string[]): CreateArgs {
  const result: CreateArgs = { flags: new Set(), help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (argument === '--no-effect') {
      result.effect = 'none';
      continue;
    }
    if (argument === '--effect' || argument === '--agents' || argument === '--locales' || argument === '--default-locale' || argument === '--i18n') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}.`);
      }
      if (argument === '--effect') result.effect = value;
      else if (argument === '--agents') result.agents = value;
      else if (argument === '--locales') result.locales = value;
      else if (argument === '--default-locale') result.defaultLocale = value;
      else if (value === 'strict' || value === 'loose') result.i18n = value;
      else throw new Error(`Unknown i18n mode "${value}". Use strict or loose.`);
      continue;
    }
    if (argument.startsWith('--effect=')) {
      result.effect = argument.slice('--effect='.length);
      continue;
    }
    if (argument.startsWith('--agents=')) {
      result.agents = argument.slice('--agents='.length);
      continue;
    }
    if (argument.startsWith('--locales=')) {
      result.locales = argument.slice('--locales='.length);
      continue;
    }
    if (argument.startsWith('--default-locale=')) {
      result.defaultLocale = argument.slice('--default-locale='.length);
      continue;
    }
    if (argument.startsWith('--i18n=')) {
      const value = argument.slice('--i18n='.length);
      if (value !== 'strict' && value !== 'loose') throw new Error(`Unknown i18n mode "${value}". Use strict or loose.`);
      result.i18n = value;
      continue;
    }
    if (argument === '--yes' || argument === '--force' || argument === '--json') {
      result.flags.add(argument.slice(2));
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`Unknown option ${argument}.`);
    }
    if (result.directory) throw new Error('create accepts one destination directory.');
    result.directory = argument;
  }
  return result;
}

async function runCreate(argv: string[]): Promise<number> {
  const parsed = parseCreateArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }
  const readline = createInterface({ input, output });
  try {
    // This is intentionally the first question in the interactive flow: the
    // Effect v4 choice changes both dependencies and the installed skills.
    const mode = createModeFromFlag(
      parsed.effect ??
        (parsed.flags.has('yes')
          ? 'none'
          : (await readline.question('Use EffectTS v4? [y/N] ')).trim().toLowerCase().startsWith('y')
            ? 'v4'
            : 'none'),
    );
    const directory =
      parsed.directory ?? (await readline.question('Project directory: ')).trim();
    if (!directory) throw new Error('A destination directory is required.');
    const agentsValue =
      parsed.agents ??
      (parsed.flags.has('yes')
        ? undefined
        : await readline.question(
            'Agent integrations [codex,cursor,claude-code,cloud-code] (empty = Codex): ',
          ));
    const agents = parseCreateAgents(agentsValue);
    const result = await createCraftProject({
      directory,
      mode,
      agents,
      locales: parsed.locales?.split(',').map((locale) => locale.trim()).filter(Boolean),
      defaultLocale: parsed.defaultLocale,
      i18n: parsed.i18n ?? 'strict',
      force: parsed.flags.has('force'),
    });
    if (parsed.flags.has('json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Created ${result.mode === 'effect' ? 'Effect v4' : 'plain'} CraftTS app at ${result.directory}`);
      console.log(`Agents: ${result.agents.length > 0 ? result.agents.join(', ') : 'none'}`);
      console.log(`Next: cd ${result.directory} && npm install && npm run dev`);
    }
    return 0;
  } finally {
    readline.close();
  }
}

function runI18nCommand(command: 'check' | 'test'): number {
  const executable = command === 'check' ? 'tsc' : 'vitest';
  const args = command === 'check'
    ? ['-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false']
    : ['run', '--config', 'vitest.config.ts'];
  const result = spawnSync(`node_modules/.bin/${executable}`, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Unable to run i18n ${command}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function printResult(result: RouteCommandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const diagnostic of result.diagnostics) {
    console.error(`${diagnostic.code}: ${diagnostic.message}`);
  }
  if (result.changedFiles.length > 0) {
    console.log(
      `Changed:\n${result.changedFiles.map((file) => `  ${file}`).join('\n')}`,
    );
  }
}

function printVerificationResult(
  result: RouteVerificationResult,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const item of result.cases) {
    console.log(`${item.status === 'passed' ? '✓' : '✗'} ${item.id}`);
    if (item.status === 'failed' && item.expected.length > 0) {
      console.error(`  expected: ${item.expected.join(' / ')}`);
    }
  }
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic);
  }
  if (result.fixtureDirectory) {
    console.error(`Fixtures kept at: ${result.fixtureDirectory}`);
  }
}

function printHelp(): void {
  console.log(`Usage:
  craft create [directory] [options]
  craft i18n check|test
  craft graph [options]
  craft security check [--strict] [--root <dir>]
  craft route add [path] [options]
  craft route split --parent <file#collection> --prefix <path> --target <file>
  craft route verify [options]

Options:
  --effect <v4|none>           Select the Effect v4 or plain CraftTS starter
  --no-effect                  Alias for --effect none
  --agents <list>              codex,cursor,claude-code,cloud-code (or none)
  --locales <list>             Comma-separated locales (default: en-US)
  --default-locale <locale>    Initial locale (must be in --locales)
  --i18n <strict|loose>        Plural/catalogue validation mode (default: strict)
  --force                      Merge into a non-empty destination directory
  --json                       Emit the creation result as JSON
  --root <dir>                 Workspace root (defaults to cwd)
  --project <name|tsconfig>    Angular project or tsconfig
  --parent <file#collection>   Parent craftRoutes collection
  --component <file#Class>     Existing routed component
  --create-component <name>    Generate with the local Angular CLI or Nx
  --feature-file <file>        Create/use an explicit lazy feature collection
  --redirect-to <path>         Add a static redirect
  --prefix <path>              Static prefix moved by route split
  --target <file>              New lazy collection written by route split
  --tsconfig <file>             Application tsconfig (alias for --project)
  --dry-run                    Print the plan without writing
  --yes                        Apply without confirmation
  --json                       Emit machine-readable output
  --keep-fixtures              Keep temporary verification fixtures for debugging
`);
}

main(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
