#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
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
  DEFAULT_CREATE_VIEWPORTS,
  parseCreateAgents,
  type CreateAgent,
  type CreateAttestationMode,
  type CreateViewport,
} from '../scripts/create/create-project.js';
import {
  selectOptionInteractively,
  selectOptionsInteractively,
  selectAgentsInteractively,
  type InteractiveOption,
  type AgentSelectorInput,
} from './agent-selector.js';
import { runAgentSync } from '../scripts/create/sync-agents.js';
import { runSecurityCheck } from '../scripts/security-check.js';
import { runFormAdd } from '../scripts/forms/form-command.js';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  organizeProject,
  type OrganizerConfig,
} from '../scripts/folder-layout.js';
import {
  applyFolderLayoutProposal,
} from '../scripts/apply-folder-layout.js';

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
  if (argv[0] === 'add' && argv[1] === 'form') {
    return await runForm(argv.slice(2));
  }
  if (argv[0] === 'graph') {
    const { spawn } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const graphBin = fileURLToPath(
      new URL('./craft-graph.js', import.meta.url),
    );
    const child = spawn(process.execPath, [graphBin, ...argv.slice(1)], {
      stdio: 'inherit',
    });
    return await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
  }
  if (argv[0] === 'organize') {
    if (argv[1] === 'apply') return runOrganizeApply(argv.slice(2));
    return runOrganize(argv.slice(1));
  }
  if (argv[0] === 'security' && argv[1] === 'check') {
    const rootIndex = argv.indexOf('--root');
    const rootDir = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
    const result = runSecurityCheck({
      rootDir,
      strict: argv.includes('--strict'),
    });
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
  if (argv[0] === 'agents' && argv[1] === 'sync') {
    return runAgentsSync(argv.slice(2));
  }
  if (argv[0] === 'i18n' && ['check', 'test'].includes(argv[1] ?? '')) {
    return runI18nCommand(argv[1] as 'check' | 'test');
  }
  if (
    argv[0] !== 'route' ||
    !['add', 'split', 'verify'].includes(argv[1] ?? '')
  ) {
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

function runOrganize(argv: string[]): number {
  let project = 'tsconfig.graph.json';
  let graph = 'craft-dependency-graph.json';
  let out = 'folder-layout';
  let rootDir = process.cwd();
  let targetRoot: string | undefined;
  let configPath: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project' || argument === '--tsconfig')
      project = argv[++index] ?? project;
    else if (argument === '--graph') graph = argv[++index] ?? graph;
    else if (argument === '--out') out = argv[++index] ?? out;
    else if (argument === '--root') rootDir = argv[++index] ?? rootDir;
    else if (argument === '--target-root') targetRoot = argv[++index];
    else if (argument === '--config') configPath = argv[++index];
    else if (argument === '--json') json = true;
    else if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: craft organize --project <tsconfig> --graph <graph.json> [--config <organizer.json>] [--out <directory>] [--target-root <directory>] [--root <directory>] [--json]',
      );
      return 0;
    } else throw new Error(`craft organize: unknown argument ${argument}`);
  }
  let config: OrganizerConfig = {};
  if (configPath) {
    const absoluteConfigPath = resolve(rootDir, configPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(absoluteConfigPath, 'utf8')) as unknown;
    } catch (error) {
      throw new Error(
        `craft organize: cannot read config ${absoluteConfigPath}: ${String(error)}`,
      );
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(
        `craft organize: config ${absoluteConfigPath} must contain a JSON object.`,
      );
    const rawConfig = parsed as Record<string, unknown>;
    const unknownKeys = Object.keys(rawConfig).filter(
      (key) => !['weights', 'thresholds', 'placementRules'].includes(key),
    );
    if (unknownKeys.length > 0)
      throw new Error(
        `craft organize: unknown config key(s): ${unknownKeys.join(', ')}.`,
      );
    config = rawConfig as OrganizerConfig;
  }
  const result = organizeProject({
    ...config,
    rootDir,
    project,
    graph,
    out,
    ...(targetRoot ? { targetRoot } : {}),
  });
  if (json) console.log(JSON.stringify(result.proposal, null, 2));
  else {
    const deletionCount = result.proposal.placements.filter(
      (placement) => placement.action === 'delete',
    ).length;
    console.log(
      `Craft folder layout written to ${result.outputDir} (${result.proposal.statistics.moves} move(s), ${deletionCount} proposed deletion(s), ${result.proposal.statistics.reviews} review(s)).`,
    );
  }
  return 0;
}

