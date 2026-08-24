import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { promisify } from 'node:util';
import { names } from '@nx/devkit';
import {
  ArrayLiteralExpression,
  CallExpression,
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  ts,
} from 'ts-morph';
import {
  findAngularDecoratedClass,
  transformSourceFile as generateAngularDependencies,
} from '../angular-brand-codemod.js';

const execFileAsync = promisify(execFile);

const nodeRouteFileSystem: RouteFileSystem = {
  exists: existsSync,
  listFiles: listFilesOnDisk,
  read: (filePath) =>
    existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined,
  write: async (filePath, content) => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  },
};

export type RouteCommandDiagnostic = {
  code:
    | 'AMBIGUOUS_PARENT'
    | 'COMPONENT_GENERATION_FAILED'
    | 'COMPONENT_NOT_FOUND'
    | 'DUPLICATE_ROUTE'
    | 'INVALID_ARGUMENT'
    | 'LOCAL_DEPENDENCY'
    | 'NO_ANGULAR_CLI'
    | 'NO_MATCHING_ROUTES'
    | 'PARENT_NOT_FOUND'
    | 'TARGET_EXISTS'
    | 'VALIDATION_FAILED';
  message: string;
  filePath?: string;
  routePath?: string;
};

export type RouteCommandPlan = {
  action: 'add' | 'split';
  summary: string;
  files: string[];
};

export type RouteCommandResult = {
  changedFiles: string[];
  diagnostics: RouteCommandDiagnostic[];
  exitCode: number;
  plan?: RouteCommandPlan;
};

export type RouteFileSystem = {
  exists(filePath: string): boolean;
  listFiles(rootDir: string): string[];
  read(filePath: string): string | undefined;
  write(filePath: string, content: string): Promise<void> | void;
};

export type RouteAddOptions = {
  rootDir?: string;
  project?: string;
  path: string;
  parent?: string;
  component?: string;
  createComponent?: string;
  featureFile?: string;
  redirectTo?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  validate?: boolean;
  fileSystem?: RouteFileSystem;
  log?: (message: string) => void;
  confirm?: (plan: RouteCommandPlan) => Promise<boolean>;
};

export type RouteSplitOptions = {
  rootDir?: string;
  project?: string;
  parent: string;
  prefix: string;
  target: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
  validate?: boolean;
  fileSystem?: RouteFileSystem;
  log?: (message: string) => void;
  confirm?: (plan: RouteCommandPlan) => Promise<boolean>;
};

export type RouteCollection = {
  collectionName: string;
  routesName: string;
  sourceFile: SourceFile;
  call: CallExpression;
  routes: ArrayLiteralExpression;
};

type ComponentTarget = {
  filePath: string;
  className: string;
};

export async function runRouteAdd(
  options: RouteAddOptions,
): Promise<RouteCommandResult> {
  const diagnostics: RouteCommandDiagnostic[] = [];
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const fileSystem = options.fileSystem ?? nodeRouteFileSystem;
  const routePath = normalizeRoutePath(options.path);
  if (!routePath || routePath === '/') {
    return failed(
      'INVALID_ARGUMENT',
      'Route path must contain at least one segment.',
    );
  }
  const actionCount = [
    options.component,
    options.createComponent,
    options.redirectTo,
  ].filter(Boolean).length;
  if (actionCount !== 1) {
    return failed(
      'INVALID_ARGUMENT',
      'Choose exactly one of --component, --create-component, or --redirect-to.',
    );
  }

  const { project, tsConfigFilePath, sourceRoot } = createRouteProject(
    rootDir,
    options.project,
    fileSystem,
  );
  const initialTexts = snapshotProject(project);
  const collections = discoverRouteCollections(project, sourceRoot);
  const parent = resolveParentCollection(
    collections,
    options.parent,
    routePath,
    rootDir,
  );
  if ('diagnostic' in parent) return resultFromDiagnostics([parent.diagnostic]);

  const segments = routePath.slice(1).split('/');
  const featureDecision = decideFeatureTarget(
    project,
    collections,
    parent.collection,
    options,
    segments,
    rootDir,
  );
  const targetFilePath = featureDecision.targetFilePath;
  const touched = new Set<string>([targetFilePath]);
  if (featureDecision.parentMount)
    touched.add(parent.collection.sourceFile.getFilePath());

  let componentTarget: ComponentTarget | undefined;
  if (options.component) {
    componentTarget = parseComponentTarget(options.component, rootDir);
    if (!componentTarget || !fileSystem.exists(componentTarget.filePath)) {
      return failed(
        'COMPONENT_NOT_FOUND',
        `Component target does not exist: ${options.component}`,
      );
    }
    touched.add(componentTarget.filePath);
  }

  const plan: RouteCommandPlan = {
    action: 'add',
    summary: options.redirectTo
      ? `Add redirect ${routePath} -> ${options.redirectTo}`
      : `Add component route ${routePath}`,
    files: [...touched],
  };
  printPlan(plan, options.log ?? console.log, options.json === true);
  if (!(await shouldContinue(options, plan))) {
    return { changedFiles: [], diagnostics, exitCode: 0, plan };
  }
  if (options.dryRun) {
    return { changedFiles: [], diagnostics, exitCode: 0, plan };
  }

  const eslintBaseline =
    options.validate === false
      ? new Set<string>()
      : await captureRouteEslintBaseline(rootDir, sourceRoot, plan.files);

  if (options.createComponent) {
    const created = await createAngularComponent(
      rootDir,
      options,
      resolveAngularProjectName(rootDir, options.project, sourceRoot),
    );
    if ('diagnostic' in created)
      return resultFromDiagnostics([created.diagnostic], plan);
    componentTarget = created.component;
    touched.add(componentTarget.filePath);
    addSourceFileFromWorkspace(project, componentTarget.filePath, fileSystem);
  }

  const targetCollection = ensureFeatureCollection(
    project,
    featureDecision,
    parent.collection,
  );
  if (hasRoutePath(targetCollection.routes, featureDecision.localRoutePath)) {
    if (
      routeMatchesRequest(
        targetCollection.routes,
        featureDecision.localRoutePath,
        options,
        componentTarget,
        targetCollection.sourceFile.getFilePath(),
      )
    ) {
      return { changedFiles: [], diagnostics: [], exitCode: 0, plan };
    }
    return resultFromDiagnostics(
      [
        {
          code: 'DUPLICATE_ROUTE',
          message: `Route ${featureDecision.localRoutePath || '<root>'} already exists in ${targetCollection.routesName}.`,
          filePath: targetCollection.sourceFile.getFilePath(),
          routePath,
        },
      ],
      plan,
    );
  }

  if (options.redirectTo) {
    targetCollection.routes.addElement(
      `{ path: ${quote(featureDecision.localRoutePath)}, redirectTo: ${quote(
        options.redirectTo,
      )}, pathMatch: 'full' }`,
    );
  } else if (componentTarget) {
    const componentSource =
      project.getSourceFile(componentTarget.filePath) ??
      addSourceFileFromWorkspace(project, componentTarget.filePath, fileSystem);
    if (!componentSource) {
      return failed(
        'COMPONENT_NOT_FOUND',
        `Could not read ${componentTarget.filePath}.`,
        plan,
      );
    }
    const hasGenDeps = ensureGenDeps(componentSource, componentTarget.className);
    const moduleSpecifier = relativeModuleSpecifier(
      targetCollection.sourceFile.getFilePath(),
      componentTarget.filePath,
    );
    targetCollection.routes.addElement(
      `craftRoute(${quote(featureDecision.localRoutePath)}, {${
        hasGenDeps
          ? `
        componentDeps: {} as import(${quote(moduleSpecifier)}).GenDeps_${componentTarget.className},`
          : ''
      }
        loadComponent: ({ withRetry }: CraftRouteLazyLoadHelpers) => withRetry(import(${quote(
          moduleSpecifier,
        )})).then((m) => m.${componentTarget.className}),
      })`,
    );
    ensureImport(targetCollection.sourceFile, 'craftRoute');
    ensureTypeImport(targetCollection.sourceFile, 'CraftRouteLazyLoadHelpers');
  }

  ensureCollectionBookkeeping(targetCollection);
  if (featureDecision.parentMount) {
    ensureParentMount(
      parent.collection,
      featureDecision.parentMount,
      targetCollection,
    );
    ensureCollectionBookkeeping(parent.collection);
  }
  for (const file of new Set([
    targetCollection.sourceFile,
    parent.collection.sourceFile,
  ])) {
    file.formatText();
  }

  const changedFiles = [...touched].filter((filePath) =>
    sourceChanged(project, initialTexts, filePath),
  );
  await saveFiles(project, changedFiles, fileSystem);
  if (options.validate !== false) {
    diagnostics.push(
      ...(await validateRouteChangedFiles(
        rootDir,
        sourceRoot,
        tsConfigFilePath,
        changedFiles,
        eslintBaseline,
      )),
    );
  }
  return {
    changedFiles,
    diagnostics,
    exitCode: diagnostics.length > 0 ? 1 : 0,
    plan,
  };
}

