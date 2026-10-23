import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { promisify } from 'node:util';
import {
  CallExpression,
  ClassDeclaration,
  ConstructorDeclaration,
  MethodDeclaration,
  Node,
  Project,
  PropertyAssignment,
  QuoteKind,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
import type {
  ServiceMigrationOverride,
  ServiceMigrationScope,
  ServiceMigrationStrategy,
} from '../angular-brand-codemod.js';
import { loadCraftDevToolsConfig } from './config.js';
import type {
  ServiceMigrationDiagnostic,
  ServiceMigrationDiagnosticCode,
} from './migration-diagnostic.js';
import { migrateEslintConfig } from '../migration-workspace.js';

const execFileAsync = promisify(execFile);
export type MigrateServicesOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  configFilePath?: string;
  files?: readonly string[];
  write?: boolean;
  check?: boolean;
  json?: boolean;
  jsonFilePath?: string;
  failOnManual?: boolean;
  eslint?: boolean;
  log?: (message: string) => void;
};

export type MigratedServiceFile = {
  filePath: string;
  changed: boolean;
  symbols: string[];
};

export type MigrateServicesResult = {
  changedFiles: string[];
  files: MigratedServiceFile[];
  diagnostics: ServiceMigrationDiagnostic[];
  remainingLegacyServices: number;
  eslintRan: boolean;
  exitCode: number;
};

type ServiceDescriptor = {
  classDeclaration: ClassDeclaration;
  sourceFile: SourceFile;
  symbol: string;
  name: string;
  scope: ServiceMigrationScope;
  strategy: ServiceMigrationStrategy;
  override?: ServiceMigrationOverride;
  httpOperations?: HttpOperationDescriptor[];
};

type HttpOperationDescriptor = {
  methodName: string;
  httpMethod: 'post' | 'put' | 'patch' | 'delete';
  responseType: string;
  urlText: string;
  payloadText?: string;
  parameterCount: number;
  typeParametersText: string;
  parametersText: string;
};