function runOrganizeApply(argv: string[]): number {
  let proposalPath: string | undefined;
  let project = 'tsconfig.graph.json';
  let rootDir = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--proposal') proposalPath = argv[++index];
    else if (argument === '--project' || argument === '--tsconfig')
      project = argv[++index] ?? project;
    else if (argument === '--root') rootDir = argv[++index] ?? rootDir;
    else if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: craft organize apply --proposal <folder-layout-proposal.json> --project <tsconfig> [--root <directory>]',
      );
      return 0;
    } else throw new Error(`craft organize apply: unknown argument ${argument}`);
  }
  if (!proposalPath)
    throw new Error('craft organize apply: --proposal is required.');
  const proposal = JSON.parse(
    readFileSync(resolve(rootDir, proposalPath), 'utf8'),
  ) as import('../scripts/folder-layout.js').FolderLayoutProposal;
  const plan = applyFolderLayoutProposal({ rootDir, project, proposal });
  console.log(
    `Applied folder layout with Git (${plan.moves} move(s), ${plan.deletions} deletion(s), ${plan.manualReviews} manual review(s) left unchanged).`,
  );
  return 0;
}

async function runForm(argv: string[]): Promise<number> {
  let name: string | undefined;
  let rootDir: string | undefined;
  let advanced = false;
  let force = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(
        'Usage: craft add form <name> [--advanced] [--force] [--root <dir>] [--json]',
      );
      return 0;
    }
    if (argument === '--advanced') {
      advanced = true;
      continue;
    }
    if (argument === '--force') {
      force = true;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--root') {
      rootDir = argv[++index];
      if (!rootDir) throw new Error('Missing value for --root.');
      continue;
    }
    if (argument.startsWith('--'))
      throw new Error(`Unknown option ${argument}.`);
    if (name) throw new Error('craft add form accepts one form name.');
    name = argument;
  }
  if (!name)
    throw new Error('A form name is required. Usage: craft add form <name>.');
  const result = await runFormAdd({ name, rootDir, advanced, force });
  if (json) console.log(JSON.stringify(result, null, 2));
  else
    console.log(
      `Generated ${result.advanced ? 'advanced' : 'simple'} form in ${result.directory}\n${result.changedFiles.join('\n')}`,
    );
  return 0;
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
  attest?: boolean;
  attestationMode?: CreateAttestationMode | 'none';
  viewports?: string;
  viewportSpecs?: readonly string[];
  templateObligations?: boolean;
  visualTests?: boolean;
  workspace?: 'standalone' | 'nx';
  references?: 'none' | 'craft-ts' | 'all';
  craftTsRef?: string;
  effectTsRef?: string;
  cloneCraftTs?: boolean;
  cloneEffectTs?: boolean;
  demoPages?: boolean;
  domain?: string;
  flags: Set<string>;
  help: boolean;
};

const CREATE_APPLICATION_OPTIONS: readonly InteractiveOption<
  'frontend' | 'full-stack'
>[] = [
  { value: 'frontend', label: 'Frontend-only application' },
  { value: 'full-stack', label: 'Full-stack application' },
];
const CREATE_FRONTEND_OPTIONS: readonly InteractiveOption<
  'plain' | 'effect'
>[] = [
  { value: 'plain', label: 'Plain CraftTS' },
  { value: 'effect', label: 'Effect v4' },
];
const CREATE_FULL_STACK_BACKEND_OPTIONS: readonly InteractiveOption<
  'promise' | 'effect'