export async function runRouteSplit(
  options: RouteSplitOptions,
): Promise<RouteCommandResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const fileSystem = options.fileSystem ?? nodeRouteFileSystem;
  const { project, tsConfigFilePath, sourceRoot } = createRouteProject(
    rootDir,
    options.project,
    fileSystem,
  );
  const initialTexts = snapshotProject(project);
  const collections = discoverRouteCollections(project, sourceRoot);
  const parent = resolveParentCollection(
    collections,
    options.parent,
    `/${options.prefix}`,
    rootDir,
  );
  if ('diagnostic' in parent) return resultFromDiagnostics([parent.diagnostic]);

  const prefix = normalizeRoutePath(options.prefix).slice(1);
  const targetFilePath = resolveFromRoot(options.target, rootDir);
  if (fileSystem.exists(targetFilePath)) {
    return failed(
      'TARGET_EXISTS',
      `Split target already exists: ${targetFilePath}`,
    );
  }
  const matches = parent.collection.routes.getElements().filter((element) => {
    const path = readRoutePath(element);
    return path === prefix || path?.startsWith(`${prefix}/`);
  });
  if (matches.length === 0) {
    return failed(
      'NO_MATCHING_ROUTES',
      `No statically analyzable route starts with ${prefix} in ${parent.collection.routesName}.`,
    );
  }
  const localDependencies = findLocalDependencies(
    parent.collection.sourceFile,
    matches,
  );
  if (localDependencies.length > 0) {
    return resultFromDiagnostics(
      localDependencies.map((name) => ({
        code: 'LOCAL_DEPENDENCY',
        message: `Cannot move routes using local declaration ${name}; extract or import it first.`,
        filePath: parent.collection.sourceFile.getFilePath(),
      })),
    );
  }

  const collectionName = collectionNameFromFile(targetFilePath);
  const helperRenames = deriveMovedHelperRenames(
    parent.collection,
    matches,
    prefix,
    collectionName,
  );
  const helperConsumers = findHelperConsumers(
    project,
    parent.collection.sourceFile,
    helperRenames,
  );

  const plan: RouteCommandPlan = {
    action: 'split',
    summary: `Move ${matches.length} route(s) under ${prefix} to ${targetFilePath}`,
    files: [
      parent.collection.sourceFile.getFilePath(),
      targetFilePath,
      ...helperConsumers.map((sourceFile) => sourceFile.getFilePath()),
    ],
  };
  printPlan(plan, options.log ?? console.log, options.json === true);
  if (!(await shouldContinue(options, plan))) {
    return { changedFiles: [], diagnostics: [], exitCode: 0, plan };
  }
  if (options.dryRun) {
    return { changedFiles: [], diagnostics: [], exitCode: 0, plan };
  }

  const eslintBaseline =
    options.validate === false
      ? new Set<string>()
      : await captureRouteEslintBaseline(rootDir, sourceRoot, plan.files);

  const routesName = `${uncapitalize(toPascalCase(collectionName))}Routes`;
  const movedText = matches.map((element) =>
    rewriteMovedRouteText(element.getText(), prefix),
  );
  const imports = parent.collection.sourceFile
    .getImportDeclarations()
    .map((declaration) => declaration.getText())
    .join('\n');
  const context = readCascadeContext(parent.collection);
  const target = project.createSourceFile(
    targetFilePath,
    `${imports}\n\nexport const { ${routesName} } = craftRoutes(${quote(collectionName)}, [\n${movedText
      .map((text) => `  ${text}`)
      .join(',\n')}\n]).withParent<ParentRoutes<${quote(prefix)}>>();\n\n` +
      `assertExhaustiveRouteExceptions(${routesName});\n\n` +
      `type _Check${toPascalCase(collectionName)}DI = ValidateCascadeRoutesFile<${
        context.names
      }, ${context.values}, typeof ${routesName}>;\n` +
      `type _CanRun${toPascalCase(collectionName)} = CanRun<_Check${toPascalCase(
        collectionName,
      )}DI>;\n`,
    { overwrite: false },
  );
  rewriteRelativeSpecifiers(target, parent.collection.sourceFile.getFilePath());
  ensureImport(target, 'craftRoutes');
  ensureImport(target, 'assertExhaustiveRouteExceptions');
  ensureTypeImport(target, 'ParentRoutes');
  ensureTypeImport(target, 'ValidateCascadeRoutesFile');
  ensureTypeImport(target, 'CanRun');
  ensureTypeImport(target, 'Router', '@angular/router');
  rewireMovedHelpers(project, parent.collection, target, helperRenames);

  const insertionIndex = Math.min(
    ...matches.map((element) =>
      parent.collection.routes.getElements().indexOf(element),
    ),
  );
  const matchedIndexes = matches
    .map((element) => parent.collection.routes.getElements().indexOf(element))
    .sort((a, b) => b - a);
  for (const index of matchedIndexes)
    parent.collection.routes.removeElement(index);
  const moduleSpecifier = relativeModuleSpecifier(
    parent.collection.sourceFile.getFilePath(),
    targetFilePath,
  );
  parent.collection.routes.insertElement(
    insertionIndex,
    `{ path: ${quote(prefix)}, loadChildren: ({ withRetry }) => withRetry(import(${quote(
      moduleSpecifier,
    )})).then((m) => m.${routesName}) }`,
  );
  ensureCollectionBookkeeping(parent.collection);
  target.organizeImports();
  target.formatText();
  parent.collection.sourceFile.formatText();

  const changedFiles = [...new Set(plan.files)].filter((filePath) =>
    sourceChanged(project, initialTexts, filePath),
  );
  await saveFiles(project, changedFiles, fileSystem);
  const diagnostics =
    options.validate === false
      ? []
      : await validateRouteChangedFiles(
          rootDir,
          sourceRoot,
          tsConfigFilePath,
          changedFiles,
          eslintBaseline,
        );
  return {
    changedFiles,
    diagnostics,
    exitCode: diagnostics.length > 0 ? 1 : 0,
    plan,
  };
}

