import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import {
  ArrayLiteralExpression,
  CallExpression,
  Expression,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  VariableDeclaration,
  ts,
} from 'ts-morph';
import {
  findAngularDecoratedClass,
  transformSourceFile as generateAngularDependencies,
} from '../angular-brand-codemod.js';
import {
  RouteMigrationDiagnostic,
  RouteMigrationDiagnosticCode,
} from './migration-diagnostic.js';
import { migrateEslintConfig } from '../migration-workspace.js';

export type MigrateRoutesOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  files?: readonly string[];
  write?: boolean;
  check?: boolean;
  collectionName?: string;
  parentMount?: string;
  parentNames?: readonly string[];
  jsonFilePath?: string;
  failOnManual?: boolean;
  log?: (message: string) => void;
};

export type MigratedRoutesFile = {
  filePath: string;
  changed: boolean;
  collections: string[];
};

export type MigrateRoutesResult = {
  changedFiles: string[];
  files: MigratedRoutesFile[];
  diagnostics: RouteMigrationDiagnostic[];
  remainingLegacyCollections: number;
  exitCode: number;
};

type ComponentResolution = {
  moduleSpecifier: string;
  componentName: string;
  sourceFile?: SourceFile;
};

type TransformContext = {
  sourceFile: SourceFile;
  diagnostics: RouteMigrationDiagnostic[];
  usedCraftRoute: boolean;
  generatedComponentFiles: Set<SourceFile>;
};