>[] = [
  { value: 'promise', label: 'Promise server functions' },
  { value: 'effect', label: 'EffectTS server functions (recommended)' },
];
const CREATE_I18N_OPTIONS: readonly InteractiveOption<
  'strict' | 'loose' | 'none'
>[] = [
  { value: 'strict', label: 'Strict type-safe i18n' },
  { value: 'loose', label: 'Loose i18n validation' },
  { value: 'none', label: 'No i18n' },
];
const CREATE_DESIGN_SYSTEM_OPTIONS: readonly InteractiveOption<
  'basic' | 'none'
>[] = [
  { value: 'basic', label: 'Basic design system' },
  { value: 'none', label: 'No design system' },
];
const CREATE_BOOLEAN_OPTIONS: readonly InteractiveOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const CREATE_ATTESTATION_MODE_OPTIONS: readonly InteractiveOption<CreateAttestationMode>[] =
  [
    { value: 'manual', label: 'Manual review in the attestation app' },
    { value: 'ai', label: 'AI-assisted review' },
  ];
const CREATE_VIEWPORT_OPTIONS: readonly InteractiveOption<string>[] =
  Object.entries(DEFAULT_CREATE_VIEWPORTS).map(([value, size]) => ({
    value,
    label: `${value} (${size.width}×${size.height})`,
  }));
const CREATE_WORKSPACE_OPTIONS: readonly InteractiveOption<
  'standalone' | 'nx'
>[] = [
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
    'effect',
    'frontend-runtime',
    'backend-runtime',
    'effect-scope',
    'agents',
    'locales',
    'default-locale',
    'i18n',
    'design-system',
    'attestation',
    'workspace',
    'references',
    'craft-ts-ref',
    'effect-ts-ref',
    'viewports',
    'domain',
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
    if (
      argument === '--no-effect' ||
      argument === '--no-i18n' ||
      argument === '--no-design-system' ||
      argument === '--no-attest' ||
      argument === '--no-template-obligations' ||
      argument === '--no-visual-tests' ||
      argument === '--no-clone-craft-ts' ||
      argument === '--no-clone-effect-ts' ||
      argument === '--no-demos'
    ) {
      if (argument === '--no-effect') setValue('effect', 'none');
      else if (argument === '--no-i18n') setValue('i18n', 'none');
      else if (argument === '--no-design-system')
        setValue('design-system', 'none');
      else if (argument === '--no-attest') result.attest = false;
      else if (argument === '--no-template-obligations')
        result.templateObligations = false;
      else if (argument === '--no-visual-tests') result.visualTests = false;
      else if (argument === '--no-clone-craft-ts') result.cloneCraftTs = false;
      else if (argument === '--no-clone-effect-ts')
        result.cloneEffectTs = false;
      else result.demoPages = false;
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
    if (argument === '--viewport') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --viewport.');
      }
      result.viewportSpecs = [...(result.viewportSpecs ?? []), value];
      continue;
    }
    if (argument.startsWith('--') && argument.includes('=')) {
      const [name, ...parts] = argument.slice(2).split('=');
      if (!valueNames.has(name)) throw new Error(`Unknown option --${name}.`);
      setValue(name, parts.join('='));
      continue;
    }
    // @craft-ts/style is the only way to style a component: there is no
    // plain-CSS starter left to opt into. `--typed-css` asked for what every
    // project now gets and is accepted as a no-op; opting out is an error.
    if (argument === '--typed-css') continue;
    if (argument === '--no-typed-css') {
      throw new Error(
        '--no-typed-css is no longer supported: @craft-ts/style is the only way to style a component in a CraftTS project.',
      );
    }
    if (
      argument === '--attest' ||
      argument === '--template-obligations' ||
      argument === '--visual-tests' ||
      argument === '--clone-craft-ts' ||
      argument === '--clone-effect-ts' ||
      argument === '--demos'
    ) {
      if (argument === '--attest') result.attest = true;
      else if (argument === '--template-obligations')
        result.templateObligations = true;
      else if (argument === '--visual-tests') result.visualTests = true;
      else if (argument === '--clone-craft-ts') result.cloneCraftTs = true;
      else if (argument === '--clone-effect-ts') result.cloneEffectTs = true;
      else result.demoPages = true;
      continue;
    }
    if (
      argument === '--yes' ||
      argument === '--force' ||
      argument === '--json'
    ) {
      result.flags.add(argument.slice(2));
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`Unknown option ${argument}.`);
    }
    if (result.directory)
      throw new Error('create accepts one destination directory.');
    result.directory = argument;
  }
  result.effect = values.get('effect');
  result.frontendRuntime = values.get(
    'frontend-runtime',
  ) as CreateArgs['frontendRuntime'];
  result.backendRuntime = values.get(
    'backend-runtime',
  ) as CreateArgs['backendRuntime'];
  result.effectScope = values.get('effect-scope') as CreateArgs['effectScope'];
  result.agents = values.get('agents');
  result.locales = values.get('locales');
  result.defaultLocale = values.get('default-locale');
  result.i18n = values.get('i18n') as CreateArgs['i18n'];
  result.designSystem = values.get(
    'design-system',
  ) as CreateArgs['designSystem'];
  result.attestationMode = values.get(
    'attestation',
  ) as CreateArgs['attestationMode'];
  result.workspace = values.get('workspace') as CreateArgs['workspace'];
  result.references = values.get('references') as CreateArgs['references'];
  result.craftTsRef = values.get('craft-ts-ref');
  result.effectTsRef = values.get('effect-ts-ref');
  result.viewports = values.get('viewports');
  result.domain = values.get('domain');
  return result;
}