export function discoverRouteCollections(
  project: Project,
  rootDir = process.cwd(),
): RouteCollection[] {
  const result: RouteCollection[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (
      !isInside(sourceFile.getFilePath(), rootDir) ||
      sourceFile.isDeclarationFile() ||
      /\.(?:spec|test)\.ts$/.test(sourceFile.getFilePath())
    )
      continue;
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getText() !== 'craftRoutes') continue;
      const routes = call.getArguments()[1];
      const nameArg = call.getArguments()[0];
      if (
        !Node.isArrayLiteralExpression(routes) ||
        !Node.isStringLiteral(nameArg)
      )
        continue;
      const declaration = call.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      if (declaration?.getVariableStatement()?.getParent() !== sourceFile)
        continue;
      const binding = declaration?.getNameNode();
      if (!binding || !Node.isObjectBindingPattern(binding)) continue;
      const expected = `${uncapitalize(toPascalCase(nameArg.getLiteralValue()))}Routes`;
      const routeBinding =
        binding
          .getElements()
          .find(
            (element) =>
              (element.getPropertyNameNode()?.getText() ??
                element.getName()) === expected,
          ) ??
        binding
          .getElements()
          .filter((element) =>
            (
              element.getPropertyNameNode()?.getText() ?? element.getName()
            ).endsWith('Routes'),
          )[0];
      if (!routeBinding) continue;
      result.push({
        collectionName: nameArg.getLiteralValue(),
        routesName: routeBinding.getName(),
        sourceFile,
        call,
        routes,
      });
    }
  }
  return result;
}

export function listRouteCollections(
  rootDir = process.cwd(),
  projectOption?: string,
  fileSystem: RouteFileSystem = nodeRouteFileSystem,
): Array<{ filePath: string; collectionName: string; routesName: string }> {
  const absoluteRoot = resolve(rootDir);
  const { project, sourceRoot } = createRouteProject(
    absoluteRoot,
    projectOption,
    fileSystem,
  );
  return discoverRouteCollections(project, sourceRoot).map((collection) => ({
    filePath: collection.sourceFile.getFilePath(),
    collectionName: collection.collectionName,
    routesName: collection.routesName,
  }));
}

export function listAngularProjects(rootDir = process.cwd()): string[] {
  const absoluteRoot = resolve(rootDir);
  return findTsConfigApps(absoluteRoot, nodeRouteFileSystem).map((filePath) =>
    relative(absoluteRoot, dirname(filePath)).replace(/\\/g, '/'),
  );
}

function createRouteProject(
  rootDir: string,
  projectOption: string | undefined,
  fileSystem: RouteFileSystem,
) {
  const tsConfigFilePath = resolveTsConfig(rootDir, projectOption, fileSystem);
  const sourceRoot =
    basename(tsConfigFilePath) === 'tsconfig.app.json'
      ? dirname(tsConfigFilePath)
      : rootDir;
  const project =
    fileSystem === nodeRouteFileSystem && fileSystem.exists(tsConfigFilePath)
      ? new Project({ tsConfigFilePath })
      : new Project({
          compilerOptions: {
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            target: ts.ScriptTarget.ES2022,
          },
        });
  if (fileSystem === nodeRouteFileSystem) {
    project.addSourceFilesAtPaths([
      join(sourceRoot, '**/*.ts'),
      `!${join(sourceRoot, '**/node_modules/**')}`,
      `!${join(sourceRoot, '**/dist/**')}`,
      `!${join(sourceRoot, '**/.angular/**')}`,
    ]);
  } else {
    for (const filePath of fileSystem
      .listFiles(sourceRoot)
      .filter((filePath) => filePath.endsWith('.ts'))) {
      const text = fileSystem.read(filePath);
      if (text !== undefined) {
        project.createSourceFile(filePath, text, { overwrite: true });
      }
    }
  }
  project.manipulationSettings.set({ quoteKind: QuoteKind.Single });
  return { project, tsConfigFilePath, sourceRoot };
}

function resolveTsConfig(
  rootDir: string,
  projectOption: string | undefined,
  fileSystem: RouteFileSystem,
): string {
  if (projectOption) {
    const direct = resolve(rootDir, projectOption);
    if (fileSystem.exists(direct) && direct.endsWith('.json')) return direct;
    for (const candidate of [
      join(direct, 'tsconfig.app.json'),
      join(rootDir, 'apps', projectOption, 'tsconfig.app.json'),
      join(rootDir, 'projects', projectOption, 'tsconfig.app.json'),
    ]) {
      if (fileSystem.exists(candidate)) return candidate;
    }
  }
  const detected = findTsConfigApps(rootDir, fileSystem);
  if (detected.length === 1) return detected[0];
  for (const candidate of [
    join(rootDir, 'tsconfig.app.json'),
    join(rootDir, 'tsconfig.json'),
  ]) {
    if (fileSystem.exists(candidate)) return candidate;
  }
  return join(rootDir, 'tsconfig.json');
}

function findTsConfigApps(
  rootDir: string,
  fileSystem: RouteFileSystem,
): string[] {
  return fileSystem
    .listFiles(rootDir)
    .filter((filePath) => basename(filePath) === 'tsconfig.app.json')
    .sort();
}