export async function runServicesMigration(
  options: MigrateServicesOptions = {},
): Promise<MigrateServicesResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = options.tsConfigFilePath
    ? resolve(options.tsConfigFilePath)
    : defaultTsConfig(rootDir);
  const project = new Project({
    ...(existsSync(tsConfigFilePath) ? { tsConfigFilePath } : {}),
    manipulationSettings: { quoteKind: QuoteKind.Single },
    skipAddingFilesFromTsConfig: false,
  });
  project.addSourceFilesAtPaths([
    join(rootDir, '**/*.ts'),
    `!${join(rootDir, '**/node_modules/**')}`,
    `!${join(rootDir, '**/dist/**')}`,
    `!${join(rootDir, '**/.angular/**')}`,
    `!${join(rootDir, '**/*.d.ts')}`,
  ]);

  const config = loadCraftDevToolsConfig(rootDir, options.configFilePath);
  const overrides = config.serviceMigration?.overrides ?? [];
  const selected = options.files?.length
    ? new Set(options.files.map((file) => resolve(rootDir, file)))
    : undefined;
  const projectSourceFiles = project.getSourceFiles().filter((file) => {
    const path = resolve(file.getFilePath());
    return isInside(path, rootDir);
  });
  const sourceFiles = projectSourceFiles.filter(
    (file) => !selected || selected.has(resolve(file.getFilePath())),
  );
  const diagnostics: ServiceMigrationDiagnostic[] = [];
  const descriptors = sourceFiles.flatMap((sourceFile) =>
    sourceFile
      .getClasses()
      .filter(isLegacyServiceClass)
      .map((classDeclaration) =>
        describeService(classDeclaration, overrides, rootDir, diagnostics),
      ),
  );
  inferFunctionScopes(descriptors, projectSourceFiles);
  diagnoseCycles(descriptors, diagnostics);

  for (const descriptor of descriptors) {
    if (descriptor.strategy === 'ignore') continue;
    const unsafe =
      getUnsafeReason(descriptor) ??
      getUnsupportedExternalDependency(descriptor, descriptors);
    if (!unsafe) continue;
    diagnose(diagnostics, unsafe.code, descriptor, unsafe.message);
    descriptor.strategy = 'ignore';
  }
  let skippedDependency: boolean;
  do {
    skippedDependency = false;
    for (const descriptor of descriptors) {
      if (descriptor.strategy === 'ignore') continue;
      const unsafe = getUnsupportedExternalDependency(descriptor, descriptors);
      if (!unsafe) continue;
      diagnose(diagnostics, unsafe.code, descriptor, unsafe.message);
      descriptor.strategy = 'ignore';
      skippedDependency = true;
    }
  } while (skippedDependency);

  const files = new Map<string, MigratedServiceFile>();
  const touched = new Set<SourceFile>();
  for (const descriptor of descriptors) {
    const file = descriptor.sourceFile;
    const report = getFileReport(files, file.getFilePath());
    report.symbols.push(descriptor.symbol);
    if (descriptor.strategy === 'ignore') continue;
    migrateSimpleClass(descriptor, descriptors, diagnostics);
    touched.add(file);
  }

  rewriteConsumers(sourceFiles, descriptors, diagnostics, touched);
  rewriteHttpOperationSubscribers(sourceFiles, descriptors, diagnostics, touched);
  annotateRemainingExplicitSubscribes(sourceFiles, diagnostics, touched);
  rewriteProviders(sourceFiles, descriptors, diagnostics, touched);
  const eslintConfig = migrateEslintConfig(project, dirname(tsConfigFilePath));
  if (eslintConfig) touched.add(eslintConfig);
  for (const file of touched) {
    if (file === eslintConfig) file.formatText();
    else file.organizeImports();
    getFileReport(files, file.getFilePath()).changed = true;
  }

  if (options.write) {
    await Promise.all([...touched].map((file) => file.save()));
  }
  let eslintRan = false;
  if (options.write && options.eslint !== false && touched.size > 0) {
    await runEslint(
      [...touched].map((file) => file.getFilePath()),
      rootDir,
    );
    eslintRan = true;
  }

  const remainingLegacyServices = options.write
    ? project
        .getSourceFiles()
        .reduce(
          (count, file) =>
            count + file.getClasses().filter(isLegacyServiceClass).length,
          0,
        )
    : descriptors.length;
  const result: MigrateServicesResult = {
    changedFiles: [...touched].map((file) => file.getFilePath()),
    files: [...files.values()],
    diagnostics,
    remainingLegacyServices,
    eslintRan,
    exitCode:
      (options.check && remainingLegacyServices > 0) ||
      (options.failOnManual && diagnostics.length > 0)
        ? 1
        : 0,
  };
  if (options.jsonFilePath) {
    const path = resolve(options.jsonFilePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  const log = options.log ?? console.log;
  if (options.json) log(JSON.stringify(result, null, 2));
  else logSummary(result, log, options.write === true);
  return result;
}

function describeService(
  classDeclaration: ClassDeclaration,
  overrides: readonly ServiceMigrationOverride[],
  rootDir: string,
  diagnostics: ServiceMigrationDiagnostic[],
): ServiceDescriptor {
  const sourceFile = classDeclaration.getSourceFile();
  const symbol = classDeclaration.getNameOrThrow();
  const module = relative(rootDir, sourceFile.getFilePath()).replace(
    /\\/g,
    '/',
  );
  const override = [...overrides]
    .reverse()
    .find(
      (candidate) =>
        (!candidate.file || matches(candidate.file, module)) &&
        (!candidate.module || matches(candidate.module, module)) &&
        (!candidate.symbol || candidate.symbol === symbol),
    );
  const decorator = classDeclaration
    .getDecorators()
    .find((item) => ['Injectable', 'Service'].includes(item.getName()))!;
  const argument = decorator.getArguments()[0];
  const text = argument?.getText() ?? '';
  let scope: ServiceMigrationScope;
  if (classDeclaration.isAbstract()) scope = 'abstract';
  else if (
    decorator.getName() === 'Service' &&
    !/autoProvided\s*:\s*false/.test(text)
  )
    scope = 'global';
  else if (/providedIn\s*:\s*['"]root['"]/.test(text)) scope = 'global';
  else if (/providedIn\s*:/.test(text)) {
    scope = 'toProvide';
    diagnose(
      diagnostics,
      'UNSUPPORTED_PROVIDED_IN',
      { sourceFile, symbol } as ServiceDescriptor,
      `providedIn de ${symbol} n'est pas transposable automatiquement.`,
    );
  } else scope = 'toProvide';
  return {
    classDeclaration,
    sourceFile,
    symbol,
    name: override?.name ?? (symbol.replace(/Service$/, '') || symbol),
    scope: override?.providedIn ?? scope,
    strategy: override?.strategy ?? 'craftService',
    override,
  };
}

function inferFunctionScopes(
  descriptors: readonly ServiceDescriptor[],
  sourceFiles: readonly SourceFile[],
): void {
  const runtimeFiles = sourceFiles.filter((file) => !isTestFile(file));
  for (const descriptor of descriptors) {
    if (
      descriptor.scope !== 'toProvide' ||
      descriptor.override?.providedIn ||
      descriptor.strategy !== 'craftService' ||
      getUnsafeReason(descriptor)
    )
      continue;
    const injectionSites = runtimeFiles.flatMap((file) =>
      collectInjectionSites(file, descriptor.symbol),
    );
    if (injectionSites.length === 1 && injectionSites[0]?.componentOwned)
      descriptor.scope = 'function';
  }
}

function collectInjectionSites(
  file: SourceFile,
  symbol: string,
): { node: Node; componentOwned: boolean }[] {
  const sites: { node: Node; componentOwned: boolean }[] = [];
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (
      call.getExpression().getText() !== 'inject' ||
      call.getArguments()[0]?.getText() !== symbol
    )
      continue;
    const owner = call.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    sites.push({
      node: call,
      componentOwned: Boolean(owner && isComponentOwnedClass(owner)),
    });
  }
  for (const parameter of file.getDescendantsOfKind(
    SyntaxKind.Parameter,
  )) {
    if (parameter.getTypeNode()?.getText() !== symbol) continue;
    const constructorDeclaration = parameter.getFirstAncestorByKind(
      SyntaxKind.Constructor,
    );
    const owner = parameter.getFirstAncestorByKind(
      SyntaxKind.ClassDeclaration,
    );
    if (constructorDeclaration)
      sites.push({
        node: parameter,
        componentOwned: Boolean(owner && isComponentOwnedClass(owner)),
      });
  }
  return sites;
}

function isComponentOwnedClass(value: ClassDeclaration): boolean {
  return value
    .getDecorators()
    .some((decorator) =>
      ['Component', 'Directive'].includes(decorator.getName()),
    );
}

function isTestFile(file: SourceFile): boolean {
  return /\.(?:spec|test)\.ts$/.test(file.getFilePath());
}

function getUnsafeReason(
  descriptor: ServiceDescriptor,
): { code: ServiceMigrationDiagnosticCode; message: string } | undefined {
  const value = descriptor.classDeclaration;
  if (value.getExtends())
    return {
      code: 'NON_CONVERTIBLE_CLASS',
      message: `${descriptor.symbol} utilise l'héritage.`,
    };
  if (value.getImplements().length)
    return {
      code: 'FRAMEWORK_CONTRACT',
      message: `${descriptor.symbol} implémente un contrat de framework.`,
    };
  if (value.getGetAccessors().length || value.getSetAccessors().length)
    return {
      code: 'NON_CONVERTIBLE_CLASS',
      message: `${descriptor.symbol} contient des accesseurs.`,
    };
  if (value.getConstructors().some(hasUnsafeConstructorLogic))
    return {
      code: 'NON_CONVERTIBLE_CLASS',
      message: `${descriptor.symbol} contient de la logique constructeur.`,
    };
  if (value.getMethods().some((method) => /^ng[A-Z]/.test(method.getName())))
    return {
      code: 'LIFECYCLE_HOOK',
      message: `${descriptor.symbol} contient un lifecycle Angular.`,
    };
  if (
    value
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText() === 'injectAsync')
  )
    return {
      code: 'INJECT_ASYNC',
      message: `${descriptor.symbol} utilise injectAsync().`,
    };
  if (
    value
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some(hasInjectionFlags)
  )
    return {
      code: 'INJECTION_FLAGS',
      message: `${descriptor.symbol} utilise des flags d'injection.`,
    };
  return undefined;
}

function getUnsupportedExternalDependency(
  descriptor: ServiceDescriptor,
  descriptors: readonly ServiceDescriptor[],
): { code: ServiceMigrationDiagnosticCode; message: string } | undefined {
  const knownServices = new Set(descriptors.map((item) => item.symbol));
  const tokens = new Set<string>();
  for (const parameter of descriptor.classDeclaration
    .getConstructors()
    .flatMap((constructor) => constructor.getParameters())) {
    const token = parameter.getTypeNode()?.getText();
    if (token) tokens.add(token);
  }
  for (const property of descriptor.classDeclaration.getProperties()) {
    const initializer = property.getInitializer();
    if (
      initializer &&
      Node.isCallExpression(initializer) &&
      initializer.getExpression().getText() === 'inject'
    ) {
      const token = initializer.getArguments()[0]?.getText();
      if (token) tokens.add(token);
    }
  }

  for (const token of tokens) {
    const dependency = descriptors.find((item) => item.symbol === token);
    if (dependency?.strategy === 'ignore') {
      return {
        code: 'NON_CONVERTIBLE_CLASS',
        message: `${descriptor.symbol} dépend de ${token}, qui nécessite une réécriture manuelle.`,
      };
    }
    if (knownServices.has(token) || token === 'Router') continue;
    if (token === 'HttpClient') {
      const operations = collectHttpOperations(descriptor);
      const injectedNames = descriptor.classDeclaration
        .getConstructors()
        .flatMap((constructor) => constructor.getParameters())
        .filter((parameter) => parameter.getTypeNode()?.getText() === token)
        .map((parameter) => parameter.getName());
      for (const property of descriptor.classDeclaration.getProperties()) {
        const initializer = property.getInitializer();
        if (
          initializer &&
          Node.isCallExpression(initializer) &&
          initializer.getExpression().getText() === 'inject' &&
          initializer.getArguments()[0]?.getText() === token
        ) {
          injectedNames.push(property.getName());
        }
      }
      const hasUnmigratedUsage = injectedNames.some((name) =>
          hasHttpClientUsageOutsideMigratedMethods(
            descriptor.classDeclaration,
            name,
            operations,
          ),
        );
      if (!hasUnmigratedUsage) continue;
      return {
        code: 'HTTP_CLIENT_REWRITE_REQUIRED',
        message: `${descriptor.symbol} conserve des appels HttpClient impératifs; migrez-les vers mutation/CraftHttpClient avant de convertir le service.`,
      };
    }
    return {
      code: 'THIRD_PARTY_SCOPE_REQUIRED',
      message: `${descriptor.symbol} dépend de ${token}; réécrivez cette dépendance sous forme de service Craft avant de convertir ce service.`,
    };
  }
  return undefined;
}

function hasUnsafeConstructorLogic(
  constructorDeclaration: ConstructorDeclaration,
): boolean {
  return constructorDeclaration
    .getStatements()
    .some((statement) => !isMigratableConstructorStatement(statement));
}

function isMigratableConstructorStatement(statement: Node): boolean {
  if (!Node.isExpressionStatement(statement)) return false;
  const expression = statement.getExpression();
  if (!Node.isCallExpression(expression)) return false;
  return ['effect'].includes(expression.getExpression().getText());
}

function migrateSimpleClass(
  descriptor: ServiceDescriptor,
  all: readonly ServiceDescriptor[],
  diagnostics: ServiceMigrationDiagnostic[],
): void {
  const value = descriptor.classDeclaration;
  const file = descriptor.sourceFile;
  const yields: string[] = [];
  const declarations: string[] = [];
  const exposed: string[] = [];
  let hasTrackedPrimitive = false;
  migrateHttpResources(descriptor, diagnostics);
  const httpOperations = collectHttpOperations(descriptor);
  descriptor.httpOperations = httpOperations;
  const propertyNames = new Set(value.getProperties().map((property) => property.getName()));
  for (const parameter of value
    .getConstructors()
    .flatMap((ctor) => ctor.getParameters())) {
    const token = parameter.getTypeNode()?.getText();
    if (!token) continue;
    if (
      token === 'HttpClient' &&
      !hasHttpClientUsageOutsideMigratedMethods(
        value,
        parameter.getName(),
        httpOperations,
      )
    )
      continue;
    yields.push(
      makeYield(toInternalName(parameter.getName()), token, descriptor, all),
    );
  }
  for (const property of value.getProperties()) {
    const name = property.getName();
    const internalName = toInternalName(name);
    const initializer = property.getInitializer();
    if (!initializer) {
      diagnose(
        diagnostics,
        'NON_CONVERTIBLE_CLASS',
        descriptor,
        `La propriété ${name} n'a pas d'initialiseur.`,
      );
      continue;
    }
    if (
      Node.isCallExpression(initializer) &&
      initializer.getExpression().getText() === 'inject'
    ) {
      const token = initializer.getArguments()[0]?.getText();
      if (
        token === 'HttpClient' &&
        !hasHttpClientUsageOutsideMigratedMethods(value, name, httpOperations)
      )
        continue;
      if (token)
        yields.push(makeYield(internalName, token, descriptor, all));
    } else {
      const shouldYield = isPrimitiveCreation(initializer);
      if (shouldYield) {
        hasTrackedPrimitive = true;
      }
      const imperativeStateComment = property
        .getFullText()
        .includes('CRAFT_IMPERATIVE_CODE_DETECTED')
        ? '// CRAFT_IMPERATIVE_CODE_DETECTED: imperative code detected, prefer a declarative approach.\n'
        : '';
      declarations.push(
        `${imperativeStateComment}const ${internalName} = ${shouldYield ? 'yield* ' : ''}${rewriteThis(initializer.getText(), propertyNames)};`,
      );
    }
    if (
      property.getScope() !== 'private' &&
      property.getScope() !== 'protected'
    )
      exposed.push(`${name}: ${internalName}`);
  }
  for (const constructorStatement of value
    .getConstructors()
    .flatMap((ctor) => ctor.getStatements())) {
    declarations.push(`${rewriteThis(constructorStatement.getText(), propertyNames)}`);
  }
  for (const method of value.getMethods()) {
    const name = method.getName();
    const httpOperation = httpOperations.find(
      (operation) => operation.methodName === name,
    );
    if (httpOperation) {
      declarations.push(printHttpOperationGenerator(httpOperation));
      if (method.getScope() !== 'private' && method.getScope() !== 'protected')
        exposed.push(name);
      ensureCoreImports(file, ['CraftHttpClient']);
      continue;
    }
    const asyncKeyword = method.isAsync() ? 'async ' : '';
    const star = method.isGenerator() ? '*' : '';
    const typeParameters = method.getTypeParameters().map((parameter) => parameter.getText()).join(', ');
    const params = method
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(', ');
    const containsMigratedQuery = method.getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText() === 'query');
    const returnType = containsMigratedQuery ? undefined : method.getReturnTypeNode()?.getText();
    const body = method.getBodyText() ?? '';
    const imperativeWorkflowComment = getImperativeWorkflowComment(method);
    if (imperativeWorkflowComment) {
      diagnose(
        diagnostics,
        'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW',
        descriptor,
        `${descriptor.name}.${name} orchestre impérativement un submit, plusieurs mises à jour d'état et/ou une navigation. Préférer insertFormSubmit avec une réaction au statut du formulaire, ou source$ avec on$/effect.`,
      );
    }
    declarations.push(
      `${imperativeWorkflowComment ? `${imperativeWorkflowComment}\n` : ''}${asyncKeyword}function${star} ${name}${typeParameters ? `<${typeParameters}>` : ''}(${params})${returnType ? `: ${returnType}` : ''} {${rewriteThis(body, propertyNames)}}`,
    );
    if (method.getScope() !== 'private' && method.getScope() !== 'protected')
      exposed.push(name);
  }
  const contract = `{ ${value
    .getMethods()
    .filter(
      (method) =>
        method.getScope() !== 'private' && method.getScope() !== 'protected',
    )
    .map(
      (method) =>
        `${method.getName()}(${method
          .getParameters()
          .map((parameter) => parameter.getText())
          .join(
            ', ',
          )}): ${method.getReturnTypeNode()?.getText() ?? 'unknown'};`,
    )
    .join(' ')} }`;
  const factory =
    descriptor.scope === 'abstract'
      ? `abstract<${contract}>()`
      : `${yields.length > 0 || hasTrackedPrimitive ? 'function*' : 'function'} () {\n${[...yields, ...declarations].map((line) => `  ${line}`).join('\n')}\n  return { ${exposed.join(', ')} };\n}`;
  const helpers =
    descriptor.scope === 'abstract'
      ? `${descriptor.name}Requirement, ${descriptor.name}, provide${descriptor.name}`
      : `${descriptor.name}${isProviderCapableScope(descriptor.scope) ? `, provide${descriptor.name}` : ''}`;
  const typeAlias =
    descriptor.scope === 'abstract'
      ? `\nexport type ${descriptor.symbol} = ${contract};`
      : `\nexport type ${descriptor.symbol} = GetServiceOutput<typeof ${descriptor.name}>;`;
  value.replaceWithText(
    `export const { ${helpers} } = craftService({ name: '${descriptor.name}', providedIn: '${descriptor.scope}' }, ${factory});${typeAlias}`,
  );
  ensureCoreImports(file, [
    'craftService',
    ...(descriptor.scope === 'abstract' ? [] : ['GetServiceOutput']),
    ...(descriptor.scope === 'abstract' ? ['abstract'] : []),
  ]);
  removeDecoratorImport(file, 'Injectable');
  removeDecoratorImport(file, 'Service');
}