function parseLocales(value: string): string[] {
  const locales = value
    .split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);
  return locales.length > 0 ? locales : ['en-US', 'fr-FR'];
}

function parseCreateViewports(
  selection: string | undefined,
  customSpecs: readonly string[] = [],
): Readonly<Record<string, CreateViewport>> | undefined {
  if (selection === undefined && customSpecs.length === 0) return undefined;
  if (selection?.trim().toLowerCase() === 'none') return {};
  const viewports: Record<string, CreateViewport> = {};
  for (const name of (selection ?? '')
    .split(',')
    .map((value) => value.trim())) {
    if (!name) continue;
    const viewport =
      DEFAULT_CREATE_VIEWPORTS[name as keyof typeof DEFAULT_CREATE_VIEWPORTS];
    if (!viewport) {
      throw new Error(
        `Unknown viewport "${name}". Use mobile, tablet, desktop, or --viewport name=widthxheight.`,
      );
    }
    viewports[name] = viewport;
  }
  for (const spec of customSpecs) {
    const match =
      /^(?<name>[a-zA-Z][a-zA-Z0-9_-]*)=(?<width>\d+)x(?<height>\d+)$/.exec(
        spec.trim(),
      );
    if (!match?.groups) {
      throw new Error(
        `Invalid --viewport "${spec}". Expected name=widthxheight.`,
      );
    }
    const name = match.groups['name'];
    const width = Number(match.groups['width']);
    const height = Number(match.groups['height']);
    if (!name || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new Error(
        `Invalid --viewport "${spec}". Expected name=widthxheight.`,
      );
    }
    viewports[name] = { width, height };
  }
  return viewports;
}