function resolveParentCollection(
  collections: RouteCollection[],
  parentOption: string | undefined,
  routePath: string,
  rootDir: string,
): { collection: RouteCollection } | { diagnostic: RouteCommandDiagnostic } {
  if (parentOption) {
    const [filePart, collectionPart] = parentOption.split('#');
    const filePath = resolveFromRoot(filePart, rootDir);
    const matches = collections.filter(
      (collection) =>
        resolve(collection.sourceFile.getFilePath()) === resolve(filePath) &&
        (!collectionPart ||
          collection.routesName === collectionPart ||
          collection.collectionName === collectionPart),
    );
    if (matches.length === 1) return { collection: matches[0] };
    return {
      diagnostic: {
        code: 'PARENT_NOT_FOUND',
        message: `Cannot resolve parent collection ${parentOption}.`,
        filePath,
      },
    };
  }

  const first = routePath.slice(1).split('/')[0];
  const featureMatches = collections.filter((collection) =>
    [
      collection.collectionName,
      basename(collection.sourceFile.getFilePath(), '.routes.ts'),
    ]
      .map((value) => value.toLowerCase())
      .includes(first.toLowerCase()),
  );
  if (featureMatches.length === 1) return { collection: featureMatches[0] };
  const roots = collections.filter((collection) =>
    /(?:^|[/\\])app\.routes\.ts$/.test(collection.sourceFile.getFilePath()),
  );
  if (roots.length === 1) return { collection: roots[0] };
  if (collections.length === 1) return { collection: collections[0] };
  return {
    diagnostic: {
      code: 'AMBIGUOUS_PARENT',
      message: `Found ${collections.length} craftRoutes collections; pass --parent <file#collection>.`,
    },
  };
}

function decideFeatureTarget(
  project: Project,
  collections: RouteCollection[],
  parent: RouteCollection,
  options: RouteAddOptions,
  segments: string[],
  rootDir: string,
) {
  if (options.featureFile) {
    return {
      targetFilePath: resolveFromRoot(options.featureFile, rootDir),
      localRoutePath: segments.slice(1).join('/'),
      parentMount: segments[0],
      collectionName: collectionNameFromFile(options.featureFile),
    };
  }
  if (options.redirectTo) {
    const parentIsFeature =
      parent.collectionName.toLowerCase() === segments[0].toLowerCase();
    return {
      targetFilePath: parent.sourceFile.getFilePath(),
      localRoutePath: parentIsFeature
        ? segments.slice(1).join('/')
        : segments.join('/'),
      collectionName: parent.collectionName,
    };
  }
  if (options.parent) {
    return {
      targetFilePath: parent.sourceFile.getFilePath(),
      localRoutePath: segments.join('/'),
      collectionName: parent.collectionName,
    };
  }
  if (parent.collectionName.toLowerCase() === segments[0].toLowerCase()) {
    return {
      targetFilePath: parent.sourceFile.getFilePath(),
      localRoutePath: segments.slice(1).join('/'),
      collectionName: parent.collectionName,
    };
  }
  const existingFeature = collections.find(
    (collection) =>
      collection !== parent &&
      collection.collectionName.toLowerCase() === segments[0].toLowerCase(),
  );
  if (existingFeature) {
    return {
      targetFilePath: existingFeature.sourceFile.getFilePath(),
      localRoutePath: segments.slice(1).join('/'),
      collectionName: existingFeature.collectionName,
    };
  }
  const targetFilePath = join(
    dirname(parent.sourceFile.getFilePath()),
    segments[0],
    `${segments[0]}.routes.ts`,
  );
  return {
    targetFilePath,
    localRoutePath: segments.slice(1).join('/'),
    parentMount: segments[0],
    collectionName: segments[0],
  };
}

function ensureFeatureCollection(
  project: Project,
  decision: ReturnType<typeof decideFeatureTarget>,
  parent: RouteCollection,
): RouteCollection {
  const existing = discoverRouteCollections(
    project,
    dirname(decision.targetFilePath),
  ).find(
    (collection) =>
      resolve(collection.sourceFile.getFilePath()) ===
      resolve(decision.targetFilePath),
  );
  if (existing) return existing;
  const routesName = `${uncapitalize(toPascalCase(decision.collectionName))}Routes`;
  const context = readCascadeContext(parent);
  const parentSuffix = decision.parentMount
    ? `.withParent<ParentRoutes<${quote(decision.parentMount)}>>()`
    : '';
  const sourceFile = project.createSourceFile(
    decision.targetFilePath,
    `import { assertExhaustiveRouteExceptions, craftRoutes, type CanRun, type ParentRoutes, type ValidateCascadeRoutesFile } from '@craft-ts/core';\n` +
      `import type { Router } from '@angular/router';\n\n` +
      `export const { ${routesName} } = craftRoutes(${quote(
        decision.collectionName,
      )}, [])${parentSuffix};\n\n` +
      `assertExhaustiveRouteExceptions(${routesName});\n\n` +
      `type _Check${toPascalCase(
        decision.collectionName,
      )}DI = ValidateCascadeRoutesFile<${context.names}, ${context.values}, typeof ${routesName}>;\n` +
      `type _CanRun${toPascalCase(decision.collectionName)} = CanRun<_Check${toPascalCase(
        decision.collectionName,
      )}DI>;\n`,
    { overwrite: false },
  );
  const created = discoverRouteCollections(
    project,
    dirname(decision.targetFilePath),
  ).find((collection) => collection.sourceFile === sourceFile);
  if (!created)
    throw new Error(`Could not create route collection ${routesName}.`);
  return created;
}

function ensureParentMount(
  parent: RouteCollection,
  mountPath: string,
  child: RouteCollection,
): void {
  const alreadyMounted = parent.routes
    .getElements()
    .some(
      (element) =>
        readRoutePath(element) === mountPath &&
        element.getText().includes('loadChildren'),
    );
  if (!alreadyMounted) {
    const moduleSpecifier = relativeModuleSpecifier(
      parent.sourceFile.getFilePath(),
      child.sourceFile.getFilePath(),
    );
    parent.routes.addElement(
      `{ path: ${quote(mountPath)}, loadChildren: ({ withRetry }) => withRetry(import(${quote(
        moduleSpecifier,
      )})).then((m) => m.${child.routesName}) }`,
    );
  }
  ensureImport(parent.sourceFile, 'assertChildRouteMounts');
  if (
    !hasCall(parent.sourceFile, 'assertChildRouteMounts', parent.routesName)
  ) {
    parent.sourceFile.addStatements(
      `assertChildRouteMounts(${parent.routesName});`,
    );
  }
}