function getImperativeWorkflowComment(
  method: MethodDeclaration,
): string | undefined {
  const calls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
  const hasSubmit = calls.some((call) => {
    const expression = call.getExpression();
    return (
      expression.getText() === 'submit' ||
      (Node.isPropertyAccessExpression(expression) &&
        expression.getName() === 'submit')
    );
  });
  if (!hasSubmit) return undefined;

  const stateWrites = calls.filter((call) => {
    const expression = call.getExpression();
    return (
      Node.isPropertyAccessExpression(expression) &&
      ['set', 'update'].includes(expression.getName())
    );
  }).length;
  const hasNavigation = calls.some((call) => {
    const expression = call.getExpression();
    return (
      Node.isPropertyAccessExpression(expression) &&
      ['navigate', 'navigateByUrl'].includes(expression.getName())
    );
  });
  if (stateWrites < 2 && !(stateWrites >= 1 && hasNavigation))
    return undefined;

  return '// CRAFT_REACTIVE_WORKFLOW_RECOMMENDED: workflow impératif détecté...';
}

// The generator primitives must always be consumed with `yield*` inside the
// service factory so their dependency map folds into the service tree.
function isPrimitiveCreation(initializer: Node): boolean {
  return (
    Node.isCallExpression(initializer) &&
    ['query', 'mutation', 'asyncProcess', 'state', 'queryParams'].includes(
      initializer.getExpression().getText(),
    )
  );
}