async function selectCreateViewports(
  readline: ReturnType<typeof createInterface>,
): Promise<Readonly<Record<string, CreateViewport>>> {
  const selectedNames = await selectCreateOptions(
    readline,
    CREATE_VIEWPORT_OPTIONS,
    'Application happy paths (↑/↓ move, Space toggle, Enter confirm):',
    ['mobile', 'tablet', 'desktop'],
  );
  const viewports: Record<string, CreateViewport> = Object.fromEntries(
    selectedNames.map((name) => [
      name,
      DEFAULT_CREATE_VIEWPORTS[name as keyof typeof DEFAULT_CREATE_VIEWPORTS],
    ]),
  );
  while (
    /^y(?:es)?$/i.test(
      (await readline.question('Add a custom viewport? [y/N] ')).trim(),
    )
  ) {
    const name = (await readline.question('Viewport name: ')).trim();
    const width = Number(await readline.question('Viewport width (px): '));
    const height = Number(await readline.question('Viewport height (px): '));
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) ||
      !Number.isInteger(width) ||
      width < 1 ||
      !Number.isInteger(height) ||
      height < 1
    ) {
      throw new Error(
        'A custom viewport needs a name and positive integer width/height.',
      );
    }
    viewports[name] = { width, height };
  }
  return viewports;
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
      parsed.directory ??
      (await readline.question('Project directory: ')).trim();
    if (!directory) throw new Error('A destination directory is required.');
    const interactive =
      Boolean(process.stdin.isTTY) && !parsed.flags.has('yes');
    const legacyMode =
      parsed.effect === undefined
        ? undefined
        : createModeFromFlag(parsed.effect);
    const explicitApplicationKind =
      parsed.backendRuntime !== undefined
        ? parsed.backendRuntime === 'none'
          ? 'frontend'
          : 'full-stack'
        : parsed.effectScope !== undefined
          ? parsed.effectScope === 'backend' || parsed.effectScope === 'both'
            ? 'full-stack'
            : 'frontend'
          : 'frontend';
    const applicationKind =
      parsed.frontendRuntime === undefined &&
      parsed.effect === undefined &&
      parsed.effectScope === undefined &&
      parsed.backendRuntime === undefined &&
      interactive
        ? await selectCreateOption(
            readline,
            CREATE_APPLICATION_OPTIONS,
            'Application type (↑/↓ move, Enter confirm):',
            'frontend',
          )
        : explicitApplicationKind;
    const backendRuntime =
      parsed.backendRuntime ??
      (parsed.effectScope !== undefined
        ? undefined
        : applicationKind === 'full-stack'
          ? interactive
            ? await selectCreateOption(
                readline,
                CREATE_FULL_STACK_BACKEND_OPTIONS,
                'Backend runtime (EffectTS is recommended; ↑/↓ move, Enter confirm):',
                'effect',
              )
            : 'effect'
          : 'none');
    const frontendRuntime =
      parsed.frontendRuntime ??
      legacyMode ??
      (parsed.effectScope
        ? undefined
        : interactive
          ? await selectCreateOption(
              readline,
              CREATE_FRONTEND_OPTIONS,
              'Frontend runtime (↑/↓ move, Enter confirm):',
              'plain',
            )
          : 'plain');
    const i18n =
      parsed.i18n ??
      (interactive
        ? await selectCreateOption(
            readline,
            CREATE_I18N_OPTIONS,
            'i18n (↑/↓ move, Enter confirm):',
            'strict',
          )
        : 'strict');
    const locales =
      parsed.locales !== undefined
        ? parseLocales(parsed.locales)
        : interactive && i18n !== 'none'
          ? [
              ...(await selectCreateOptions(
                readline,
                CREATE_LOCALE_OPTIONS,
                'Locales (↑/↓ move, Space toggle, Enter confirm):',
                ['en-US', 'fr-FR'],
                1,
              )),
            ]
          : undefined;
    const defaultLocale =
      parsed.defaultLocale ??
      (interactive && i18n !== 'none'
        ? await selectCreateOption(
            readline,
            (locales ?? ['en-US']).map((locale) => ({
              value: locale,
              label: locale,
            })),
            'Default locale (↑/↓ move, Enter confirm):',
            locales?.[0] ?? 'en-US',
          )
        : undefined);
    const designSystem =
      parsed.designSystem ??
      (interactive
        ? await selectCreateOption(
            readline,
            CREATE_DESIGN_SYSTEM_OPTIONS,
            'Design system (↑/↓ move, Enter confirm):',
            'basic',
          )
        : 'basic');
    const workspace =
      parsed.workspace ??
      (interactive
        ? await selectCreateOption(
            readline,
            CREATE_WORKSPACE_OPTIONS,
            'Workspace (↑/↓ move, Enter confirm):',
            'standalone',
          )
        : undefined);
    const explicitAttestationConfig =
      parsed.attestationMode !== undefined ||
      parsed.viewports !== undefined ||
      (parsed.viewportSpecs?.length ?? 0) > 0 ||
      parsed.templateObligations !== undefined ||
      parsed.visualTests !== undefined;
    if (
      parsed.attestationMode === 'none' &&
      (parsed.attest === true ||
        parsed.viewports !== undefined ||
        (parsed.viewportSpecs?.length ?? 0) > 0 ||
        parsed.templateObligations !== undefined ||
        parsed.visualTests !== undefined)
    ) {
      throw new Error(
        '--attestation none cannot be combined with attestation options.',
      );
    }
    const attest =
      parsed.attestationMode === 'none'
        ? false
        : (parsed.attest ??
          (explicitAttestationConfig
            ? true
            : interactive
              ? (await selectCreateOption(
                  readline,
                  CREATE_BOOLEAN_OPTIONS,
                  'Generate an attestation workflow? (↑/↓ move, Enter confirm):',
                  'yes',
                )) === 'yes'
              : false));
    if (parsed.attest === false && explicitAttestationConfig) {
      throw new Error(
        '--no-attest cannot be combined with attestation options.',
      );
    }
    const attestation = attest
      ? {
          mode:
            (parsed.attestationMode === 'none'
              ? 'manual'
              : parsed.attestationMode) ??
            (interactive
              ? await selectCreateOption(
                  readline,
                  CREATE_ATTESTATION_MODE_OPTIONS,
                  'Attestation reviewer (↑/↓ move, Enter confirm):',
                  'manual',
                )
              : 'manual'),
          viewports:
            parseCreateViewports(parsed.viewports, parsed.viewportSpecs) ??
            (interactive ? await selectCreateViewports(readline) : undefined),
          template:
            parsed.templateObligations ??
            (interactive && parsed.attest === undefined
              ? (await selectCreateOption(
                  readline,
                  CREATE_BOOLEAN_OPTIONS,
                  'Generate template obligations? (↑/↓ move, Enter confirm):',
                  'yes',
                )) === 'yes'
              : true),
          visualTests:
            parsed.visualTests ??
            (interactive && parsed.attest === undefined
              ? (await selectCreateOption(
                  readline,
                  CREATE_BOOLEAN_OPTIONS,
                  'Include visual hotspot tests? (↑/↓ move, Enter confirm):',
                  'yes',
                )) === 'yes'
              : false),
        }
      : undefined;
    let references = parsed.references;
    let cloneCraftTs = parsed.cloneCraftTs;
    let cloneEffectTs = parsed.cloneEffectTs;
    const effectEnabled =
      frontendRuntime === 'effect' ||
      backendRuntime === 'effect' ||
      (parsed.effectScope !== undefined && parsed.effectScope !== 'none');
    if (
      references === undefined &&
      cloneCraftTs === undefined &&
      cloneEffectTs === undefined
    ) {
      // Agent context is part of the default starter: CraftTS is always
      // useful, and EffectTS is needed whenever either runtime uses it.
      cloneCraftTs = true;
      cloneEffectTs = effectEnabled;
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
      attest,
      attestation,
      workspace,
      references,
      craftTsRef: parsed.craftTsRef,
      effectTsRef: parsed.effectTsRef,
      cloneCraftTs,
      cloneEffectTs,
      demoPages: parsed.demoPages,
      domain: parsed.domain,
      force: parsed.flags.has('force'),
    });
    if (parsed.flags.has('json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `Created ${result.frontendRuntime === 'effect' ? 'Effect v4' : 'plain'} CraftTS app at ${result.directory}`,
      );
      console.log(
        `Runtime: frontend=${result.frontendRuntime}, backend=${result.backendRuntime}`,
      );
      console.log(
        `Agents: ${result.agents.length > 0 ? result.agents.join(', ') : 'none'}`,
      );
      console.log(`Next: cd ${result.directory} && npm install && npm run dev`);
    }
    return 0;
  } finally {
    readline.close();
  }
}

