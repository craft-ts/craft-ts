import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import {
  getProjects,
  logger,
  names,
  readProjectConfiguration,
  type GeneratorCallback,
  type ProjectConfiguration,
  type Tree,
} from '@nx/devkit';
import { Project } from 'ts-morph';
import { findAngularDecoratedClass } from '../../scripts/angular-brand-codemod.js';
import {
  captureRouteEslintBaseline,
  listRouteCollections,
  runRouteAdd,
  runRouteSplit,
  validateRouteChangedFiles,
  type RouteCommandResult,
  type RouteFileSystem,
} from '../../scripts/routes/route-command.js';
import type {
  RouteGeneratorSchema,
  RouteSplitGeneratorSchema,
} from './schema.js';

const execFileAsync = promisify(execFile);

export async function routeGenerator(
  tree: Tree,
  options: RouteGeneratorSchema,
): Promise<GeneratorCallback | void> {
  const selected = selectAngularProject(tree, options.project);
  const fileSystem = createTreeFileSystem(tree);
  const componentBase = join(
    selected.configuration.sourceRoot ??
      join(selected.configuration.root, 'src'),
    'app',
  );
  const parent = await resolveRouteParentOption(
    listRouteCollections(tree.root, selected.tsConfig, fileSystem),
    {
      configuredParent: options.parent,
      rootDir: tree.root,
      routePath: options.path,
    },
  );
  const target = await resolveRouteTargetOptions(options, { componentBase });
  const preview = await runRouteAdd({
    rootDir: tree.root,
    project: selected.tsConfig,
    path: options.path,
    parent,
    component: target.component,
    createComponent: target.createComponent?.name,
    featureFile: options.featureFile,
    redirectTo: target.redirectTo,
    dryRun: true,
    yes: true,
    validate: false,
    fileSystem,
    log: () => undefined,
  });
  assertSuccessful(preview);
  printGeneratorPlan(tree, preview, target.createComponent, componentBase);
  if (!(await confirmGeneratorPlan(options))) {
    logger.info('Cancelled. No files changed.');
    return;
  }

  let component = target.component;

  if (target.createComponent) {
    component = await generateComponent(
      tree,
      selected.name,
      selected.configuration,
      target.createComponent,
    );
  }

  const result = await runRouteAdd({
    rootDir: tree.root,
    project: selected.tsConfig,
    path: options.path,
    parent,
    component,
    featureFile: options.featureFile,
    redirectTo: target.redirectTo,
    yes: true,
    validate: false,
    fileSystem,
    log: () => undefined,
  });
  assertSuccessful(result);

  const eslintBaseline = options.skipValidation
    ? new Set<string>()
    : await captureRouteEslintBaseline(
        tree.root,
        resolve(tree.root, selected.configuration.root),
        result.changedFiles,
      );

  return options.skipValidation
    ? undefined
    : createValidationCallback(
        tree,
        selected,
        result.changedFiles,
        eslintBaseline,
      );
}

type ConfiguredRouteTargetOptions = Pick<
  RouteGeneratorSchema,
  'component' | 'createComponent' | 'redirectTo'
>;

type ComponentCreationTarget = {
  name: string;
  path: string;
};

type ResolvedRouteTargetOptions = {
  component?: string;
  createComponent?: ComponentCreationTarget;
  redirectTo?: string;
};

type RouteQuestion = (prompt: string) => Promise<string>;

type RouteParentOption = {
  collectionName: string;
  filePath: string;
  routesName: string;
};