function ensureCollectionBookkeeping(collection: RouteCollection): void {
  ensureImport(collection.sourceFile, 'assertExhaustiveRouteExceptions');
  if (
    !hasCall(
      collection.sourceFile,
      'assertExhaustiveRouteExceptions',
      collection.routesName,
    )
  ) {
    collection.sourceFile.addStatements(
      `assertExhaustiveRouteExceptions(${collection.routesName});`,
    );
  }
  if (!hasCascadeCheck(collection)) {
    ensureTypeImport(collection.sourceFile, 'ValidateCascadeRoutesFile');
    ensureTypeImport(collection.sourceFile, 'CanRun');
    ensureTypeImport(collection.sourceFile, 'Router', '@angular/router');
    const suffix = toPascalCase(collection.collectionName);
    collection.sourceFile.addStatements(
      `type _Check${suffix}DI = ValidateCascadeRoutesFile<never, Router, typeof ${collection.routesName}>;\ntype _CanRun${suffix} = CanRun<_Check${suffix}DI>;`,
    );
  }
}

function hasCascadeCheck(collection: RouteCollection): boolean {
  return collection.sourceFile.getTypeAliases().some((alias) => {
    const type = alias.getTypeNode();
    return (
      Node.isTypeReference(type) &&
      type.getTypeName().getText() === 'ValidateCascadeRoutesFile' &&
      type.getTypeArguments()[2]?.getText() ===
        `typeof ${collection.routesName}`
    );
  });
}

function readCascadeContext(collection: RouteCollection): {
  names: string;
  values: string;
} {
  for (const alias of collection.sourceFile.getTypeAliases()) {
    const type = alias.getTypeNode();
    if (!Node.isTypeReference(type)) continue;
    if (type.getTypeName().getText() !== 'ValidateCascadeRoutesFile') continue;
    const args = type.getTypeArguments();
    if (args[2]?.getText() !== `typeof ${collection.routesName}`) continue;
    return {
      names: args[0]?.getText() ?? 'never',
      values: args[1]?.getText() ?? 'Router',
    };
  }
  return { names: 'never', values: 'Router' };
}

function parseComponentTarget(
  value: string,
  rootDir: string,
): ComponentTarget | undefined {
  const separator = value.lastIndexOf('#');
  if (separator <= 0 || separator === value.length - 1) return undefined;
  return {
    filePath: resolveFromRoot(value.slice(0, separator), rootDir),
    className: value.slice(separator + 1),
  };
}

async function createAngularComponent(
  rootDir: string,
  options: RouteAddOptions,
  projectName: string | undefined,
): Promise<
  { component: ComponentTarget } | { diagnostic: RouteCommandDiagnostic }
> {
  const angularBinary = findLocalBinary(rootDir, 'ng');
  const nxBinary = findLocalBinary(rootDir, 'nx');
  const angularWorkspace = existsSync(join(rootDir, 'angular.json'));
  const nxWorkspace = existsSync(join(rootDir, 'nx.json'));
  const runner =
    angularWorkspace && angularBinary
      ? {
          binary: angularBinary,
          args: (name: string) => [
            'generate',
            'component',
            name,
            '--inline-template',
            '--inline-style',
            '--skip-tests',
            ...(projectName ? ['--project', projectName] : []),
          ],
        }
      : nxWorkspace && nxBinary
        ? {
            binary: nxBinary,
            args: (name: string) => [
              'generate',
              '@schematics/angular:component',
              name,
              '--inline-template',
              '--inline-style',
              ...(projectName ? ['--project', projectName] : []),
              '--skip-tests',
            ],
          }
        : undefined;
  if (!runner) {
    return {
      diagnostic: {
        code: 'NO_ANGULAR_CLI',
        message:
          'No compatible local Angular or Nx CLI workspace was found. Expected angular.json + node_modules/.bin/ng, or nx.json + node_modules/.bin/nx.',
      },
    };
  }
  const name = options.createComponent;
  if (!name)
    throw new Error('createAngularComponent requires createComponent.');
  const expectedFileName = `${names(basename(name)).fileName}.ts`;
  const filesBefore = new Set(await findFiles(rootDir, expectedFileName));
  try {
    await execFileAsync(runner.binary, runner.args(name), { cwd: rootDir });
  } catch (error) {
    return {
      diagnostic: {
        code: 'COMPONENT_GENERATION_FAILED',
        message: `Component generation failed through ${basename(runner.binary)}: ${commandError(error)}`,
      },
    };
  }
  const candidates = (await findFiles(rootDir, expectedFileName)).sort(
    (left, right) =>
      Number(filesBefore.has(left)) - Number(filesBefore.has(right)),
  );
  const filePath = candidates
    .filter((candidate) => !candidate.endsWith('.spec.ts'))
    .sort((a, b) => b.length - a.length)[0];
  if (!filePath) {
    return {
      diagnostic: {
        code: 'COMPONENT_NOT_FOUND',
        message: `Component generation completed but ${basename(name)}.ts could not be located.`,
      },
    };
  }
  const source = new Project().addSourceFileAtPath(filePath);
  const decorated = findAngularDecoratedClass(source);
  const exportedName =
    decorated.className ??
    source
      .getVariableDeclarations()
      .find((declaration) => declaration.isExported())
      ?.getName();
  if (!exportedName) {
    return {
      diagnostic: {
        code: 'COMPONENT_NOT_FOUND',
        message: `Generated component could not be inferred in ${filePath}.`,
      },
    };
  }
  return { component: { filePath, className: exportedName } };
}

function resolveAngularProjectName(
  rootDir: string,
  projectOption: string | undefined,
  sourceRoot: string,
): string | undefined {
  const projectFile = join(sourceRoot, 'project.json');
  if (existsSync(projectFile)) {
    try {
      const parsed = JSON.parse(readFileSync(projectFile, 'utf8')) as {
        name?: unknown;
      };
      if (typeof parsed.name === 'string' && parsed.name) return parsed.name;
    } catch {
      // Fall through to the explicit option/basename heuristic.
    }
  }
  if (
    projectOption &&
    !projectOption.endsWith('.json') &&
    !projectOption.includes('/') &&
    !projectOption.includes('\\')
  ) {
    return projectOption;
  }
  const relativeSourceRoot = relative(rootDir, sourceRoot);
  return relativeSourceRoot && !relativeSourceRoot.startsWith('..')
    ? basename(sourceRoot)
    : undefined;
}

/**
 * Craft SFCs infer their contract from the component itself, so a missing
 * GenDeps alias is not an error: the route simply omits `componentDeps`.
 */
function ensureGenDeps(sourceFile: SourceFile, className: string): boolean {
  // Already declared (hand-written, or branded by a previous run).
  if (sourceFile.getTypeAlias(`GenDeps_${className}`)) return true;
  // Only an Angular-decorated class can have one generated for it; a Craft SFC
  // carries its contract itself, so the route just omits `componentDeps`.
  if (!findAngularDecoratedClass(sourceFile).className) return false;
  generateAngularDependencies(sourceFile);
  return Boolean(sourceFile.getTypeAlias(`GenDeps_${className}`));
}

function hasRoutePath(routes: ArrayLiteralExpression, path: string): boolean {
  return routes
    .getElements()
    .some((element) => readRoutePath(element) === path);
}