function migrateHttpResources(
  descriptor: ServiceDescriptor,
  diagnostics: ServiceMigrationDiagnostic[],
): void {
  const calls = descriptor.classDeclaration
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getText() === 'httpResource');
  for (const call of calls) {
    const params = call.getArguments()[0];
    if (!params) continue;
    let paramsText = params.getText();
    const chainedNames = [
      ...paramsText.matchAll(/\bchain\(\s*([A-Za-z_$][\w$]*)\s*\)/g),
    ].map((match) => match[1]);
    if (/\bchain\s*\(/.test(paramsText)) {
      const rewritten = paramsText
        .replace(/\(\s*\{\s*chain\s*\}\s*\)\s*=>/, '() =>')
        .replace(/\bchain\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;/g, '$1.value();');
      if (/\bchain\s*\(/.test(rewritten)) {
        diagnose(
          diagnostics,
          'RESOURCE_CHAIN_REQUIRES_REWRITE',
          descriptor,
          'httpResource utilise une forme complexe de chain(...); la dépendance entre queries doit être migrée manuellement.',
        );
        continue;
      }
      paramsText = rewritten;
      const methodDeclaration = call.getFirstAncestorByKind(
        SyntaxKind.MethodDeclaration,
      );
      for (const name of chainedNames) {
        methodDeclaration
          ?.getParameter(name)
          ?.setType('{ readonly value: () => unknown }');
      }
    }
    const stateType = call.getTypeArguments()[0]?.getText() ?? 'unknown';
    const optionsNode = call.getArguments()[1];
    const options = Node.isObjectLiteralExpression(optionsNode)
      ? optionsNode
          .getProperties()
          .map((property) => property.getText())
          .join(',\n  ')
      : optionsNode
        ? `...${optionsNode.getText()}`
        : '';
    const method =
      /\bmethod\s*:\s*['"]([A-Za-z]+)['"]/.exec(paramsText)?.[1]?.toUpperCase() ??
      'GET';
    call.replaceWithText(`query({
  params: ${paramsText},
  ${options ? `${options},` : ''}
  loader: function* ({ params: request }) {
    return yield* CraftHttpClient.request(({ response }) => ({
      ...(typeof request === 'string' ? { url: request } : request),
      method: '${method}',
      success: response<${stateType}>(),
    }));
  },
}, ({ set, update }) => ({ set, update }))`);
    ensureCoreImports(descriptor.sourceFile, ['CraftHttpClient', 'query']);
  }
}

function collectHttpOperations(
  descriptor: ServiceDescriptor,
): HttpOperationDescriptor[] {
  return descriptor.classDeclaration
    .getMethods()
    .map((method) => collectHttpOperation(method))
    .filter((operation): operation is HttpOperationDescriptor =>
      Boolean(operation),
    );
}

function collectHttpOperation(
  method: MethodDeclaration,
): HttpOperationDescriptor | undefined {
  const body = method.getBody();
  const statements = body && Node.isBlock(body) ? body.getStatements() : [];
  if (statements.length !== 1) return undefined;
  const statement = statements[0];
  if (!Node.isReturnStatement(statement)) return undefined;
  const expression = statement.getExpression();
  if (!Node.isCallExpression(expression)) return undefined;
  const access = expression.getExpression();
  if (!Node.isPropertyAccessExpression(access)) return undefined;
  const httpMethod = access.getName();
  if (!isWritableHttpMethod(httpMethod)) return undefined;
  if (!looksLikeHttpClientReceiver(access.getExpression().getText()))
    return undefined;
  const args = expression.getArguments();
  const urlText = args[0]?.getText();
  if (!urlText) return undefined;
  const payloadText =
    httpMethod === 'delete' ? undefined : (args[1]?.getText() ?? '{}');
  const responseType = expression.getTypeArguments()[0]?.getText() ?? 'unknown';
  const typeParametersText = method
    .getTypeParameters()
    .map((parameter) => parameter.getText())
    .join(', ');
  const parametersText = method
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(', ');
  return {
    methodName: method.getName(),
    httpMethod,
    responseType,
    urlText,
    payloadText,
    parameterCount: method.getParameters().length,
    typeParametersText,
    parametersText,
  };
}

function isWritableHttpMethod(
  value: string,
): value is HttpOperationDescriptor['httpMethod'] {
  return ['post', 'put', 'patch', 'delete'].includes(value);
}

function looksLikeHttpClientReceiver(value: string): boolean {
  return /(^|\.|_)http(Client)?$/i.test(value);
}

function printHttpOperationGenerator(operation: HttpOperationDescriptor): string {
  const payload =
    operation.payloadText === undefined
      ? ''
      : `\n      payload: ${operation.payloadText},`;
  return `function* ${operation.methodName}${operation.typeParametersText ? `<${operation.typeParametersText}>` : ''}(${operation.parametersText}) {
  return yield* CraftHttpClient.${operation.httpMethod}(({ response }) => ({
    url: ${operation.urlText},${payload}
    success: response<${operation.responseType}>(),
  }));
}`;
}

function hasHttpClientUsageOutsideMigratedMethods(
  serviceClass: ClassDeclaration,
  localName: string,
  operations: readonly HttpOperationDescriptor[],
): boolean {
  const migratedMethods = new Set(
    operations.map((operation) => operation.methodName),
  );
  return serviceClass.getMethods().some((method) => {
    if (migratedMethods.has(method.getName())) return false;
    const text = method.getBodyText() ?? '';
    return (
      new RegExp(`\\bthis\\.${escapeRegex(localName)}\\b`).test(text) ||
      new RegExp(`\\b${escapeRegex(localName)}\\s*\\.`).test(text)
    );
  });
}

function makeYield(
  localName: string,
  token: string,
  owner: ServiceDescriptor,
  all: readonly ServiceDescriptor[],
): string {
  const dependency = all.find((item) => item.symbol === token);
  if (token === 'Router') {
    ensureCoreImports(owner.sourceFile, ['CraftRouter']);
    return `const ${localName} = yield* CraftRouter();`;
  }
  if (!dependency) {
    throw new Error(
      `Migration guard failed: unsupported dependency ${token} in ${owner.symbol}.`,
    );
  }
  ensureRelativeImport(
    owner.sourceFile,
    dependency,
    dependency.name,
  );
  return `const ${localName} = yield* ${dependency.name}();`;
}

function rewriteConsumers(
  files: readonly SourceFile[],
  descriptors: readonly ServiceDescriptor[],
  diagnostics: ServiceMigrationDiagnostic[],
  touched: Set<SourceFile>,
): void {
  for (const file of files) {
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (call.wasForgotten() || call.getExpression().getText() !== 'inject')
        continue;
      const token = call.getArguments()[0]?.getText();
      const service = descriptors.find((item) => item.symbol === token);
      if (!service || service.strategy === 'ignore') continue;
      call.replaceWithText(`inject${service.name}()`);
      ensureRelativeImport(file, service, `inject${service.name}`);
      touched.add(file);
    }
  }
}

function rewriteHttpOperationSubscribers(
  files: readonly SourceFile[],
  descriptors: readonly ServiceDescriptor[],
  diagnostics: ServiceMigrationDiagnostic[],
  touched: Set<SourceFile>,
): void {
  for (const file of files) {
    for (const classDeclaration of file.getClasses()) {
      const injectedServices = collectInjectedCraftServices(
        classDeclaration,
        descriptors,
      );
      if (injectedServices.size === 0) continue;
      for (const subscribeCall of [
        ...classDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression),
      ]) {
        if (subscribeCall.wasForgotten()) continue;
        const subscribeAccess = subscribeCall.getExpression();
        if (
          !Node.isPropertyAccessExpression(subscribeAccess) ||
          subscribeAccess.getName() !== 'subscribe'
        )
          continue;
        const operationCall = subscribeAccess.getExpression();
        if (!Node.isCallExpression(operationCall)) continue;
        const operationAccess = operationCall.getExpression();
        if (!Node.isPropertyAccessExpression(operationAccess)) continue;
        const receiverName = readReceiverPropertyName(
          operationAccess.getExpression().getText(),
        );
        if (!receiverName) continue;
        const service = injectedServices.get(receiverName);
        if (!service) continue;
        const operation = service.httpOperations?.find(
          (item) => item.methodName === operationAccess.getName(),
        );
        if (!operation) continue;
        if (
          subscribeCall.getArguments().length > 0 ||
          operation.parameterCount === 0
        ) {
          diagnose(
            diagnostics,
            'MUTATION_SUBSCRIBE_REQUIRES_REWRITE',
            { ...service, sourceFile: file },
            `${service.name}.${operation.methodName} est un appel HTTP mutable avec subscribe complexe; créer une mutation locale et migrer les callbacks manuellement.`,
          );
          continue;
        }
        const mutationName = ensureLocalMutationProperty(
          classDeclaration,
          service,
          operation,
        );
        subscribeCall.replaceWithText(
          printMutationCall(mutationName, operationCall),
        );
        ensureCoreImports(file, ['mutation']);
        ensureRelativeImport(file, service, service.name);
        touched.add(file);
      }
    }
  }
}