export async function resolveRouteParentOption(
  parents: RouteParentOption[],
  interactive: {
    configuredParent?: string;
    rootDir: string;
    routePath: string;
    ask?: RouteQuestion;
  },
): Promise<string | undefined> {
  if (interactive.configuredParent) return interactive.configuredParent;
  if (parents.length === 0 || (!interactive.ask && !isInteractive())) {
    return undefined;
  }

  if (!interactive.ask) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      return await resolveRouteParentOption(parents, {
        ...interactive,
        ask: (prompt) => readline.question(prompt),
      });
    } finally {
      readline.close();
    }
  }

  const sortedParents = [...parents].sort((left, right) =>
    left.filePath.localeCompare(right.filePath),
  );
  logger.info(
    [
      'Available route parents:',
      `  0. Automatic selection from ${interactive.routePath}`,
      ...sortedParents.map((parent, index) => {
        const filePath = relative(interactive.rootDir, parent.filePath)
          .split(sep)
          .join('/');
        return `  ${index + 1}. ${parent.routesName} — ${filePath} (prefix: ${parent.collectionName})`;
      }),
    ].join('\n'),
  );

  let selection: number;
  do {
    const answer = (await interactive.ask('Parent number [0]: ')).trim();
    selection = answer === '' ? 0 : Number(answer);
  } while (
    !Number.isInteger(selection) ||
    selection < 0 ||
    selection > sortedParents.length
  );
  if (selection === 0) return undefined;

  const selected = sortedParents[selection - 1];
  const filePath = relative(interactive.rootDir, selected.filePath)
    .split(sep)
    .join('/');
  return `${filePath}#${selected.routesName}`;
}

export async function resolveRouteTargetOptions(
  options: ConfiguredRouteTargetOptions,
  interactive: {
    componentBase: string;
    ask?: RouteQuestion;
  },
): Promise<ResolvedRouteTargetOptions> {
  const configuredTargets = [
    ['component', options.component],
    ['createComponent', options.createComponent],
    ['redirectTo', options.redirectTo],
  ].filter(([, value]) => value !== undefined) as Array<
    [keyof ConfiguredRouteTargetOptions, string]
  >;

  if (configuredTargets.length > 1) {
    throw new Error(
      'Choose exactly one route target: --component, --create-component, or --redirect-to.',
    );
  }
  if (configuredTargets.length === 1) {
    const [name, value] = configuredTargets[0];
    if (name === 'createComponent') {
      return { createComponent: parseCreateComponentOption(value) };
    }
    return { [name]: value };
  }

  if (!interactive.ask) {
    if (!isInteractive()) {
      throw new Error(
        'A route target is required. Pass --component, --create-component, or --redirect-to.',
      );
    }
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      return await resolveRouteTargetOptions(options, {
        ...interactive,
        ask: (prompt) => readline.question(prompt),
      });
    } finally {
      readline.close();
    }
  }
  const ask = interactive.ask;

  let selection: string;
  do {
    selection = (
      await ask(
        'Target: [e]xisting component, [c]reate component, [r]edirect? ',
      )
    )
      .trim()
      .toLowerCase();
  } while (
    !['e', 'existing', 'c', 'create', 'r', 'redirect'].includes(selection)
  );

  if (selection === 'e' || selection === 'existing') {
    return {
      component: await askForRequiredValue(ask, 'Component file#Class: '),
    };
  }
  if (selection === 'c' || selection === 'create') {
    const path = await askForRequiredValue(
      ask,
      `Angular component path (relative to ${interactive.componentBase}): `,
    );
    return {
      createComponent: {
        path,
        name: await askForRequiredValue(ask, 'Angular component name: '),
      },
    };
  }
  return {
    redirectTo: await askForRequiredValue(ask, 'Redirect target: '),
  };
}

function isInteractive(): boolean {
  return (
    !!process.stdin.isTTY &&
    !!process.stdout.isTTY &&
    process.env['NX_INTERACTIVE'] !== 'false'
  );
}

function parseCreateComponentOption(value: string): ComponentCreationTarget {
  const name = basename(value);
  const parent = dirname(value);
  return {
    name,
    path: parent === '.' ? name : parent,
  };
}

async function askForRequiredValue(
  ask: RouteQuestion,
  prompt: string,
): Promise<string> {
  let value: string;
  do value = (await ask(prompt)).trim();
  while (!value);
  return value;
}

