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

type CommonOptions = {
  rootDir?: string;
  project?: string;
  parent?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
};

async function main(argv: string[]): Promise<number> {
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
  if (argv[0] !== 'route' || !['add', 'split'].includes(argv[1] ?? '')) {
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
    project: parsed.values['project'],
    parent: parsed.values['parent'],
    dryRun: parsed.flags.has('dry-run'),
    yes: parsed.flags.has('yes'),
    json: parsed.flags.has('json'),
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
    'parent',
    'component',
    'create-component',
    'feature-file',
    'redirect-to',
    'prefix',
    'target',
  ]);
  const flagOptions = new Set(['dry-run', 'yes', 'json']);
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

function printHelp(): void {
  console.log(`Usage:
  craft graph [options]
  craft route add [path] [options]
  craft route split --parent <file#collection> --prefix <path> --target <file>

Options:
  --root <dir>                 Workspace root (defaults to cwd)
  --project <name|tsconfig>    Angular project or tsconfig
  --parent <file#collection>   Parent craftRoutes collection
  --component <file#Class>     Existing routed component
  --create-component <name>    Generate with the local Angular CLI or Nx
  --feature-file <file>        Create/use an explicit lazy feature collection
  --redirect-to <path>         Add a static redirect
  --prefix <path>              Static prefix moved by route split
  --target <file>              New lazy collection written by route split
  --dry-run                    Print the plan without writing
  --yes                        Apply without confirmation
  --json                       Emit machine-readable output
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
