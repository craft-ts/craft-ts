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
  type CreateAgent,
} from '../scripts/create/create-project.js';
import {
  selectOptionInteractively,
  selectOptionsInteractively,
  selectAgentsInteractively,
  type InteractiveOption,
  type AgentSelectorInput,
} from './agent-selector.js';
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
  frontendRuntime?: 'plain' | 'effect';
  backendRuntime?: 'none' | 'promise' | 'effect';
  effectScope?: 'none' | 'frontend' | 'backend' | 'both';
  agents?: string;
  locales?: string;
  defaultLocale?: string;
  i18n?: 'strict' | 'loose' | 'none';
  designSystem?: 'basic' | 'none';
  typedCss?: boolean;
  workspace?: 'standalone' | 'nx';
  references?: 'none' | 'craft-ts' | 'all';
  craftTsRef?: string;
  effectTsRef?: string;
  cloneCraftTs?: boolean;
  cloneEffectTs?: boolean;
  flags: Set<string>;
  help: boolean;
};

const CREATE_FRONTEND_OPTIONS: readonly InteractiveOption<'plain' | 'effect'>[] = [
  { value: 'plain', label: 'Plain CraftTS' },
  { value: 'effect', label: 'Effect v4' },
];
const CREATE_BACKEND_OPTIONS: readonly InteractiveOption<'none' | 'promise' | 'effect'>[] = [
  { value: 'none', label: 'No backend' },
  { value: 'promise', label: 'Promise server functions' },
  { value: 'effect', label: 'Effect server functions' },
];
const CREATE_I18N_OPTIONS: readonly InteractiveOption<'strict' | 'loose' | 'none'>[] = [
  { value: 'strict', label: 'Strict type-safe i18n' },
  { value: 'loose', label: 'Loose i18n validation' },
  { value: 'none', label: 'No i18n' },
];
const CREATE_DESIGN_SYSTEM_OPTIONS: readonly InteractiveOption<'basic' | 'none'>[] = [
  { value: 'basic', label: 'Basic design system' },
  { value: 'none', label: 'No design system' },
];
const CREATE_BOOLEAN_OPTIONS: readonly InteractiveOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const CREATE_WORKSPACE_OPTIONS: readonly InteractiveOption<'standalone' | 'nx'>[] = [
  { value: 'standalone', label: 'Standalone project' },
  { value: 'nx', label: 'Nx workspace' },
];
const CREATE_LOCALE_OPTIONS: readonly InteractiveOption<string>[] = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'fr-FR', label: 'Français (France)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'es-ES', label: 'Español (España)' },
  { value: 'it-IT', label: 'Italiano (Italia)' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'ja-JP', label: '日本語 (日本)' },
  { value: 'zh-CN', label: '中文 (中国)' },
];