export async function routeSplitGenerator(
  tree: Tree,
  options: RouteSplitGeneratorSchema,
): Promise<GeneratorCallback | void> {
  const selected = selectAngularProject(tree, options.project);
  const result = await runRouteSplit({
    rootDir: tree.root,
    project: selected.tsConfig,
    parent: options.parent,
    prefix: options.prefix,
    target: options.target,
    yes: true,
    validate: false,
    fileSystem: createTreeFileSystem(tree),
    log: (message) => logger.info(message),
  });
  assertSuccessful(result);

  const eslintBaseline = options.skipValidation
    ? new Set<string>()
    : await captureRouteEslintBaseline(
        tree.root,
        resolve(tree.root, selected.configuration.root),
        result.changedFiles,
      );

  return options.skipValidation
    ? undefined
    : createValidationCallback(
        tree,
        selected,
        result.changedFiles,
        eslintBaseline,
      );
}

type SelectedProject = {
  configuration: ProjectConfiguration;
  name: string;
  tsConfig: string;
};

function selectAngularProject(
  tree: Tree,
  requestedProject: string | undefined,
): SelectedProject {
  const projects = getProjects(tree);
  let name = requestedProject;
  if (!name) {
    const applications = [...projects.entries()].filter(([, configuration]) =>
      findAngularApplicationTsConfig(tree, configuration),
    );
    if (applications.length !== 1) {
      throw new Error(
        'Choose a project with --project when the workspace does not contain exactly one Angular application.',
      );
    }
    name = applications[0][0];
  }

  const configuration = readProjectConfiguration(tree, name);
  const tsConfig = findAngularApplicationTsConfig(tree, configuration);
  if (!tsConfig) {
    throw new Error(`Project ${name} is not an Angular application.`);
  }
  return { configuration, name, tsConfig };
}

function findAngularApplicationTsConfig(
  tree: Tree,
  configuration: ProjectConfiguration,
): string | undefined {
  if (configuration.projectType !== 'application') return undefined;
  const configuredTsConfig =
    configuration.targets?.['build']?.options?.['tsConfig'];
  const fallbackTsConfig = join(configuration.root, 'tsconfig.app.json');
  const tsConfig =
    typeof configuredTsConfig === 'string'
      ? configuredTsConfig
      : fallbackTsConfig;
  return tree.exists(tsConfig) ? tsConfig : undefined;
}

function createTreeFileSystem(tree: Tree): RouteFileSystem {
  const toTreePath = (filePath: string): string => {
    const value = relative(tree.root, resolve(filePath));
    return value.split(sep).join('/');
  };
  return {
    exists: (filePath) => tree.exists(toTreePath(filePath)),
    listFiles: (rootDir) =>
      listTreeFiles(tree, toTreePath(rootDir)).map((filePath) =>
        resolve(tree.root, filePath),
      ),
    read: (filePath) => tree.read(toTreePath(filePath), 'utf8') ?? undefined,
    write: (filePath, content) => tree.write(toTreePath(filePath), content),
  };
}

function listTreeFiles(tree: Tree, root = ''): string[] {
  if (tree.isFile(root)) return [root];
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const child of tree.children(directory)) {
      if (['node_modules', 'dist', '.angular', '.git'].includes(child)) {
        continue;
      }
      const filePath = directory ? `${directory}/${child}` : child;
      if (tree.isFile(filePath)) result.push(filePath);
      else visit(filePath);
    }
  };
  visit(root === '.' ? '' : root);
  return result;
}