function routeMatchesRequest(
  routes: ArrayLiteralExpression,
  path: string,
  options: RouteAddOptions,
  component: ComponentTarget | undefined,
  routesFilePath: string,
): boolean {
  const element = routes
    .getElements()
    .find((candidate) => readRoutePath(candidate) === path);
  if (!element) return false;
  const text = element.getText();
  if (options.redirectTo) {
    return (
      text.includes(`redirectTo: ${quote(options.redirectTo)}`) ||
      text.includes(`redirectTo: "${options.redirectTo}"`)
    );
  }
  if (!component) return false;
  const moduleSpecifier = relativeModuleSpecifier(
    routesFilePath,
    component.filePath,
  );
  return (
    text.includes(`GenDeps_${component.className}`) &&
    text.includes(moduleSpecifier)
  );
}

function readRoutePath(node: Node): string | undefined {
  if (
    Node.isCallExpression(node) &&
    node.getExpression().getText() === 'craftRoute'
  ) {
    const arg = node.getArguments()[0];
    return Node.isStringLiteral(arg) ? arg.getLiteralValue() : undefined;
  }
  if (!Node.isObjectLiteralExpression(node)) return undefined;
  const property = node.getProperty('path');
  if (!Node.isPropertyAssignment(property)) return undefined;
  const initializer = property.getInitializer();
  return Node.isStringLiteral(initializer)
    ? initializer.getLiteralValue()
    : undefined;
}

function rewriteMovedRouteText(text: string, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`(craftRoute\\(\\s*['"])${escaped}(?:/)?`), '$1')
    .replace(new RegExp(`(path\\s*:\\s*['"])${escaped}(?:/)?`), '$1');
}

function deriveMovedHelperRenames(
  parent: RouteCollection,
  nodes: Node[],
  prefix: string,
  childCollectionName: string,
): Map<string, string> {
  const parentName = toPascalCase(parent.collectionName);
  const childName = toPascalCase(childCollectionName);
  const candidates = new Map<string, string>();
  for (const node of nodes) {
    const originalPath = readRoutePath(node);
    if (originalPath === undefined) continue;
    const childPath =
      originalPath === prefix ? '' : originalPath.slice(prefix.length + 1);
    for (const segment of originalPath.split('/')) {
      if (!segment.startsWith(':')) continue;
      const param = segment.slice(1).replace(/\?$/, '');
      candidates.set(
        `inject${parentName}${toPascalCase(param)}Params`,
        `inject${childName}${toPascalCase(param)}Params`,
      );
    }
    const definition = getRouteDefinition(node);
    if (!definition) continue;
    const parentBase = routeBaseServiceName(originalPath);
    const childBase = routeBaseServiceName(childPath);
    for (const [property, suffix] of [
      ['data', 'Data'],
      ['queryParams', 'QueryParams'],
      ['resolve', 'ResolvedData'],
      ['withLoaderViewTransitionImage', 'ViewTransition'],
    ] as const) {
      if (!definition.getProperty(property)) continue;
      candidates.set(
        `inject${parentName}${parentBase}${suffix}`,
        `inject${childName}${childBase}${suffix}`,
      );
    }
    if (
      definition.getProperty('canActivate') ||
      definition.getProperty('canMatch')
    ) {
      candidates.set(
        `inject${parentName}${parentBase}GuardedData`,
        `inject${childName}${childBase}GuardedData`,
      );
    }
  }

  const declaration = parent.call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const binding = declaration?.getNameNode();
  if (!binding || !Node.isObjectBindingPattern(binding)) return new Map();
  const exportedBindings = new Set(
    binding
      .getElements()
      .map(
        (element) =>
          element.getPropertyNameNode()?.getText() ?? element.getName(),
      ),
  );
  return new Map(
    [...candidates].filter(([oldName]) => exportedBindings.has(oldName)),
  );
}

function getRouteDefinition(node: Node) {
  if (Node.isObjectLiteralExpression(node)) return node;
  if (
    Node.isCallExpression(node) &&
    node.getExpression().getText() === 'craftRoute'
  ) {
    const definition = node.getArguments()[1];
    return Node.isObjectLiteralExpression(definition) ? definition : undefined;
  }
  return undefined;
}

function routeBaseServiceName(path: string): string {
  if (!path) return 'Root';
  return path
    .split('/')
    .map((segment) => {
      if (segment === '**') return 'Wildcard';
      return toPascalCase(segment.replace(/^:/, '').replace(/\?$/, ''));
    })
    .join('');
}

function findHelperConsumers(
  project: Project,
  parentFile: SourceFile,
  renames: Map<string, string>,
): SourceFile[] {
  if (renames.size === 0) return [];
  return project.getSourceFiles().filter((sourceFile) =>
    sourceFile.getImportDeclarations().some((declaration) => {
      if (declaration.getModuleSpecifierSourceFile() !== parentFile)
        return false;
      return declaration
        .getNamedImports()
        .some((namedImport) => renames.has(namedImport.getName()));
    }),
  );
}

function rewireMovedHelpers(
  project: Project,
  parent: RouteCollection,
  target: SourceFile,
  renames: Map<string, string>,
): void {
  if (renames.size === 0) return;
  const parentDeclaration = parent.call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const parentBinding = parentDeclaration?.getNameNode();
  const targetDeclaration = target
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === 'craftRoutes')
    ?.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const targetBinding = targetDeclaration?.getNameNode();
  if (
    !parentBinding ||
    !Node.isObjectBindingPattern(parentBinding) ||
    !targetBinding ||
    !Node.isObjectBindingPattern(targetBinding)
  ) {
    return;
  }

  const oldNames = new Set(renames.keys());
  const parentElements = parentBinding
    .getElements()
    .filter(
      (element) =>
        !oldNames.has(
          element.getPropertyNameNode()?.getText() ?? element.getName(),
        ),
    )
    .map((element) => element.getText());
  parentBinding.replaceWithText(`{ ${parentElements.join(', ')} }`);

  const targetElements = targetBinding
    .getElements()
    .map((element) => element.getText());
  for (const newName of renames.values()) {
    if (!targetElements.includes(newName)) targetElements.push(newName);
  }
  targetBinding.replaceWithText(`{ ${targetElements.join(', ')} }`);

  for (const sourceFile of project.getSourceFiles()) {
    for (const declaration of [...sourceFile.getImportDeclarations()]) {
      if (declaration.getModuleSpecifierSourceFile() !== parent.sourceFile)
        continue;
      for (const namedImport of [...declaration.getNamedImports()]) {
        const newName = renames.get(namedImport.getName());
        if (!newName) continue;
        const localName =
          namedImport.getAliasNode()?.getText() ?? namedImport.getName();
        let targetImport = sourceFile
          .getImportDeclarations()
          .find(
            (candidate) => candidate.getModuleSpecifierSourceFile() === target,
          );
        if (!targetImport) {
          targetImport = sourceFile.addImportDeclaration({
            moduleSpecifier: relativeModuleSpecifier(
              sourceFile.getFilePath(),
              target.getFilePath(),
            ),
          });
        }
        targetImport.addNamedImport({
          name: newName,
          alias: localName === newName ? undefined : localName,
        });
        namedImport.remove();
      }
      if (
        declaration.getNamedImports().length === 0 &&
        !declaration.getDefaultImport() &&
        !declaration.getNamespaceImport()
      ) {
        declaration.remove();
      }
    }
  }
}