function runI18nCommand(command: 'check' | 'test'): number {
  const executable = command === 'check' ? 'tsc' : 'vitest';
  const args =
    command === 'check'
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

/**
 * Adds today's agent wiring to a project created earlier.
 *
 * Deliberately narrow: skills, hooks, the graph MCP server, its scripts and its
 * ignored output. `craft create --force` would rewrite the whole starter,
 * source included, which is a regeneration rather than an upgrade.
 */
function runAgentsSync(argv: string[]): number {
  let rootDir = process.cwd();
  let agents: readonly CreateAgent[] | undefined;
  let dryRun = false;
  let asJson = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') rootDir = argv[++index] ?? rootDir;
    else if (argument === '--agents') agents = parseCreateAgents(argv[++index]);
    else if (argument === '--dry-run') dryRun = true;
    else if (argument === '--json') asJson = true;
    else {
      console.error(`Unknown argument: ${argument}`);
      return 1;
    }
  }

  const result = runAgentSync({
    rootDir,
    ...(agents ? { agents } : {}),
    dryRun,
  });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return result.agents.length > 0 ? 0 : 1;
  }
  if (result.agents.length === 0) {
    console.error(
      'craft agents sync: no agent directory found (.agents, .claude, .cursor, .gemini). Pass --agents codex,cursor,claude-code,cloud-code.',
    );
    return 1;
  }
  for (const change of result.changes) {
    if (change.action === 'unchanged') continue;
    const label = dryRun
      ? `would ${change.action === 'created' ? 'create' : change.action === 'updated' ? 'update' : change.action}`
      : change.action;
    console.log(`${label} ${change.file} — ${change.detail}`);
  }
  if (!result.changed) {
    console.log(`Already up to date for ${result.agents.join(', ')}.`);
    return 0;
  }
  console.log(
    dryRun
      ? `Would update ${result.agents.join(', ')}. Run without --dry-run to apply.`
      : `Updated ${result.agents.join(', ')}. Run npm install, then npm run graph.`,
  );
  return 0;
}