const EXPLICIT_SUBSCRIBE_REVIEW_COMMENT =
  '// CRAFT_EXPLICIT_SUBSCRIBE_REVIEW: subscribe explicite conservé; vérifier si query, mutation, asyncProcess ou le couple source$/on$ permet un workflow Craft déclaratif.';

function annotateRemainingExplicitSubscribes(
  files: readonly SourceFile[],
  diagnostics: ServiceMigrationDiagnostic[],
  touched: Set<SourceFile>,
): void {
  for (const file of files) {
    const statements = new Set<Node>();
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (
        !Node.isPropertyAccessExpression(expression) ||
        expression.getName() !== 'subscribe'
      )
        continue;
      const statement = call.getFirstAncestor(
        (ancestor) =>
          Node.isExpressionStatement(ancestor) ||
          Node.isReturnStatement(ancestor) ||
          Node.isVariableStatement(ancestor),
      );
      if (statement) statements.add(statement);
    }
    if (statements.size === 0) continue;

    let annotated = false;
    for (const statement of [...statements].sort(
      (left, right) => right.getStart() - left.getStart(),
    )) {
      if (
        statement.wasForgotten() ||
        statement.getFullText().includes('CRAFT_EXPLICIT_SUBSCRIBE_REVIEW')
      )
        continue;
      statement.replaceWithText(
        `${EXPLICIT_SUBSCRIBE_REVIEW_COMMENT}\n${statement.getText()}`,
      );
      annotated = true;
    }
    if (!annotated) continue;
    diagnostics.push({
      code: 'EXPLICIT_SUBSCRIBE_REQUIRES_REVIEW',
      filePath: file.getFilePath(),
      message:
        'Un subscribe explicite reste à migrer; évaluer query, mutation, asyncProcess ou le couple source$/on$ selon le cycle de vie de l’opération.',
      manual: true,
    });
    touched.add(file);
  }
}