function findLocalDependencies(
  sourceFile: SourceFile,
  nodes: Node[],
): string[] {
  const imported = new Set(
    sourceFile.getImportDeclarations().flatMap((declaration) => {
      const defaultImport = declaration.getDefaultImport();
      const namespaceImport = declaration.getNamespaceImport();
      return [
        ...declaration
          .getNamedImports()
          .map((item) => item.getAliasNode()?.getText() ?? item.getName()),
        ...(defaultImport ? [defaultImport.getText()] : []),
        ...(namespaceImport ? [namespaceImport.getText()] : []),
      ];
    }),
  );
  const locals = new Set([
    ...sourceFile
      .getVariableStatements()
      .flatMap((statement) => statement.getDeclarations())
      .map((declaration) => declaration.getName()),
    ...sourceFile
      .getFunctions()
      .map((declaration) => declaration.getName())
      .filter(Boolean),
    ...sourceFile.getEnums().map((declaration) => declaration.getName()),
    ...sourceFile.getTypeAliases().map((declaration) => declaration.getName()),
    ...sourceFile.getInterfaces().map((declaration) => declaration.getName()),
    ...sourceFile
      .getClasses()
      .map((declaration) => declaration.getName())
      .filter(Boolean),
  ] as string[]);
  const ignored = new Set([
    'craftRoute',
    'import',
    'm',
    'withRetry',
    'true',
    'false',
    'undefined',
  ]);
  const used = new Set(
    nodes.flatMap((node) =>
      node
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText()),
    ),
  );
  return [...used].filter(
    (name) => locals.has(name) && !imported.has(name) && !ignored.has(name),
  );
}

function rewriteRelativeSpecifiers(
  target: SourceFile,
  previousFilePath: string,
): void {
  for (const declaration of target.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (!specifier.startsWith('.')) continue;
    const absolute = resolve(dirname(previousFilePath), specifier);
    declaration.setModuleSpecifier(
      relativeModuleSpecifier(target.getFilePath(), absolute),
    );
  }
  for (const literal of target.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const parent = literal.getParent();
    if (!literal.getLiteralValue().startsWith('.')) continue;
    if (
      Node.isCallExpression(parent) &&
      (parent.getExpression().getText() === 'import' ||
        parent.getExpression().getText() === 'require')
    ) {
      const absolute = resolve(
        dirname(previousFilePath),
        literal.getLiteralValue(),
      );
      literal.setLiteralValue(
        relativeModuleSpecifier(target.getFilePath(), absolute),
      );
    } else if (literal.getFirstAncestorByKind(SyntaxKind.ImportType)) {
      const absolute = resolve(
        dirname(previousFilePath),
        literal.getLiteralValue(),
      );
      literal.setLiteralValue(
        relativeModuleSpecifier(target.getFilePath(), absolute),
      );
    }
  }
}

function ensureImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier = '@craft-ts/core',
): void {
  const declaration = sourceFile
    .getImportDeclarations()
    .find(
      (item) =>
        item.getModuleSpecifierValue() === moduleSpecifier &&
        !item.isTypeOnly(),
    );
  if (!declaration) {
    sourceFile.addImportDeclaration({ moduleSpecifier, namedImports: [name] });
  } else if (
    !declaration.getNamedImports().some((item) => item.getName() === name)
  ) {
    declaration.addNamedImport(name);
  }
}

function ensureTypeImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier = '@craft-ts/core',
): void {
  if (
    sourceFile
      .getImportDeclarations()
      .some(
        (item) =>
          item.getModuleSpecifierValue() === moduleSpecifier &&
          item.getNamedImports().some((named) => named.getName() === name),
      )
  ) {
    return;
  }
  const valueImport = sourceFile
    .getImportDeclarations()
    .find(
      (item) =>
        item.getModuleSpecifierValue() === moduleSpecifier &&
        !item.isTypeOnly(),
    );
  if (valueImport) valueImport.addNamedImport({ name, isTypeOnly: true });
  else
    sourceFile.addImportDeclaration({
      moduleSpecifier,
      isTypeOnly: true,
      namedImports: [name],
    });
}

function hasCall(
  sourceFile: SourceFile,
  functionName: string,
  argument: string,
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(
      (call) =>
        call.getExpression().getText() === functionName &&
        call.getArguments()[0]?.getText() === argument,
    );
}

async function saveFiles(
  project: Project,
  filePaths: string[],
  fileSystem: RouteFileSystem,
): Promise<void> {
  await Promise.all(
    [...new Set(filePaths)].map(async (filePath) => {
      const sourceFile = project.getSourceFile(filePath);
      if (sourceFile) {
        await fileSystem.write(filePath, sourceFile.getFullText());
      }
    }),
  );
}

function addSourceFileFromWorkspace(
  project: Project,
  filePath: string,
  fileSystem: RouteFileSystem,
): SourceFile | undefined {
  const existing = project.getSourceFile(filePath);
  if (existing) return existing;
  const text = fileSystem.read(filePath);
  return text === undefined
    ? undefined
    : project.createSourceFile(filePath, text, { overwrite: true });
}

function snapshotProject(project: Project): Map<string, string> {
  return new Map(
    project
      .getSourceFiles()
      .map((sourceFile) => [
        sourceFile.getFilePath(),
        sourceFile.getFullText(),
      ]),
  );
}

function sourceChanged(
  project: Project,
  initialTexts: Map<string, string>,
  filePath: string,
): boolean {
  const sourceFile = project.getSourceFile(filePath);
  return Boolean(
    sourceFile && initialTexts.get(filePath) !== sourceFile.getFullText(),
  );
}