function printHelp(): void {
  console.log(`Usage:
  craft create [directory] [options]
  craft add form <name> [--advanced] [--force]
  craft i18n check|test
  craft graph [options]
  craft organize --project <tsconfig> --graph <graph.json> [options]
  craft organize apply --proposal <folder-layout-proposal.json> --project <tsconfig>
  craft agents sync [--agents <list>] [--root <dir>] [--dry-run] [--json]
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
  --agents <list>              codex,cursor,claude-code (or none)
  --locales <list>             Comma-separated locales (default: en-US,fr-FR)
  --default-locale <locale>    Initial locale (must be in --locales)
  --i18n <strict|loose|none>   Plural/catalogue validation mode
  --no-i18n                    Disable i18n and its files/scripts
  --design-system <basic|none>
  --no-design-system
  --attest / --no-attest      Generate the opt-in attestation workflow
  --attestation <manual|ai|none>
                              Choose manual or AI-assisted review
  --viewports <list>           mobile,tablet,desktop (or none)
  --viewport <name=widthxheight>
                              Add a custom attestation viewport; repeatable
  --template-obligations / --no-template-obligations
                              Include or omit template obligations
  --visual-tests / --no-visual-tests
                              Include or omit visual hotspot tests
  --workspace <standalone|nx>
  --references <none|craft-ts|all> (default: CraftTS, plus EffectTS when selected)
  --craft-ts-ref <git-ref>     CraftTS reference tag/commit
  --effect-ts-ref <git-ref>    EffectTS reference tag/commit
  --clone-craft-ts / --no-clone-craft-ts (legacy subtree aliases)
  --clone-effect-ts / --no-clone-effect-ts (legacy subtree aliases)
  --no-demos                  Generate a domain feature without demo pages
  --domain <name>             Feature name used by --no-demos (default: feature)
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