async function generateComponent(
  tree: Tree,
  projectName: string,
  project: ProjectConfiguration,
  target: ComponentCreationTarget,
): Promise<string> {
  const sourceRoot = project.sourceRoot ?? join(project.root, 'src');
  const componentBase = join(sourceRoot, 'app');
  const requestedPath = resolveComponentPath(project, componentBase, target);
  const filePath = requestedPath.endsWith('.ts')
    ? requestedPath
    : `${requestedPath}.ts`;
  const exportName = toComponentExportName(target.name);

  // Scaffolds a Craft SFC. This used to delegate to Angular's component
  // schematic and then read the class name back off the @Component decorator.
  tree.write(
    filePath,
    `import { craftComponent } from '@craft-ng/component';
import { p } from '@craft-ng/component';

export const ${exportName} = craftComponent(
  '${target.name}',
  {},
  () => ({}),
  () => p('${target.name} works'),
);

export default ${exportName};
`,
  );

  return `${filePath}#${exportName}`;
}

function toComponentExportName(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function resolveComponentPath(
  project: ProjectConfiguration,
  componentBase: string,
  target: ComponentCreationTarget,
): string {
  const path = target.path === '.' ? '' : target.path;
  const directory = path.startsWith(project.root)
    ? path
    : join(componentBase, path);
  return join(directory, names(target.name).fileName);
}

function printGeneratorPlan(
  tree: Tree,
  result: RouteCommandResult,
  component: ComponentCreationTarget | undefined,
  componentBase: string,
): void {
  const lines = ['Planned changes (dry view):'];
  if (component) {
    const requestedPath = join(
      componentBase,
      component.path === '.' ? '' : component.path,
      names(component.name).fileName,
    );
    lines.push(
      `  CREATE ${requestedPath}.ts (inline template and styles; filename normalized by Angular)`,
    );
  }
  for (const filePath of result.plan?.files ?? []) {
    const treePath = relative(tree.root, filePath).split(sep).join('/');
    lines.push(`  ${tree.exists(treePath) ? 'UPDATE' : 'CREATE'} ${treePath}`);
  }
  logger.info(lines.join('\n'));
}

async function confirmGeneratorPlan(
  options: RouteGeneratorSchema,
): Promise<boolean> {
  if (options.yes || process.env['NX_DRY_RUN'] === 'true') return true;
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    process.env['NX_INTERACTIVE'] === 'false'
  ) {
    throw new Error(
      'Confirmation is required. Re-run interactively or pass --yes.',
    );
  }
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await readline.question('Apply this plan? [y/N] '))
      .trim()
      .toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    readline.close();
  }
}

function assertSuccessful(result: RouteCommandResult): void {
  if (result.exitCode === 0) return;
  throw new Error(
    result.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('\n'),
  );
}

function createValidationCallback(
  tree: Tree,
  project: SelectedProject,
  changedFiles: string[],
  eslintBaseline: Set<string>,
): GeneratorCallback {
  const root = tree.root;
  const hasNx = tree.exists('nx.json');
  const buildConfiguration = project.configuration.targets?.['build']
    ?.configurations?.['development']
    ? 'development'
    : undefined;
  return async () => {
    const validationDiagnostics = await validateRouteChangedFiles(
      root,
      resolve(root, project.configuration.root),
      resolve(root, project.tsConfig),
      changedFiles,
      eslintBaseline,
      { skipTypeCheck: true },
    );
    if (validationDiagnostics.length > 0) {
      throw new Error(
        validationDiagnostics
          .map((diagnostic) => diagnostic.message)
          .join('\n'),
      );
    }
    const runner = findLocalBinary(root, hasNx ? 'nx' : 'ng');
    if (!runner) {
      throw new Error(
        `Could not find the local ${hasNx ? 'Nx' : 'Angular'} CLI.`,
      );
    }
    const args = hasNx
      ? [
          'run',
          `${project.name}:build`,
          ...(buildConfiguration
            ? [`--configuration=${buildConfiguration}`]
            : []),
        ]
      : [
          'build',
          project.name,
          ...(buildConfiguration
            ? [`--configuration=${buildConfiguration}`]
            : []),
        ];
    await execFileAsync(runner, args, {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
    });
  };
}

function findLocalBinary(rootDir: string, name: string): string | undefined {
  let current = rootDir;
  while (true) {
    const candidate = join(current, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) return undefined;
    current = parent;
  }
}

export default routeGenerator;