function collectInjectedCraftServices(
  classDeclaration: ClassDeclaration,
  descriptors: readonly ServiceDescriptor[],
): Map<string, ServiceDescriptor> {
  const byInjectHelper: Map<string, ServiceDescriptor> = new Map(
    descriptors.filter((descriptor) => descriptor.strategy !== 'ignore').map((descriptor) => [
      `inject${descriptor.name}`,
      descriptor,
    ] as const),
  );
  const result = new Map<string, ServiceDescriptor>();
  for (const property of classDeclaration.getProperties()) {
    const initializer = property.getInitializer();
    if (
      !initializer ||
      !Node.isCallExpression(initializer) ||
      !Node.isIdentifier(initializer.getExpression())
    )
      continue;
    const service = byInjectHelper.get(initializer.getExpression().getText());
    if (service) result.set(property.getName(), service);
  }
  return result;
}

function readReceiverPropertyName(text: string): string | undefined {
  const match = /^(?:this\.)?([A-Za-z_$][\w$]*)$/.exec(text.trim());
  return match?.[1];
}

function ensureLocalMutationProperty(
  classDeclaration: ClassDeclaration,
  service: ServiceDescriptor,
  operation: HttpOperationDescriptor,
): string {
  const baseName = `${operation.methodName}Mutation`;
  const mutationName = uniqueClassPropertyName(classDeclaration, baseName);
  if (classDeclaration.getProperty(mutationName)) return mutationName;
  const paramsType = `Parameters<GetServiceOutput<typeof ${service.name}>['${operation.methodName}']>`;
  const method =
    operation.parameterCount === 1
      ? `(params: ${paramsType}[0]) => params`
      : `(params: ${paramsType}) => params`;
  const call =
    operation.parameterCount === 1
      ? `${toLocalServiceName(service.name)}.${operation.methodName}(params)`
      : `${toLocalServiceName(service.name)}.${operation.methodName}(...params)`;
  classDeclaration.insertProperty(0, {
    name: mutationName,
    isReadonly: true,
    initializer: `mutation({
  method: ${method},
  loader: function* ({ params }) {
    const ${toLocalServiceName(service.name)} = yield* ${service.name}();
    return yield* ${call};
  },
})`,
  });
  return mutationName;
}