export async function runRoutesMigration(
  options: MigrateRoutesOptions = {},
): Promise<MigrateRoutesResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = options.tsConfigFilePath
    ? resolve(options.tsConfigFilePath)
    : defaultTsConfig(rootDir);
  const project = createProject(tsConfigFilePath);
  project.addSourceFilesAtPaths([
    join(rootDir, '**/*.ts'),
    `!${join(rootDir, '**/node_modules/**')}`,
    `!${join(rootDir, '**/dist/**')}`,
    `!${join(rootDir, '**/.angular/**')}`,
  ]);
  setQuoteKind(project);

  const selectedFiles = options.files?.length
    ? new Set(options.files.map((file) => resolve(file)))
    : undefined;
  const sourceFiles = project.getSourceFiles().filter((sourceFile) => {
    const filePath = sourceFile.getFilePath();
    return (
      isInside(filePath, rootDir) &&
      !sourceFile.isDeclarationFile() &&
      !/\.(?:spec|test)\.ts$/.test(filePath) &&
      (!selectedFiles || selectedFiles.has(resolve(filePath)))
    );
  });

  const diagnostics: RouteMigrationDiagnostic[] = [];
  const generatedComponentFiles = new Set<SourceFile>();
  const files: MigratedRoutesFile[] = [];
  const legacyCollectionsBefore = sourceFiles.reduce(
    (count, sourceFile) => count + findLegacyRouteDeclarations(sourceFile).length,
    0,
  );

  for (const sourceFile of sourceFiles) {
    const before = sourceFile.getFullText();
    const collections = migrateRoutesSourceFile(sourceFile, {
      ...options,
      diagnostics,
      generatedComponentFiles,
    });
    files.push({
      filePath: sourceFile.getFilePath(),
      changed: before !== sourceFile.getFullText(),
      collections,
    });
  }

  for (const sourceFile of sourceFiles) {
    if (rewriteHybridLazyChildren(sourceFile)) {
      const report = files.find(
        (file) => file.filePath === sourceFile.getFilePath(),
      );
      if (report) report.changed = true;
    }
  }

  for (const sourceFile of sourceFiles) {
    const result = generateAngularDependencies(sourceFile);
    if (result.changed) generatedComponentFiles.add(sourceFile);
  }

  for (const sourceFile of sourceFiles) {
    const before = sourceFile.getFullText();
    const appConfigMigrated = migrateApplicationConfigSourceFile(sourceFile);
    if (
      !appConfigMigrated &&
      sourceFile.getVariableDeclaration('appConfig') &&
      sourceFile.getFullText().includes('provideRouter(')
    ) {
      diagnostics.push({
        code: 'APP_CONFIG_REQUIRES_CRAFT_ROUTES',
        filePath: sourceFile.getFilePath(),
        message:
          'appConfig reste en ApplicationConfig tant que la collection racine et ses guards ne sont pas migrés vers craftRoutes.',
      });
    }
    migrateBootstrapSourceFile(sourceFile);
    if (before === sourceFile.getFullText()) continue;
    sourceFile.organizeImports();
    const report = files.find((file) => file.filePath === sourceFile.getFilePath());
    if (report) report.changed = true;
  }

  const eslintConfig = migrateEslintConfig(
    project,
    tsConfigFilePath ? dirname(tsConfigFilePath) : rootDir,
  );

  const changedSourceFiles = new Set(
    files
      .filter((file) => file.changed)
      .map((file) => project.getSourceFileOrThrow(file.filePath)),
  );
  for (const sourceFile of generatedComponentFiles) {
    if (sourceFile.wasForgotten()) continue;
    changedSourceFiles.add(sourceFile);
  }
  if (eslintConfig) changedSourceFiles.add(eslintConfig);

  if (options.write) {
    await Promise.all([...changedSourceFiles].map((file) => file.save()));
  }

  const remainingLegacyCollections = options.write
    ? sourceFiles.reduce(
        (count, sourceFile) =>
          count + findLegacyRouteDeclarations(sourceFile).length,
        0,
      )
    : legacyCollectionsBefore;
  const changedFiles = [...changedSourceFiles].map((file) => file.getFilePath());
  const exitCode =
    (options.check && remainingLegacyCollections > 0) ||
    (options.failOnManual && diagnostics.length > 0)
      ? 1
      : 0;
  const result: MigrateRoutesResult = {
    changedFiles,
    files,
    diagnostics,
    remainingLegacyCollections,
    exitCode,
  };

  if (options.jsonFilePath) {
    const jsonFilePath = resolve(options.jsonFilePath);
    await mkdir(dirname(jsonFilePath), { recursive: true });
    await writeFile(jsonFilePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  logResult(result, options.log ?? console.log, options.write === true);
  return result;
}

export function migrateApplicationConfigSourceFile(
  sourceFile: SourceFile,
): boolean {
  const declaration = sourceFile.getVariableDeclaration('appConfig');
  const initializer = declaration?.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression,
  );
  if (!declaration || !initializer) return false;
  const routerCall = initializer
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === 'provideRouter');
  const routesArgument = routerCall?.getArguments()[0];
  if (!routerCall || !Node.isIdentifier(routesArgument)) return false;
  const routesName = routesArgument.getText();
  if (!isCraftRoutesImport(sourceFile, routesName)) return false;
  routerCall.getExpression().replaceWithText('provideCraftRouter');
  routesArgument.replaceWithText(`${routesName}.toRoutes()`);
  const configText = initializer.getText();
  declaration.setInitializer(
    `craftAppConfig({ routingDeps: ${routesName}.META_DATA, ${configText.slice(1, -1)} })`,
  );
  declaration.removeType();
  ensureValueImport(sourceFile, 'craftAppConfig');
  ensureValueImport(sourceFile, 'provideCraftRouter');
  return true;
}

function isCraftRoutesImport(sourceFile: SourceFile, name: string): boolean {
  const declaration = sourceFile
    .getImportDeclarations()
    .find((item) =>
      item.getNamedImports().some((namedImport) => namedImport.getName() === name),
    );
  return (
    declaration
      ?.getModuleSpecifierSourceFile()
      ?.getFullText()
      .includes('craftRoutes(') === true
  );
}

export function migrateBootstrapSourceFile(sourceFile: SourceFile): boolean {
  const appConfigImport = sourceFile
    .getImportDeclarations()
    .find((item) =>
      item
        .getNamedImports()
        .some((namedImport) => namedImport.getName() === 'appConfig'),
    );
  if (
    appConfigImport &&
    !appConfigImport
      .getModuleSpecifierSourceFile()
      ?.getFullText()
      .includes('craftAppConfig(')
  ) {
    return false;
  }
  let changed = false;
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getText() !== 'bootstrapApplication') continue;
    const config = call.getArguments()[1];
    if (!Node.isIdentifier(config) || config.getText() !== 'appConfig') continue;
    config.replaceWithText('toApplicationConfig(appConfig)');
    ensureValueImport(sourceFile, 'toApplicationConfig');
    changed = true;
  }
  return changed;
}