export function parseCreateArgs(argv: string[]): CreateArgs {
  const result: CreateArgs = { flags: new Set(), help: false };
  const values = new Map<string, string>();
  const valueNames = new Set([
    'effect', 'frontend-runtime', 'backend-runtime', 'effect-scope', 'agents',
    'locales', 'default-locale', 'i18n', 'design-system', 'workspace',
    'references', 'craft-ts-ref', 'effect-ts-ref',
  ]);
  const setValue = (name: string, value: string): void => {
    values.set(name, value);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      result.help = true;
      continue;
    }
    if (argument === '--no-effect' || argument === '--no-i18n' || argument === '--no-design-system' || argument === '--no-typed-css' || argument === '--no-clone-craft-ts' || argument === '--no-clone-effect-ts') {
      if (argument === '--no-effect') setValue('effect', 'none');
      else if (argument === '--no-i18n') setValue('i18n', 'none');
      else if (argument === '--no-design-system') setValue('design-system', 'none');
      else if (argument === '--no-typed-css') result.typedCss = false;
      else if (argument === '--no-clone-craft-ts') result.cloneCraftTs = false;
      else result.cloneEffectTs = false;
      continue;
    }
    if (valueNames.has(argument.slice(2))) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}.`);
      }
      setValue(argument.slice(2), value);
      continue;
    }
    if (argument.startsWith('--') && argument.includes('=')) {
      const [name, ...parts] = argument.slice(2).split('=');
      if (!valueNames.has(name)) throw new Error(`Unknown option --${name}.`);
      setValue(name, parts.join('='));
      continue;
    }
    if (argument === '--typed-css' || argument === '--clone-craft-ts' || argument === '--clone-effect-ts') {
      if (argument === '--typed-css') result.typedCss = true;
      else if (argument === '--clone-craft-ts') result.cloneCraftTs = true;
      else result.cloneEffectTs = true;
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
  result.effect = values.get('effect');
  result.frontendRuntime = values.get('frontend-runtime') as CreateArgs['frontendRuntime'];
  result.backendRuntime = values.get('backend-runtime') as CreateArgs['backendRuntime'];
  result.effectScope = values.get('effect-scope') as CreateArgs['effectScope'];
  result.agents = values.get('agents');
  result.locales = values.get('locales');
  result.defaultLocale = values.get('default-locale');
  result.i18n = values.get('i18n') as CreateArgs['i18n'];
  result.designSystem = values.get('design-system') as CreateArgs['designSystem'];
  result.workspace = values.get('workspace') as CreateArgs['workspace'];
  result.references = values.get('references') as CreateArgs['references'];
  result.craftTsRef = values.get('craft-ts-ref');
  result.effectTsRef = values.get('effect-ts-ref');
  return result;
}

function parseLocales(value: string): string[] {
  const locales = value
    .split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);
  return locales.length > 0 ? locales : ['en-US', 'fr-FR'];
}

async function selectCreateOption<Value extends string>(
  readline: ReturnType<typeof createInterface>,
  options: readonly InteractiveOption<Value>[],
  title: string,
  initialValue: Value,
): Promise<Value> {
  readline.pause();
  return selectOptionInteractively(
    options,
    title,
    initialValue,
    input as AgentSelectorInput,
    output,
  );
}

async function selectCreateOptions<Value extends string>(
  readline: ReturnType<typeof createInterface>,
  options: readonly InteractiveOption<Value>[],
  title: string,
  initialSelection: readonly Value[],
  minimumSelection = 0,
): Promise<readonly Value[]> {
  readline.pause();
  return selectOptionsInteractively(
    options,
    title,
    initialSelection,
    input as AgentSelectorInput,
    output,
    minimumSelection,
  );
}

async function runCreate(argv: string[]): Promise<number> {
  const parsed = parseCreateArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }
  const readline = createInterface({ input, output });
  try {
    const directory =
      parsed.directory ?? (await readline.question('Project directory: ')).trim();
    if (!directory) throw new Error('A destination directory is required.');
    const interactive = Boolean(process.stdin.isTTY) && !parsed.flags.has('yes');
    const legacyMode = parsed.effect === undefined
      ? undefined
      : createModeFromFlag(parsed.effect);
    const frontendRuntime = parsed.frontendRuntime ?? legacyMode ?? (parsed.effectScope ? undefined : (
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_FRONTEND_OPTIONS,
            'Frontend runtime (↑/↓ move, Enter confirm):',
            'plain',
          )
        : 'plain'
    ));
    const backendRuntime = parsed.backendRuntime ?? (parsed.effectScope ? undefined : (
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_BACKEND_OPTIONS,
            'Backend runtime (↑/↓ move, Enter confirm):',
            'none',
          )
        : 'none'
    ));
    const i18n = parsed.i18n ?? (
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_I18N_OPTIONS,
            'i18n (↑/↓ move, Enter confirm):',
            'strict',
          )
        : 'strict'
    );
    const locales = parsed.locales !== undefined
      ? parseLocales(parsed.locales)
      : interactive && i18n !== 'none'
        ? [...await selectCreateOptions(
            readline,
            CREATE_LOCALE_OPTIONS,
            'Locales (↑/↓ move, Space toggle, Enter confirm):',
            ['en-US', 'fr-FR'],
            1,
          )]
        : undefined;
    const defaultLocale = parsed.defaultLocale ?? (
      interactive && i18n !== 'none'
        ? await selectCreateOption(
            readline,
            (locales ?? ['en-US']).map((locale) => ({ value: locale, label: locale })),
            'Default locale (↑/↓ move, Enter confirm):',
            locales?.[0] ?? 'en-US',
          )
        : undefined
    );
    const designSystem = parsed.designSystem ?? (
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_DESIGN_SYSTEM_OPTIONS,
            'Design system (↑/↓ move, Enter confirm):',
            'basic',
          )
        : 'basic'
    );
    const typedCss = parsed.typedCss ?? (
      interactive
        ? (await selectCreateOption(
            readline,
            CREATE_BOOLEAN_OPTIONS,
            'Enable typed CSS? (↑/↓ move, Enter confirm):',
            'yes',
          )) === 'yes'
        : true
    );
    const workspace = parsed.workspace ?? (
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_WORKSPACE_OPTIONS,
            'Workspace (↑/↓ move, Enter confirm):',
            'standalone',
          )
        : undefined
    );
    let references = parsed.references;
    let cloneCraftTs = parsed.cloneCraftTs;
    let cloneEffectTs = parsed.cloneEffectTs;
    const effectEnabled = frontendRuntime === 'effect'
      || backendRuntime === 'effect'
      || (parsed.effectScope !== undefined && parsed.effectScope !== 'none');
    if (interactive && references === undefined && cloneCraftTs === undefined && cloneEffectTs === undefined) {
      cloneCraftTs = (await selectCreateOption(
        readline,
        CREATE_BOOLEAN_OPTIONS,
        'Clone CraftTS sources for the AI? (↑/↓ move, Enter confirm):',
        'yes',
      )) === 'yes';
      cloneEffectTs = effectEnabled
        ? (await selectCreateOption(
            readline,
            CREATE_BOOLEAN_OPTIONS,
            'Clone EffectTS sources for the AI? (↑/↓ move, Enter confirm):',
            'yes',
          )) === 'yes'
        : false;
      references = cloneEffectTs ? 'all' : cloneCraftTs ? 'craft-ts' : 'none';
    }
    let agents: readonly CreateAgent[];
    if (parsed.agents !== undefined) {
      agents = parseCreateAgents(parsed.agents);
    } else if (interactive) {
      agents = await selectAgentsInteractively(
        process.stdin as AgentSelectorInput,
        output,
      );
    } else {
      agents = parseCreateAgents(undefined);
    }
    const result = await createCraftProject({
      directory,
      mode: legacyMode,
      frontendRuntime,
      backendRuntime,
      effectScope: parsed.effectScope,
      agents,
      locales,
      defaultLocale,
      i18n,
      designSystem,
      typedCss,
      workspace,
      references,
      craftTsRef: parsed.craftTsRef,
      effectTsRef: parsed.effectTsRef,
      cloneCraftTs,
      cloneEffectTs,
      force: parsed.flags.has('force'),
    });
    if (parsed.flags.has('json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Created ${result.frontendRuntime === 'effect' ? 'Effect v4' : 'plain'} CraftTS app at ${result.directory}`);
      console.log(`Runtime: frontend=${result.frontendRuntime}, backend=${result.backendRuntime}`);
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
  --frontend-runtime <plain|effect>
  --backend-runtime <none|promise|effect>
  --effect-scope <none|frontend|backend|both>
  --agents <list>              codex,cursor,claude-code,gemini (cloud-code alias; or none)
  --locales <list>             Comma-separated locales (default: en-US,fr-FR)
  --default-locale <locale>    Initial locale (must be in --locales)
  --i18n <strict|loose|none>   Plural/catalogue validation mode
  --no-i18n                    Disable i18n and its files/scripts
  --design-system <basic|none>
  --no-design-system
  --typed-css / --no-typed-css
  --workspace <standalone|nx>
  --references <none|craft-ts|all>
  --craft-ts-ref <git-ref>     CraftTS reference tag/commit
  --effect-ts-ref <git-ref>    EffectTS reference tag/commit
  --clone-craft-ts / --no-clone-craft-ts
  --clone-effect-ts / --no-clone-effect-ts
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