function toLocalServiceName(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

function uniqueClassPropertyName(
  classDeclaration: ClassDeclaration,
  baseName: string,
): string {
  if (!classDeclaration.getProperty(baseName)) return baseName;
  let index = 2;
  while (classDeclaration.getProperty(`${baseName}${index}`)) index += 1;
  return `${baseName}${index}`;
}

function printMutationCall(
  mutationName: string,
  operationCall: CallExpression,
): string {
  const args = operationCall.getArguments().map((arg) => arg.getText());
  const params = args.length === 1 ? args[0] : `[${args.join(', ')}]`;
  return `this.${mutationName}.mutate(${params})`;
}

function rewriteProviders(
  files: readonly SourceFile[],
  descriptors: readonly ServiceDescriptor[],
  diagnostics: ServiceMigrationDiagnostic[],
  touched: Set<SourceFile>,
): void {
  for (const file of files) {
    const assignments = file
      .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter((property) => property.getName() === 'providers');
    for (const assignment of assignments) {
      const array = assignment.getInitializerIfKind(
        SyntaxKind.ArrayLiteralExpression,
      );
      if (!array) {
        const owner = descriptors[0];
        if (owner)
          diagnose(
            diagnostics,
            'COMPLEX_PROVIDER',
            { ...owner, sourceFile: file },
            'Provider non statique.',
          );
        continue;
      }
      for (const element of [...array.getElements()]) {
        if (!Node.isIdentifier(element)) continue;
        const service = descriptors.find(
          (item) => item.symbol === element.getText(),
        );
        if (
          !service ||
          service.strategy === 'ignore' ||
          service.scope === 'global'
        )
          continue;
        if (service.scope === 'function') {
          array.removeElement(element);
          touched.add(file);
          continue;
        }
        element.replaceWithText(`provide${service.name}()`);
        ensureRelativeImport(file, service, `provide${service.name}`);
        touched.add(file);
      }
    }
  }
}

function isProviderCapableScope(
  scope: ServiceMigrationScope,
): scope is 'toProvide' | 'manuallyProvidedAtRoot' | 'abstract' {
  return [
    'toProvide',
    'manuallyProvidedAtRoot',
    'abstract',
  ].includes(scope);
}

function diagnoseCycles(
  descriptors: readonly ServiceDescriptor[],
  diagnostics: ServiceMigrationDiagnostic[],
): void {
  const edges = new Map<string, string[]>();
  for (const descriptor of descriptors) {
    const deps = descriptor.classDeclaration
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'inject')
      .map((call) => call.getArguments()[0]?.getText())
      .filter((value): value is string => Boolean(value));
    edges.set(descriptor.symbol, deps);
  }
  for (const descriptor of descriptors) {
    if (hasPath(edges, descriptor.symbol, descriptor.symbol, new Set(), true)) {
      diagnose(
        diagnostics,
        'DI_CYCLE',
        descriptor,
        `Cycle DI impliquant ${descriptor.symbol}.`,
      );
    }
  }
}