function rewriteHybridLazyChildren(sourceFile: SourceFile): boolean {
  let changed = false;
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const thenAccess = call.getExpression();
    if (!Node.isPropertyAccessExpression(thenAccess) || thenAccess.getName() !== 'then') {
      continue;
    }
    const importCall = thenAccess.getExpression();
    if (
      !Node.isCallExpression(importCall) ||
      importCall.getExpression().getKind() !== SyntaxKind.ImportKeyword
    ) {
      continue;
    }
    const moduleArgument = importCall.getArguments()[0];
    const callback = call.getArguments()[0];
    if (
      !Node.isStringLiteral(moduleArgument) ||
      !Node.isArrowFunction(callback) ||
      !Node.isPropertyAccessExpression(callback.getBody()) ||
      callback.getBody().getText().endsWith('.toRoutes()')
    ) {
      continue;
    }
    const base = resolve(
      dirname(sourceFile.getFilePath()),
      moduleArgument.getLiteralValue(),
    );
    const imported =
      sourceFile.getProject().getSourceFile(`${base}.ts`) ??
      sourceFile.getProject().getSourceFile(join(base, 'index.ts'));
    if (!imported?.getFullText().includes('craftRoutes(')) continue;
    callback.getBody().replaceWithText(`${callback.getBody().getText()}.toRoutes()`);
    changed = true;
  }
  return changed;
}

export function migrateRoutesSourceFile(
  sourceFile: SourceFile,
  options: Pick<
    MigrateRoutesOptions,
    'collectionName' | 'parentMount' | 'parentNames'
  > & {
    diagnostics?: RouteMigrationDiagnostic[];
    generatedComponentFiles?: Set<SourceFile>;
  } = {},
): string[] {
  const declarations = findLegacyRouteDeclarations(sourceFile);
  if (declarations.length === 0) return [];

  const diagnostics = options.diagnostics ?? [];
  const generatedComponentFiles = options.generatedComponentFiles ?? new Set();
  const migratedCollections: string[] = [];

  for (const declaration of declarations) {
    const array = getRoutesArray(declaration);
    if (!array) continue;

    const collectionName =
      options.collectionName ?? inferCollectionName(sourceFile, declaration);
    const generatedRoutesName = `${collectionName}Routes`;
    const exportedName = declaration.getName();
    const context: TransformContext = {
      sourceFile,
      diagnostics,
      usedCraftRoute: false,
      generatedComponentFiles,
    };

    if (hasBlockingAngularRoute(array, context, '')) continue;

    if (options.parentMount && options.parentNames === undefined) {
      diagnostics.push({
        code: 'PARENT_CONTEXT_UNKNOWN',
        filePath: sourceFile.getFilePath(),
        routePath: options.parentMount,
        message:
          'Le contexte DI du parent n’est pas déclaré. Passez --parent-names (une valeur vide confirme explicitement qu’aucun provider nommé n’est hérité).',
      });
    }

    for (const element of [...array.getElements()]) {
      if (Node.isObjectLiteralExpression(element)) {
        transformRoute(element, context, '');
      }
    }

    const arrayText = array.getText();
    const binding =
      exportedName === generatedRoutesName
        ? generatedRoutesName
        : `${generatedRoutesName}: ${exportedName}`;
    const parentSuffix = options.parentMount
      ? `.withParent<ParentRoutes<${JSON.stringify(options.parentMount)}>>()`
      : '';
    declaration
      .getVariableStatementOrThrow()
      .replaceWithText(
        `export const { ${binding} } = craftRoutes(${JSON.stringify(collectionName)}, ${arrayText})${parentSuffix};`,
      );

    ensureValueImport(sourceFile, 'craftRoutes');
    if (context.usedCraftRoute) ensureValueImport(sourceFile, 'craftRoute');
    if (options.parentMount) ensureTypeImport(sourceFile, 'ParentRoutes');
    addDiCheck(sourceFile, exportedName, collectionName, options.parentNames);
    removeUnusedAngularRoutesImport(sourceFile);
    migratedCollections.push(exportedName);
  }

  if (migratedCollections.length > 0) sourceFile.formatText();
  return migratedCollections;
}

function findLegacyRouteDeclarations(
  sourceFile: SourceFile,
): VariableDeclaration[] {
  return sourceFile.getVariableDeclarations().filter((declaration) => {
    const statement = declaration.getVariableStatement();
    if (!statement?.isExported() || !getRoutesArray(declaration)) return false;
    const typeText = declaration.getTypeNode()?.getText();
    const initializer = declaration.getInitializer();
    if (typeText === 'Routes') return true;
    if (!initializer || !Node.isSatisfiesExpression(initializer)) return false;
    return initializer.getTypeNode()?.getText() === 'Routes';
  });
}