export async function validateRouteChangedFiles(
  rootDir: string,
  sourceRoot: string,
  tsConfigFilePath: string,
  files: string[],
  eslintBaseline: Set<string>,
  options: { skipTypeCheck?: boolean } = {},
): Promise<RouteCommandDiagnostic[]> {
  const diagnostics: RouteCommandDiagnostic[] = [];
  const eslint = findLocalBinary(rootDir, 'eslint');
  if (eslint && files.length > 0) {
    const lint = await runEslintJson(eslint, ['--fix', ...files], sourceRoot);
    if (lint.failure) {
      diagnostics.push({
        code: 'VALIDATION_FAILED',
        message: `ESLint failed after writing changes: ${lint.failure}`,
      });
    } else if (lint.failed) {
      const newMessages = lint.results.flatMap((result) =>
        result.messages
          .filter(
            (message) =>
              !eslintBaseline.has(eslintFingerprint(result.filePath, message)),
          )
          .map(
            (message) =>
              `${result.filePath}:${message.line ?? 0}:${message.column ?? 0} ${message.message}${message.ruleId ? ` (${message.ruleId})` : ''}`,
          ),
      );
      if (newMessages.length > 0) {
        diagnostics.push({
          code: 'VALIDATION_FAILED',
          message: `ESLint failed after writing changes: ${newMessages.join('\n')}`,
        });
      }
    }
  }
  if (options.skipTypeCheck) return diagnostics;
  const ngc = findLocalBinary(rootDir, 'ngc');
  const tsc = findLocalBinary(rootDir, 'tsc');
  const typeChecker =
    basename(tsConfigFilePath) === 'tsconfig.app.json' && ngc ? ngc : tsc;
  if (typeChecker && existsSync(tsConfigFilePath)) {
    try {
      await execFileAsync(
        typeChecker,
        ['--project', tsConfigFilePath, '--noEmit'],
        {
          cwd: sourceRoot,
          maxBuffer: 20 * 1024 * 1024,
        },
      );
    } catch (error) {
      const detail = commandError(error);
      diagnostics.push({
        code: 'VALIDATION_FAILED',
        message: detail.includes('TS2589')
          ? `TypeScript hit TS2589 after writing changes. Keep the DI check and split the collection with loadChildren; rerun with --feature-file or a more specific --parent. ${detail}`
          : `TypeScript diagnostics failed after writing changes: ${detail}`,
      });
    }
  }
  return diagnostics;
}

type EslintMessage = {
  column?: number;
  line?: number;
  message: string;
  ruleId?: string | null;
};

type EslintResult = {
  filePath: string;
  messages: EslintMessage[];
};

export async function captureRouteEslintBaseline(
  rootDir: string,
  sourceRoot: string,
  files: string[],
): Promise<Set<string>> {
  const eslint = findLocalBinary(rootDir, 'eslint');
  const existingFiles = files.filter((file) => existsSync(file));
  if (!eslint || existingFiles.length === 0) return new Set();
  const lint = await runEslintJson(eslint, existingFiles, sourceRoot);
  if (lint.failure) return new Set();
  return new Set(
    lint.results.flatMap((result) =>
      result.messages.map((message) =>
        eslintFingerprint(result.filePath, message),
      ),
    ),
  );
}

async function runEslintJson(
  eslint: string,
  args: string[],
  cwd: string,
): Promise<{
  failed: boolean;
  failure?: string;
  results: EslintResult[];
}> {
  try {
    const { stdout } = await execFileAsync(
      eslint,
      ['--format', 'json', ...args],
      { cwd, maxBuffer: 20 * 1024 * 1024 },
    );
    return { failed: false, results: parseEslintResults(stdout) ?? [] };
  } catch (error) {
    const stdout = commandStdout(error);
    const results = parseEslintResults(stdout);
    return results
      ? { failed: true, results }
      : { failed: true, failure: commandError(error), results: [] };
  }
}

function parseEslintResults(output: string): EslintResult[] | undefined {
  if (!output.trim()) return undefined;
  try {
    const value: unknown = JSON.parse(output);
    return Array.isArray(value) ? (value as EslintResult[]) : undefined;
  } catch {
    return undefined;
  }
}

function eslintFingerprint(filePath: string, message: EslintMessage): string {
  return `${resolve(filePath)}\0${message.ruleId ?? ''}\0${message.message}`;
}

function findLocalBinary(rootDir: string, name: string): string | undefined {
  let current = rootDir;
  while (true) {
    const candidate = join(current, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function listFilesOnDisk(rootDir: string): string[] {
  if (!existsSync(rootDir)) return [];
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.angular', '.git'].includes(entry.name)) {
        continue;
      }
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) result.push(filePath);
    }
  };
  visit(rootDir);
  return result;
}

async function findFiles(rootDir: string, fileName: string): Promise<string[]> {
  const entries = await readdir(rootDir, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name === fileName)
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes(`${sep}node_modules${sep}`));
}

function printPlan(
  plan: RouteCommandPlan,
  log: (message: string) => void,
  json: boolean,
) {
  if (json) return;
  log(
    `${plan.summary}\nFiles:\n${plan.files.map((file) => `  ${file}`).join('\n')}`,
  );
}

async function shouldContinue(
  options: {
    dryRun?: boolean;
    yes?: boolean;
    confirm?: (plan: RouteCommandPlan) => Promise<boolean>;
  },
  plan: RouteCommandPlan,
): Promise<boolean> {
  if (options.dryRun || options.yes) return true;
  return options.confirm ? options.confirm(plan) : false;
}

function failed(
  code: RouteCommandDiagnostic['code'],
  message: string,
  plan?: RouteCommandPlan,
): RouteCommandResult {
  return resultFromDiagnostics([{ code, message }], plan);
}

function resultFromDiagnostics(
  diagnostics: RouteCommandDiagnostic[],
  plan?: RouteCommandPlan,
): RouteCommandResult {
  return { changedFiles: [], diagnostics, exitCode: 1, plan };
}

function resolveFromRoot(filePath: string, rootDir: string): string {
  return isAbsolute(filePath) ? resolve(filePath) : resolve(rootDir, filePath);
}

function normalizeRoutePath(path: string): string {
  const clean = path
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
  return clean ? `/${clean}` : '/';
}

function relativeModuleSpecifier(fromFile: string, toFile: string): string {
  let value = relative(dirname(fromFile), toFile).replace(/\\/g, '/');
  const extension = extname(value);
  if (['.ts', '.tsx', '.js', '.jsx'].includes(extension)) {
    value = value.slice(0, -extension.length);
  }
  if (!value.startsWith('.')) value = `./${value}`;
  return value;
}

function collectionNameFromFile(filePath: string): string {
  return basename(filePath)
    .replace(/\.routes\.ts$/, '')
    .replace(/\.ts$/, '');
}

function isInside(filePath: string, rootDir: string): boolean {
  const path = relative(resolve(rootDir), resolve(filePath));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function toPascalCase(value: string): string {
  return (
    value
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Routes'
  );
}

function uncapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function commandError(error: unknown): string {
  if (typeof error === 'object' && error) {
    const value = error as {
      stdout?: unknown;
      stderr?: unknown;
      message?: unknown;
    };
    const output = [value.stdout, value.stderr]
      .filter((item) => typeof item === 'string' && item.trim())
      .join('\n')
      .trim();
    if (output) return output;
    if (value.message) return String(value.message).trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function commandStdout(error: unknown): string {
  if (typeof error === 'object' && error && 'stdout' in error) {
    return String((error as { stdout?: unknown }).stdout ?? '');
  }
  return '';
}