function hasPath(
  edges: Map<string, string[]>,
  current: string,
  target: string,
  seen: Set<string>,
  first: boolean,
): boolean {
  if (!first && current === target) return true;
  if (seen.has(current)) return false;
  seen.add(current);
  return (edges.get(current) ?? []).some((next) =>
    hasPath(edges, next, target, seen, false),
  );
}

function isLegacyServiceClass(value: ClassDeclaration): boolean {
  return value
    .getDecorators()
    .some((decorator) =>
      ['Injectable', 'Service'].includes(decorator.getName()),
    );
}

function hasInjectionFlags(call: CallExpression): boolean {
  if (
    call.getExpression().getText() !== 'inject' ||
    call.getArguments().length < 2
  )
    return false;
  return /optional|self|host|skipSelf/.test(call.getArguments()[1].getText());
}

function ensureCoreImports(file: SourceFile, names: string[]): void {
  ensureNamedImports(file, '@craft-ts/core', names);
}

function ensureNamedImports(
  file: SourceFile,
  moduleSpecifier: string,
  names: string[],
): void {
  let declaration = file.getImportDeclaration(moduleSpecifier);
  if (!declaration)
    declaration = file.addImportDeclaration({
      moduleSpecifier,
    });
  const existing = new Set(
    declaration.getNamedImports().map((item) => item.getName()),
  );
  declaration.addNamedImports(names.filter((name) => !existing.has(name)));
}

function ensureRelativeImport(
  file: SourceFile,
  service: ServiceDescriptor,
  name: string,
): void {
  if (file === service.sourceFile) return;
  let specifier = relative(
    dirname(file.getFilePath()),
    service.sourceFile.getFilePath(),
  )
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  let declaration = file.getImportDeclaration(specifier);
  if (!declaration)
    declaration = file.addImportDeclaration({ moduleSpecifier: specifier });
  if (!declaration.getNamedImports().some((item) => item.getName() === name))
    declaration.addNamedImport(name);
}

function removeDecoratorImport(file: SourceFile, name: string): void {
  for (const declaration of file.getImportDeclarations()) {
    const imported = declaration
      .getNamedImports()
      .find((item) => item.getName() === name);
    if (!imported) continue;
    imported.remove();
    if (
      !declaration.getDefaultImport() &&
      !declaration.getNamespaceImport() &&
      declaration.getNamedImports().length === 0
    )
      declaration.remove();
  }
}

function diagnose(
  diagnostics: ServiceMigrationDiagnostic[],
  code: ServiceMigrationDiagnosticCode,
  descriptor: Pick<ServiceDescriptor, 'sourceFile' | 'symbol'>,
  message: string,
): void {
  if (
    diagnostics.some(
      (item) =>
        item.code === code &&
        item.filePath === descriptor.sourceFile.getFilePath() &&
        item.symbol === descriptor.symbol,
    )
  )
    return;
  diagnostics.push({
    code,
    filePath: descriptor.sourceFile.getFilePath(),
    symbol: descriptor.symbol,
    message,
    manual: true,
  });
}

function getFileReport(
  map: Map<string, MigratedServiceFile>,
  filePath: string,
): MigratedServiceFile {
  let report = map.get(filePath);
  if (!report) {
    report = { filePath, changed: false, symbols: [] };
    map.set(filePath, report);
  }
  return report;
}

function rewriteThis(text: string, propertyNames: ReadonlySet<string>): string {
  let rewritten = text;
  for (const name of propertyNames) {
    rewritten = rewritten.replace(
      new RegExp(`\\bthis\\.${escapeRegex(name)}\\b`, 'g'),
      toInternalName(name),
    );
  }
  return rewritten.replace(/\bthis\./g, '');
}

function toInternalName(name: string): string {
  return `_${name}`;
}

function matches(pattern: string, value: string): boolean {
  if (!pattern.includes('*'))
    return pattern === value || value.endsWith(pattern);
  const regex = new RegExp(
    `^${pattern.split('*').map(escapeRegex).join('.*')}$`,
  );
  return regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInside(filePath: string, rootDir: string): boolean {
  const path = relative(rootDir, filePath);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function defaultTsConfig(rootDir: string): string {
  for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
    const candidate = join(rootDir, name);
    if (existsSync(candidate)) return candidate;
  }
  return join(rootDir, 'tsconfig.json');
}

async function runEslint(files: string[], cwd: string): Promise<void> {
  const local = join(cwd, 'node_modules', '.bin', 'eslint');
  await execFileAsync(
    existsSync(local) ? local : 'eslint',
    ['--fix', ...files],
    { cwd },
  );
}

function logSummary(
  result: MigrateServicesResult,
  log: (message: string) => void,
  wrote: boolean,
): void {
  log(
    `${wrote ? 'Migrated' : 'Would migrate'} ${result.changedFiles.length} file(s); ${result.diagnostics.length} manual diagnostic(s).`,
  );
  for (const diagnostic of result.diagnostics)
    log(`[${diagnostic.code}] ${diagnostic.filePath}: ${diagnostic.message}`);
}