function getRoutesArray(
  declaration: VariableDeclaration,
): ArrayLiteralExpression | undefined {
  let initializer = declaration.getInitializer();
  if (Node.isSatisfiesExpression(initializer) || Node.isAsExpression(initializer)) {
    initializer = initializer.getExpression();
  }
  return Node.isArrayLiteralExpression(initializer) ? initializer : undefined;
}

function transformRoute(
  route: ObjectLiteralExpression,
  context: TransformContext,
  parentPath: string,
): void {
  const pathProperty = getProperty(route, 'path');
  const pathInitializer = pathProperty?.getInitializer();
  const path = getStaticString(pathInitializer);
  const routeLabel = path === undefined ? parentPath || '<unknown>' : joinRoute(parentPath, path);

  if (path === undefined) {
    diagnose(context, 'DYNAMIC_PATH', routeLabel, 'Le path de la route n’est pas une chaîne statique.');
    return;
  }

  if (getProperty(route, 'children')) {
    diagnose(
      context,
      'ROUTE_SPLIT_RECOMMENDED',
      routeLabel,
      'craftRoute ne prend pas en charge children dans l’API actuelle ; extrayez ces routes dans une collection montée par loadChildren.',
    );
    return;
  }

  const redirect = getProperty(route, 'redirectTo');
  if (redirect && getStaticString(redirect.getInitializer()) === undefined) {
    diagnose(context, 'DYNAMIC_REDIRECT', routeLabel, 'Le redirectTo est dynamique et doit être vérifié manuellement.');
  }

  const hasComponent = Boolean(
    getProperty(route, 'component') ?? getProperty(route, 'loadComponent'),
  );
  if (!hasComponent) return;

  if (getProperty(route, 'loadChildren')) {
    diagnose(context, 'ROUTE_SPLIT_RECOMMENDED', routeLabel, 'La route combine un composant et loadChildren ; séparez-la en collections explicites.');
    return;
  }

  if (hasAngularGuard(route, context, routeLabel)) return;

  const component = resolveComponent(route, context.sourceFile);
  if (!component) {
    diagnose(context, 'COMPONENT_NOT_RESOLVABLE', routeLabel, 'Le composant routé ou son module ne peut pas être résolu sans ambiguïté.');
    return;
  }

  if (!ensureGeneratedDeps(component, context)) {
    diagnose(context, 'COMPONENT_NOT_RESOLVABLE', routeLabel, `GenDeps_${component.componentName} ne peut pas être généré de façon sûre.`);
    return;
  }

  if (!getProperty(route, 'componentDeps')) {
    route.addPropertyAssignment({
      name: 'componentDeps',
      initializer: `{} as import(${JSON.stringify(component.moduleSpecifier)}).GenDeps_${component.componentName}`,
    });
  }
  pathProperty?.remove();
  const definition = route.getText();
  route.replaceWithText(`craftRoute(${JSON.stringify(path)}, ${definition})`);
  context.usedCraftRoute = true;
}

function hasBlockingAngularRoute(
  routes: ArrayLiteralExpression,
  context: TransformContext,
  parentPath: string,
): boolean {
  let blocked = false;
  for (const element of routes.getElements()) {
    if (!Node.isObjectLiteralExpression(element)) continue;
    const path = getStaticString(
      getProperty(element, 'path')?.getInitializer(),
    );
    const routePath =
      path === undefined ? parentPath || '<unknown>' : joinRoute(parentPath, path);
    if (getProperty(element, 'children')) {
      diagnose(
        context,
        'ROUTE_SPLIT_RECOMMENDED',
        routePath,
        'craftRoute ne prend pas en charge children dans l’API actuelle ; extrayez ces routes dans une collection montée par loadChildren.',
      );
      blocked = true;
    }
    if (hasAngularGuard(element, context, routePath)) blocked = true;
  }
  return blocked;
}

function hasAngularGuard(
  route: ObjectLiteralExpression,
  context: TransformContext,
  routePath: string,
): boolean {
  let found = false;
  for (const guardName of ['canActivate', 'canMatch'] as const) {
    const guard = getProperty(route, guardName)?.getInitializer();
    if (!guard) continue;
    // A craft guard is authored as a bare generator function (`function* () {}`);
    // the outlet drives it after commit. Such a guard is already migrated.
    if (Node.isFunctionExpression(guard) && guard.isGenerator()) {
      continue;
    }
    found = true;
    if (Node.isArrayLiteralExpression(guard) && guard.getElements().length > 1) {
      diagnose(context, 'MULTIPLE_GUARDS_REQUIRE_COMPOSITION', routePath, `${guardName} contient plusieurs guards ; leur composition craft-ts est une décision métier.`);
    } else {
      diagnose(context, 'ANGULAR_GUARD_REQUIRES_REWRITE', routePath, `${guardName} doit être réécrit en générateur craft (function* () {}).`);
    }
  }
  return found;
}

function resolveComponent(
  route: ObjectLiteralExpression,
  routeSourceFile: SourceFile,
): ComponentResolution | undefined {
  const direct = getProperty(route, 'component')?.getInitializer();
  if (Node.isIdentifier(direct)) {
    const defaultImport = routeSourceFile
      .getImportDeclarations()
      .find(
        (candidate) =>
          candidate.getDefaultImport()?.getText() === direct.getText(),
      );
    if (defaultImport) {
      const componentSourceFile = defaultImport.getModuleSpecifierSourceFile();
      return {
        moduleSpecifier: defaultImport.getModuleSpecifierValue(),
        componentName:
          inferSingleComponentName(componentSourceFile) ?? direct.getText(),
        sourceFile: componentSourceFile,
      };
    }
    const importDeclaration = routeSourceFile
      .getImportDeclarations()
      .find((candidate) =>
        candidate.getNamedImports().some(
          (specifier) =>
            (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
            direct.getText(),
        ),
      );
    const namedImport = importDeclaration?.getNamedImports().find(
      (specifier) =>
        (specifier.getAliasNode()?.getText() ?? specifier.getName()) ===
        direct.getText(),
    );
    if (importDeclaration && namedImport) {
      return {
        moduleSpecifier: importDeclaration.getModuleSpecifierValue(),
        componentName: namedImport.getName(),
        sourceFile: importDeclaration.getModuleSpecifierSourceFile(),
      };
    }
    return {
      moduleSpecifier: `./${basename(routeSourceFile.getFilePath(), extname(routeSourceFile.getFilePath()))}`,
      componentName: direct.getText(),
      sourceFile: routeSourceFile,
    };
  }

  const lazy = getProperty(route, 'loadComponent')?.getInitializer();
  if (!Node.isArrowFunction(lazy) && !Node.isFunctionExpression(lazy)) return undefined;
  const body = lazy.getBody();
  const expression = (Node.isBlock(body)
    ? body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression()
    : body) as Expression | undefined;
  if (!expression) return undefined;
  return resolveLazyComponent(expression, routeSourceFile);
}

function resolveLazyComponent(
  expression: Expression,
  routeSourceFile: SourceFile,
): ComponentResolution | undefined {
  if (Node.isAwaitExpression(expression)) expression = expression.getExpression();
  if (Node.isCallExpression(expression)) {
    const calledExpression = expression.getExpression();
    if (!Node.isPropertyAccessExpression(calledExpression)) {
      return resolveBareImport(expression, routeSourceFile);
    }
    const propertyAccess = calledExpression;
    if (propertyAccess.getName() === 'then') {
      const importCall = propertyAccess.getExpression();
      const callback = expression.getArguments()[0];
      if (!Node.isCallExpression(importCall) || importCall.getExpression().getText() !== 'import' || !Node.isArrowFunction(callback)) return undefined;
      const moduleSpecifier = getStaticString(importCall.getArguments()[0]);
      if (!moduleSpecifier) return undefined;
      const sourceFile = resolveModuleSourceFile(
        routeSourceFile,
        moduleSpecifier,
      );
      const componentName = resolveThenComponentName(callback);
      if (!componentName) return undefined;
      return {
        moduleSpecifier,
        componentName:
          componentName === 'default'
            ? (inferSingleComponentName(sourceFile) ?? componentName)
            : componentName,
        sourceFile,
      };
    }
  }

  return undefined;
}

function resolveThenComponentName(callback: Node): string | undefined {
  if (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback)) {
    return undefined;
  }
  const body = callback.getBody();
  const returnedExpression = Node.isBlock(body)
    ? body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression()
    : body;
  if (Node.isPropertyAccessExpression(returnedExpression)) {
    return returnedExpression.getName();
  }
  if (!Node.isIdentifier(returnedExpression)) return undefined;
  const parameterName = callback.getParameters()[0]?.getNameNode();
  if (!Node.isObjectBindingPattern(parameterName)) return undefined;
  const binding = parameterName
    .getElements()
    .find((element) => element.getName() === returnedExpression.getText());
  return binding?.getPropertyNameNode()?.getText() ?? binding?.getName();
}

function inferSingleComponentName(
  sourceFile: SourceFile | undefined,
): string | undefined {
  if (!sourceFile) return undefined;
  const genDeps = sourceFile
    .getTypeAliases()
    .filter(
      (alias) => alias.isExported() && alias.getName().startsWith('GenDeps_'),
    );
  if (genDeps.length === 1) {
    return genDeps[0].getName().slice('GenDeps_'.length);
  }
  const angularClass = findAngularDecoratedClass(sourceFile);
  return angularClass.skipped ? undefined : angularClass.className;
}

function resolveBareImport(
  expression: CallExpression,
  routeSourceFile: SourceFile,
): ComponentResolution | undefined {
  if (expression.getExpression().getText() === 'import') {
    const moduleSpecifier = getStaticString(expression.getArguments()[0]);
    if (!moduleSpecifier) return undefined;
    const sourceFile = resolveModuleSourceFile(routeSourceFile, moduleSpecifier);
    if (!sourceFile) return undefined;
    const componentName = inferSingleComponentName(sourceFile);
    if (componentName) {
      return {
        moduleSpecifier,
        componentName,
        sourceFile,
      };
    }
  }
  return undefined;
}

function ensureGeneratedDeps(
  component: ComponentResolution,
  context: TransformContext,
): boolean {
  const sourceFile = component.sourceFile;
  if (!sourceFile) return false;
  if (sourceFile.getTypeAlias(`GenDeps_${component.componentName}`)) return true;
  const angularClass = findAngularDecoratedClass(sourceFile);
  if (
    angularClass.skipped ||
    angularClass.className !== component.componentName
  ) {
    return false;
  }
  const result = generateAngularDependencies(sourceFile);
  if (result.changed) context.generatedComponentFiles.add(sourceFile);
  return Boolean(sourceFile.getTypeAlias(`GenDeps_${component.componentName}`));
}

function resolveModuleSourceFile(
  sourceFile: SourceFile,
  moduleSpecifier: string,
): SourceFile | undefined {
  if (!moduleSpecifier.startsWith('.')) return undefined;
  const base = resolve(dirname(sourceFile.getFilePath()), moduleSpecifier);
  const project = sourceFile.getProject();
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
  ]) {
    const resolved = project.getSourceFile(candidate);
    if (resolved) return resolved;
  }
  return undefined;
}

function addDiCheck(
  sourceFile: SourceFile,
  routesName: string,
  collectionName: string,
  parentNames: readonly string[] | undefined,
): void {
  ensureTypeImport(sourceFile, 'CanRun');
  ensureTypeImport(sourceFile, 'ValidateCascadeRoutesFile');
  ensureTypeImport(sourceFile, 'Router', '@angular/router');
  const suffix = toPascalCase(collectionName);
  const names = parentNames?.length
    ? parentNames.map((name) => JSON.stringify(name)).join(' | ')
    : 'never';
  sourceFile.addStatements(
    `\ntype _Check${suffix}DI = ValidateCascadeRoutesFile<${names}, Router, typeof ${routesName}>;\nexport type _CanRun${suffix} = CanRun<_Check${suffix}DI>;`,
  );
}

function ensureValueImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier = '@craft-ts/core',
): void {
  let declaration = sourceFile
    .getImportDeclarations()
    .find((item) => item.getModuleSpecifierValue() === moduleSpecifier && !item.isTypeOnly());
  if (!declaration) {
    declaration = sourceFile.addImportDeclaration({ moduleSpecifier, namedImports: [name] });
  } else if (!declaration.getNamedImports().some((item) => item.getName() === name)) {
    declaration.addNamedImport(name);
  }
}

function ensureTypeImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier = '@craft-ts/core',
): void {
  const alreadyImported = sourceFile.getImportDeclarations().some(
    (item) =>
      item.getModuleSpecifierValue() === moduleSpecifier &&
      item.getNamedImports().some((specifier) => specifier.getName() === name),
  );
  if (alreadyImported) return;
  const declaration = sourceFile
    .getImportDeclarations()
    .find((item) => item.getModuleSpecifierValue() === moduleSpecifier && item.isTypeOnly());
  if (!declaration) {
    sourceFile.addImportDeclaration({
      moduleSpecifier,
      isTypeOnly: true,
      namedImports: [name],
    });
  } else {
    declaration.addNamedImport(name);
  }
}

function removeUnusedAngularRoutesImport(sourceFile: SourceFile): void {
  const importDeclaration = sourceFile
    .getImportDeclarations()
    .find((item) => item.getModuleSpecifierValue() === '@angular/router');
  if (!importDeclaration) return;
  const routesImport = importDeclaration
    .getNamedImports()
    .find((item) => item.getName() === 'Routes');
  if (!routesImport) return;
  const withoutImports = sourceFile
    .getFullText()
    .replace(importDeclaration.getFullText(), '');
  if (/\bRoutes\b/.test(withoutImports)) return;
  routesImport.remove();
  if (
    importDeclaration.getNamedImports().length === 0 &&
    !importDeclaration.getDefaultImport() &&
    !importDeclaration.getNamespaceImport()
  ) {
    importDeclaration.remove();
  }
}

function getProperty(
  object: ObjectLiteralExpression,
  name: string,
): PropertyAssignment | undefined {
  const property = object.getProperty(name);
  return Node.isPropertyAssignment(property) ? property : undefined;
}

function getStaticString(node: Node | undefined): string | undefined {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralValue();
  }
  return undefined;
}

function diagnose(
  context: TransformContext,
  code: RouteMigrationDiagnosticCode,
  routePath: string,
  message: string,
): void {
  context.diagnostics.push({
    code,
    filePath: context.sourceFile.getFilePath(),
    routePath,
    message,
  });
}

function inferCollectionName(
  sourceFile: SourceFile,
  declaration: VariableDeclaration,
): string {
  const variableName = declaration.getName();
  if (variableName !== 'routes' && variableName.endsWith('Routes')) {
    return variableName.slice(0, -'Routes'.length);
  }
  const fileName = basename(sourceFile.getFilePath()).replace(/\.routes?\.ts$/, '');
  return toCamelCase(fileName === basename(sourceFile.getFilePath()) ? 'app' : fileName);
}

function toCamelCase(value: string): string {
  return value.replace(/[-_.]+([a-zA-Z0-9])/g, (_, character: string) => character.toUpperCase());
}

function toPascalCase(value: string): string {
  const camel = toCamelCase(value);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function joinRoute(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join('/') || '<root>';
}

function createProject(tsConfigFilePath: string | undefined): Project {
  return tsConfigFilePath
    ? new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: false })
    : new Project({
        compilerOptions: {
          experimentalDecorators: true,
          module: ts.ModuleKind.Preserve,
          moduleResolution: ts.ModuleResolutionKind.Node10,
          target: ts.ScriptTarget.ES2022,
        },
      });
}

function defaultTsConfig(rootDir: string): string | undefined {
  const path = join(rootDir, 'tsconfig.json');
  return existsSync(path) ? path : undefined;
}

function isInside(filePath: string, rootDir: string): boolean {
  const absolute = isAbsolute(filePath) ? filePath : resolve(filePath);
  return absolute === rootDir || absolute.startsWith(`${rootDir}/`);
}

function setQuoteKind(project: Project): void {
  project.manipulationSettings.set({ quoteKind: QuoteKind.Single });
}

function logResult(
  result: MigrateRoutesResult,
  log: (message: string) => void,
  wrote: boolean,
): void {
  for (const file of result.files.filter((item) => item.changed)) {
    log(`✓ ${file.filePath}: ${wrote ? 'migré' : 'migration proposée'}`);
  }
  for (const diagnostic of result.diagnostics) {
    log(`! ${diagnostic.filePath}${diagnostic.routePath ? ` / ${diagnostic.routePath}` : ''}: ${diagnostic.code}\n  ${diagnostic.message}`);
  }
  log(`summary changed=${result.changedFiles.length} manual=${result.diagnostics.length} remaining=${result.remainingLegacyCollections}`);
}
