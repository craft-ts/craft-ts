import {
  ArrayLiteralExpression,
  ClassDeclaration,
  Decorator,
  ExportAssignment,
  ExportDeclaration,
  Identifier,
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  TypeNode,
  ts,
} from 'ts-morph';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export type AngularKind = 'component' | 'directive' | 'pipe' | 'injectable';
export type AngularBrandMetadataContext = 'imports' | 'hostDirectives';

export type AngularBrandConfigEntry = {
  key: string;
  symbol: string;
  typeText?: string;
  module?: string;
};

export type AngularBrandImportAugmentationRule = {
  match: {
    module: string;
    symbols?: readonly string[];
    metadata?: readonly AngularBrandMetadataContext[];
  };
  deps?: readonly AngularBrandConfigEntry[];
  missingProvider?: readonly AngularBrandConfigEntry[];
};

export type AngularBrandConfig = {
  importAugmentations?: readonly AngularBrandImportAugmentationRule[];
};

export type ServiceMigrationScope =
  | 'global'
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'function'
  | 'abstract';

export type ServiceMigrationStrategy =
  | 'craftService'
  | 'toCraftService'
  | 'companion'
  | 'ignore';

export type ServiceMigrationOverride = {
  file?: string;
  module?: string;
  symbol?: string;
  name?: string;
  scope?: ServiceMigrationScope;
  strategy?: ServiceMigrationStrategy;
};

export type CraftDevToolsConfig = {
  brand?: AngularBrandConfig;
  serviceMigration?: {
    overrides?: readonly ServiceMigrationOverride[];
  };
};

export type TransformResult = {
  changed: boolean;
  skipped: boolean;
  warnings: string[];
  angularKind?: AngularKind;
  className?: string;
  dependencies: string[];
  dependencyGroups: DependencyGroups;
  generatedTypeName?: string;
  generatedDependencyGroups: GeneratedDependencyGroups;
};

export type AngularBrandCodemodOptions = {
  helperImportPath?: string;
  transformOnlyStandaloneDeclarables?: boolean;
  includeProviders?: boolean;
  includeViewProviders?: boolean;
  config?: AngularBrandConfig;
  configFilePath?: string;
};

export type AngularClassSearchResult = {
  classDeclaration?: ClassDeclaration;
  angularKind?: AngularKind;
  className?: string;
  skipped: boolean;
  warnings: string[];
};

export type DependencyExtractionResult = {
  dependencies: string[];
  warnings: string[];
};

export type DependencyGroups = {
  injected: string[];
  importDeps: string[];
  providers: string[];
};

export type GeneratedDependencyEntry = {
  key: string;
  typeText: string;
  typeImport?: {
    moduleSpecifier: string;
    name: string;
  };
};

export type GeneratedDependencyGroups = {
  deps: GeneratedDependencyEntry[];
  propertiesDeps: GeneratedDependencyEntry[];
  provided: GeneratedDependencyEntry[];
  missingProvider: GeneratedDependencyEntry[];
};

type GeneratedDependencyGroupAugmentation = {
  deps: GeneratedDependencyDescriptor[];
  missingProvider: GeneratedDependencyDescriptor[];
  legacyInjectedDependencies: GeneratedDependencyDescriptor[];
  suppressedImportDependencyTexts: Set<string>;
};

export type DependencyAnalysisResult = Omit<TransformResult, 'changed'> & {
  classDeclaration?: ClassDeclaration;
};

export type ExistingDependencyGroupsResult = {
  found: boolean;
  warnings: string[];
  dependencyGroups: DependencyGroups;
  exportAssignmentNode?: Node;
  depsObjectNode?: Node;
  propertyNodes: Partial<Record<keyof DependencyGroups, Node>>;
};

type MetadataDependencyGroups = {
  imports: string[];
  hostDirectives: string[];
  providers: string[];
  viewProviders: string[];
  occurrences: MetadataDependencyOccurrence[];
  warnings: string[];
};

type ProvidedDependencyExtractionResult = {
  entries: GeneratedDependencyEntry[];
  warnings: string[];
};

type InjectedDependencyDescriptor = {
  dependencyText: string;
  entry: GeneratedDependencyEntry;
};

type GeneratedDependencyDescriptor = {
  dependencyText: string;
  entry: GeneratedDependencyEntry;
};

type InjectCallDependencyExtractionResult = DependencyExtractionResult & {
  generatedDependencies: InjectedDependencyDescriptor[];
};

type PropertyDependencyExtractionResult = DependencyExtractionResult & {
  entries: GeneratedDependencyEntry[];
  missingProvider: GeneratedDependencyEntry[];
};

type DependencyReferenceResolution = {
  kind: 'class' | 'enum' | 'function' | 'variable' | 'namespace' | 'unknown';
  classDeclaration?: ClassDeclaration;
  moduleSpecifier?: string;
  importedName?: string;
};

type TrackedHelperResolution = {
  serviceName: string;
  scope: string;
};

type HelperExposureBinding = {
  localName: string;
  sourceKey: string;
};

type HelperExposureTracking = {
  usedProperties: string[];
  exposedProperties: Array<{
    exposedKey: string;
    sourceKey: string;
  }>;
};

type MetadataDependencyOccurrence = {
  dependencyText: string;
  symbolName: string;
  moduleSpecifier?: string;
  metadataContext: AngularBrandMetadataContext;
};

type NormalizedAngularBrandImportAugmentationRule = {
  match: {
    module: string;
    symbols?: string[];
    metadata: AngularBrandMetadataContext[];
  };
  deps: AngularBrandConfigEntry[];
  missingProvider: AngularBrandConfigEntry[];
};

type NormalizedAngularBrandConfig = {
  importAugmentations: NormalizedAngularBrandImportAugmentationRule[];
};

type NormalizedOptions = {
  helperImportPath: string;
  transformOnlyStandaloneDeclarables: boolean;
  includeProviders: boolean;
  includeViewProviders: boolean;
  config?: AngularBrandConfig;
  configFilePath?: string;
};

type InjectDecoratorTokenResult =
  | { found: false }
  | { found: true; dependency?: string };

type RunFileReport = TransformResult & {
  filePath: string;
};

export type RunSummary = {
  transformedFiles: number;
  skippedFiles: number;
  warnings: number;
  countByAngularKind: Record<AngularKind, number>;
  files: RunFileReport[];
};

const SUPPORTED_DECORATORS: Record<string, AngularKind> = {
  Component: 'component',
  Directive: 'directive',
  Pipe: 'pipe',
  Injectable: 'injectable',
};

const DEFAULT_OPTIONS: NormalizedOptions = {
  helperImportPath: '@craft-ts/core',
  transformOnlyStandaloneDeclarables: false,
  includeProviders: true,
  includeViewProviders: true,
  config: undefined,
  configFilePath: undefined,
};

const CRAFT_DEV_TOOLS_CONFIG_FILE_NAME = 'craft-dev-tools.config.ts';
const ANGULAR_BRAND_CONFIG_FILE_NAME = 'craft-brand.config.ts';
const DEFAULT_ANGULAR_BRAND_METADATA_CONTEXTS: AngularBrandMetadataContext[] = [
  'imports',
  'hostDirectives',
];
const DEFAULT_ANGULAR_BRAND_CONFIG = defineAngularBrandConfig({
  importAugmentations: [
    {
      match: {
        module: '@angular/router',
      },
      deps: [
        {
          key: 'Router',
          symbol: 'Router',
          module: '@angular/router',
        },
      ],
      missingProvider: [
        {
          key: 'Router',
          symbol: 'Router',
          module: '@angular/router',
        },
      ],
    },
    {
      match: {
        module: '@angular/forms/signals',
        symbols: ['FormField'],
        metadata: ['imports'],
      },
      deps: [
        {
          key: 'FormField',
          symbol: 'FormField',
          typeText: 'FormField<never>',
          module: '@angular/forms/signals',
        },
      ],
    },
    {
      match: {
        module: '@angular/forms/signals',
        symbols: ['FormRoot'],
        metadata: ['imports'],
      },
      deps: [
        {
          key: 'FormRoot',
          symbol: 'FormRoot',
          typeText: 'FormRoot<unknown>',
          module: '@angular/forms/signals',
        },
      ],
    },
    {
      match: {
        module: '@craft-ts/core',
        symbols: ['LegacyCraftFieldDirective'],
        metadata: ['imports'],
      },
      deps: [
        {
          key: 'LegacyCraftFieldDirective',
          symbol: 'LegacyCraftFieldDirective',
          typeText: 'LegacyCraftFieldDirective<unknown>',
          module: '@craft-ts/core',
        },
      ],
    },
    {
      match: {
        module: '@craft-ts/core',
        symbols: ['LegacyCraftRouterLink'],
        metadata: ['imports'],
      },
      deps: [
        {
          key: 'LegacyCraftRouterLink',
          symbol: 'LegacyCraftRouterLink',
          module: '@craft-ts/core',
        },
      ],
      missingProvider: [
        {
          key: 'Router',
          symbol: 'Router',
          module: '@angular/router',
        },
      ],
    },
  ],
});
const angularBrandConfigCache = new Map<string, AngularBrandConfig>();

const PRIMITIVE_TYPE_TEXTS = new Set([
  'any',
  'bigint',
  'boolean',
  'false',
  'never',
  'null',
  'number',
  'object',
  'string',
  'symbol',
  'true',
  'undefined',
  'unknown',
  'void',
  'Array',
  'Boolean',
  'Number',
  'Object',
  'ReadonlyArray',
  'String',
]);

const GENERATED_FILE_SUFFIXES = [
  '.d.ts',
  '.gen.ts',
  '.generated.ts',
  '.ngfactory.ts',
  '.ngsummary.ts',
  '.ngtypecheck.ts',
];

const IGNORED_DIRECTORIES = new Set([
  '.angular',
  '.git',
  '.nx',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'out-tsc',
  'tmp',
]);

export function defineAngularBrandConfig<Config extends AngularBrandConfig>(
  config: Config,
): Config {
  return config;
}

export function defineCraftDevToolsConfig<Config extends CraftDevToolsConfig>(
  config: Config,
): Config {
  return config;
}

function isCraftDevToolsConfig(value: unknown): value is CraftDevToolsConfig {
  return Boolean(
    value &&
      typeof value === 'object' &&
      ('brand' in value || 'serviceMigration' in value),
  );
}

export function discoverAngularBrandConfigFilePath(
  searchFromDir: string,
  stopDir?: string,
): string | undefined {
  const resolvedStopDir = stopDir ? resolve(stopDir) : undefined;
  let currentDir = resolve(searchFromDir);

  while (true) {
    for (const fileName of [
      CRAFT_DEV_TOOLS_CONFIG_FILE_NAME,
      ANGULAR_BRAND_CONFIG_FILE_NAME,
    ]) {
      const candidatePath = join(currentDir, fileName);
      if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    }

    if (resolvedStopDir && currentDir === resolvedStopDir) {
      return undefined;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export function loadAngularBrandConfigFromFile(
  configFilePath: string,
): AngularBrandConfig {
  const resolvedConfigFilePath = resolve(configFilePath);
  const cachedConfig = angularBrandConfigCache.get(resolvedConfigFilePath);
  if (cachedConfig) {
    return cachedConfig;
  }

  if (
    !existsSync(resolvedConfigFilePath) ||
    !statSync(resolvedConfigFilePath).isFile()
  ) {
    throw new Error(
      `Angular brand config file not found at "${resolvedConfigFilePath}".`,
    );
  }

  try {
    const sourceText = readFileSync(resolvedConfigFilePath, 'utf8');
    const transpiled = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      fileName: resolvedConfigFilePath,
    });
    const module = { exports: {} as Record<string, unknown> };
    const moduleRequire = createRequire(resolvedConfigFilePath);
    const compiledModule = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      transpiled.outputText,
    ) as (
      exports: Record<string, unknown>,
      require: (specifier: string) => unknown,
      module: { exports: Record<string, unknown> },
      __filename: string,
      __dirname: string,
    ) => void;

    compiledModule(
      module.exports,
      (specifier: string) => {
        if (specifier === '@craft-ts/dev-tools') {
          return { defineAngularBrandConfig, defineCraftDevToolsConfig };
        }

        return moduleRequire(specifier);
      },
      module,
      resolvedConfigFilePath,
      dirname(resolvedConfigFilePath),
    );

    const exportedConfig =
      module.exports['default'] ??
      (module.exports['__esModule']
        ? module.exports['default']
        : module.exports);
    const brandConfig = isCraftDevToolsConfig(exportedConfig)
      ? (exportedConfig.brand ?? {})
      : exportedConfig;
    const validatedConfig = validateAngularBrandConfig(
      brandConfig,
      resolvedConfigFilePath,
    );

    angularBrandConfigCache.set(resolvedConfigFilePath, validatedConfig);
    return validatedConfig;
  } catch (error: unknown) {
    throw new Error(
      `Invalid Angular brand config at "${resolvedConfigFilePath}": ${getErrorMessage(error)}`,
    );
  }
}

function resolveAngularBrandConfig(
  sourceFile: SourceFile,
  options: NormalizedOptions,
): NormalizedAngularBrandConfig {
  const explicitConfig =
    options.config ??
    (options.configFilePath
      ? loadAngularBrandConfigFromFile(options.configFilePath)
      : loadDiscoveredAngularBrandConfig(dirname(sourceFile.getFilePath())));

  return normalizeAngularBrandConfig(explicitConfig);
}

function loadDiscoveredAngularBrandConfig(
  searchFromDir: string,
  stopDir?: string,
): AngularBrandConfig | undefined {
  const discoveredConfigPath = discoverAngularBrandConfigFilePath(
    searchFromDir,
    stopDir,
  );

  return discoveredConfigPath
    ? loadAngularBrandConfigFromFile(discoveredConfigPath)
    : undefined;
}

function normalizeAngularBrandConfig(
  config?: AngularBrandConfig,
): NormalizedAngularBrandConfig {
  const builtInRules = (
    DEFAULT_ANGULAR_BRAND_CONFIG.importAugmentations ?? []
  ).map(normalizeAngularBrandImportAugmentationRule);
  const configuredRules = (config?.importAugmentations ?? []).map(
    normalizeAngularBrandImportAugmentationRule,
  );

  return {
    importAugmentations: [...builtInRules, ...configuredRules],
  };
}

function normalizeAngularBrandImportAugmentationRule(
  rule: AngularBrandImportAugmentationRule,
): NormalizedAngularBrandImportAugmentationRule {
  return {
    match: {
      module: rule.match.module,
      symbols: rule.match.symbols ? [...rule.match.symbols] : undefined,
      metadata: rule.match.metadata
        ? [...rule.match.metadata]
        : [...DEFAULT_ANGULAR_BRAND_METADATA_CONTEXTS],
    },
    deps: rule.deps ? [...rule.deps] : [],
    missingProvider: rule.missingProvider ? [...rule.missingProvider] : [],
  };
}

function validateAngularBrandConfig(
  value: unknown,
  configFilePath: string,
): AngularBrandConfig {
  if (!isPlainObject(value)) {
    throw new Error('Expected the default export to be an object.');
  }

  const importAugmentations = readOptionalArray(
    value['importAugmentations'],
    'importAugmentations',
    configFilePath,
  )?.map((entry, index) =>
    validateAngularBrandImportAugmentationRule(
      entry,
      `importAugmentations[${index}]`,
      configFilePath,
    ),
  );

  return {
    importAugmentations: importAugmentations ?? [],
  };
}

function validateAngularBrandImportAugmentationRule(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): AngularBrandImportAugmentationRule {
  if (!isPlainObject(value)) {
    throw new Error(`${pathLabel} must be an object.`);
  }

  if (!isPlainObject(value['match'])) {
    throw new Error(`${pathLabel}.match must be an object.`);
  }

  const match = value['match'];

  const moduleSpecifier = readRequiredString(
    match['module'],
    `${pathLabel}.match.module`,
    configFilePath,
  );
  const symbols = readOptionalStringArray(
    match['symbols'],
    `${pathLabel}.match.symbols`,
    configFilePath,
  );
  const metadata =
    readOptionalStringArray(
      match['metadata'],
      `${pathLabel}.match.metadata`,
      configFilePath,
    )?.map((context) =>
      validateAngularBrandMetadataContext(context, pathLabel),
    ) ?? undefined;

  return {
    match: {
      module: moduleSpecifier,
      symbols,
      metadata,
    },
    deps:
      readOptionalArray(
        value['deps'],
        `${pathLabel}.deps`,
        configFilePath,
      )?.map((entry, index) =>
        validateAngularBrandConfigEntry(
          entry,
          `${pathLabel}.deps[${index}]`,
          configFilePath,
        ),
      ) ?? [],
    missingProvider:
      readOptionalArray(
        value['missingProvider'],
        `${pathLabel}.missingProvider`,
        configFilePath,
      )?.map((entry, index) =>
        validateAngularBrandConfigEntry(
          entry,
          `${pathLabel}.missingProvider[${index}]`,
          configFilePath,
        ),
      ) ?? [],
  };
}

function validateAngularBrandConfigEntry(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): AngularBrandConfigEntry {
  if (!isPlainObject(value)) {
    throw new Error(`${pathLabel} must be an object.`);
  }

  const key = readRequiredString(
    value['key'],
    `${pathLabel}.key`,
    configFilePath,
  );
  const symbol = readRequiredString(
    value['symbol'],
    `${pathLabel}.symbol`,
    configFilePath,
  );
  const typeText = readOptionalString(
    value['typeText'],
    `${pathLabel}.typeText`,
    configFilePath,
  );
  const moduleSpecifier = readOptionalString(
    value['module'],
    `${pathLabel}.module`,
    configFilePath,
  );

  return {
    key,
    symbol,
    typeText,
    module: moduleSpecifier,
  };
}

function validateAngularBrandMetadataContext(
  value: string,
  pathLabel: string,
): AngularBrandMetadataContext {
  if (value === 'imports' || value === 'hostDirectives') {
    return value;
  }

  throw new Error(
    `${pathLabel}.match.metadata must contain only "imports" or "hostDirectives".`,
  );
}

function readOptionalArray(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${pathLabel} in "${configFilePath}" must be an array.`);
  }

  return value;
}

function readRequiredString(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): string {
  const stringValue = readOptionalString(value, pathLabel, configFilePath);
  if (!stringValue) {
    throw new Error(`${pathLabel} in "${configFilePath}" must be a string.`);
  }

  return stringValue;
}

function readOptionalString(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${pathLabel} in "${configFilePath}" must be a string.`);
  }

  return value;
}

function readOptionalStringArray(
  value: unknown,
  pathLabel: string,
  configFilePath: string,
): string[] | undefined {
  const arrayValue = readOptionalArray(value, pathLabel, configFilePath);
  if (!arrayValue) {
    return undefined;
  }

  return arrayValue.map((entry, index) =>
    readRequiredString(entry, `${pathLabel}[${index}]`, configFilePath),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function transformSourceFile(
  sourceFile: SourceFile,
  options: AngularBrandCodemodOptions = {},
): TransformResult {
  const normalizedOptions = normalizeOptions(options);
  const analysis = analyzeSourceFileDependencies(sourceFile, options);
  const result: TransformResult = {
    ...analysis,
    changed: false,
  };

  const { angularKind, classDeclaration, className } = analysis;

  if (analysis.skipped || !classDeclaration || !angularKind || !className) {
    return result;
  }

  const importSafety = getHelperImportSafety(
    sourceFile,
    normalizedOptions.helperImportPath,
  );
  if (!importSafety.safe) {
    return skip(result, importSafety.warnings);
  }

  const beforeText = sourceFile.getFullText();

  migrateLegacyBrandExport(sourceFile, classDeclaration, className);
  ensureHelperImports(sourceFile, normalizedOptions.helperImportPath);
  ensureGeneratedDependencyTypeImports(
    sourceFile,
    result.generatedDependencyGroups,
  );
  writeGeneratedDepsTypeAlias(
    sourceFile,
    angularKind,
    className,
    result.generatedDependencyGroups,
  );
  sourceFile.organizeImports();

  result.changed = sourceFile.getFullText() !== beforeText;
  return result;
}

export function analyzeSourceFileDependencies(
  sourceFile: SourceFile,
  options: AngularBrandCodemodOptions = {},
): DependencyAnalysisResult {
  const normalizedOptions = normalizeOptions(options);
  const angularBrandConfig = resolveAngularBrandConfig(
    sourceFile,
    normalizedOptions,
  );
  const result: DependencyAnalysisResult = {
    skipped: false,
    warnings: [],
    dependencies: [],
    dependencyGroups: emptyDependencyGroups(),
    generatedDependencyGroups: emptyGeneratedDependencyGroups(),
  };

  const angularClass = findAngularDecoratedClass(sourceFile);
  result.warnings.push(...angularClass.warnings);
  result.angularKind = angularClass.angularKind;
  result.className = angularClass.className;
  result.classDeclaration = angularClass.classDeclaration;

  if (angularClass.skipped) {
    result.skipped = true;
    return result;
  }

  if (!angularClass.classDeclaration) {
    return result;
  }

  const { angularKind, classDeclaration, className } = angularClass;

  if (!angularKind || !className) {
    result.skipped = true;
    result.warnings.push('Angular class name or kind could not be resolved.');
    return result;
  }

  if (
    normalizedOptions.transformOnlyStandaloneDeclarables &&
    (angularKind === 'component' || angularKind === 'directive') &&
    !isStandaloneDeclarable(classDeclaration)
  ) {
    result.skipped = true;
    result.warnings.push(
      `${decoratorLabel(angularKind)} ${className} is not standalone and transformOnlyStandaloneDeclarables is enabled.`,
    );
    return result;
  }

  const metadataDeps =
    angularKind === 'component' || angularKind === 'directive'
      ? extractDecoratorMetadataDepGroups(
          classDeclaration,
          angularKind,
          normalizedOptions,
        )
      : emptyMetadataDependencyGroups();
  const providedDeps =
    angularKind === 'component' || angularKind === 'directive'
      ? extractProvidedDependencies(
          sourceFile,
          classDeclaration,
          angularKind,
          normalizedOptions,
        )
      : { entries: [], warnings: [] };
  const constructorDeps = extractConstructorDeps(classDeclaration);
  const propertyDeps = extractPropertyDependencies(
    sourceFile,
    classDeclaration,
    className,
  );
  const generatedDependencyAugmentation =
    createGeneratedDependencyGroupAugmentation(
      sourceFile,
      metadataDeps.occurrences,
      angularBrandConfig,
    );
  const syntheticDependencyTexts = mergeDeps(
    generatedDependencyAugmentation.deps.map(
      (dependency) => dependency.dependencyText,
    ),
    generatedDependencyAugmentation.legacyInjectedDependencies.map(
      (dependency) => dependency.dependencyText,
    ),
  );
  result.warnings.push(
    ...metadataDeps.warnings,
    ...providedDeps.warnings,
    ...constructorDeps.warnings,
    ...propertyDeps.warnings,
  );
  result.dependencies = mergeDeps(
    constructorDeps.dependencies,
    propertyDeps.dependencies,
    metadataDeps.imports,
    metadataDeps.hostDirectives,
    metadataDeps.providers,
    metadataDeps.viewProviders,
    syntheticDependencyTexts,
  );
  result.dependencyGroups = {
    injected: mergeDeps(
      constructorDeps.dependencies,
      propertyDeps.dependencies,
      generatedDependencyAugmentation.legacyInjectedDependencies.map(
        (dependency) => dependency.dependencyText,
      ),
    ),
    importDeps: mergeDeps(metadataDeps.imports, metadataDeps.hostDirectives),
    providers: mergeDeps(metadataDeps.providers, metadataDeps.viewProviders),
  };
  result.generatedTypeName = getGeneratedDepsTypeName(className);
  result.generatedDependencyGroups = createGeneratedDependencyGroups(
    sourceFile,
    className,
    result.dependencyGroups.importDeps,
    constructorDeps.dependencies,
    propertyDeps,
    providedDeps.entries,
    generatedDependencyAugmentation,
  );

  return result;
}

export function findAngularDecoratedClass(
  sourceFile: SourceFile,
): AngularClassSearchResult {
  const decoratedClasses = sourceFile
    .getClasses()
    .map((classDeclaration) => {
      const angularKind = getAngularKind(classDeclaration);
      return angularKind ? { classDeclaration, angularKind } : undefined;
    })
    .filter(
      (
        entry,
      ): entry is {
        classDeclaration: ClassDeclaration;
        angularKind: AngularKind;
      } => Boolean(entry),
    );

  if (decoratedClasses.length === 0) {
    return { skipped: false, warnings: [] };
  }

  if (decoratedClasses.length > 1) {
    return {
      skipped: true,
      warnings: [
        `Skipped file because it contains ${decoratedClasses.length} supported Angular classes.`,
      ],
    };
  }

  const [{ classDeclaration, angularKind }] = decoratedClasses;
  const className = classDeclaration.getName();
  if (!className) {
    return {
      classDeclaration,
      angularKind,
      skipped: true,
      warnings: ['Skipped anonymous default-exported Angular class.'],
    };
  }

  return {
    classDeclaration,
    angularKind,
    className,
    skipped: false,
    warnings: [],
  };
}

export function getAngularKind(
  classDeclaration: ClassDeclaration,
): AngularKind | undefined {
  for (const decorator of classDeclaration.getDecorators()) {
    const decoratorName = getDecoratorName(decorator);
    if (decoratorName && decoratorName in SUPPORTED_DECORATORS) {
      return SUPPORTED_DECORATORS[decoratorName];
    }
  }

  return undefined;
}

export function isStandaloneDeclarable(
  classDeclaration: ClassDeclaration,
): boolean {
  const angularKind = getAngularKind(classDeclaration);
  if (angularKind !== 'component' && angularKind !== 'directive') {
    return false;
  }

  const metadata = getDecoratorMetadataObject(classDeclaration);
  const standaloneProperty = metadata
    ? getObjectPropertyAssignment(metadata, 'standalone')
    : undefined;
  const initializer = standaloneProperty?.getInitializer();

  return Node.isTrueLiteral(initializer);
}

export function extractDecoratorMetadataDeps(
  classDeclaration: ClassDeclaration,
  angularKind = getAngularKind(classDeclaration),
  options: AngularBrandCodemodOptions = {},
): DependencyExtractionResult {
  if (angularKind !== 'component' && angularKind !== 'directive') {
    return { dependencies: [], warnings: [] };
  }

  const groups = extractDecoratorMetadataDepGroups(
    classDeclaration,
    angularKind,
    normalizeOptions(options),
  );

  return {
    dependencies: mergeDeps(
      groups.imports,
      groups.hostDirectives,
      groups.providers,
      groups.viewProviders,
    ),
    warnings: groups.warnings,
  };
}

export function extractConstructorDeps(
  classDeclaration: ClassDeclaration,
): DependencyExtractionResult {
  const warnings: string[] = [];
  const dependencies: string[] = [];

  for (const constructorDeclaration of classDeclaration.getConstructors()) {
    for (const parameter of constructorDeclaration.getParameters()) {
      const injectToken = getInjectDecoratorToken(
        parameter.getDecorators(),
        warnings,
      );
      if (injectToken.found) {
        if (injectToken.dependency) {
          dependencies.push(injectToken.dependency);
        }
        continue;
      }

      const typeNode = parameter.getTypeNode();
      if (!typeNode) {
        warnings.push(
          `Skipped constructor parameter "${parameter.getName()}" because it has no type.`,
        );
        continue;
      }

      const dependency = getDependencyTextFromTypeNode(typeNode);
      if (!dependency) {
        warnings.push(
          `Skipped constructor parameter "${parameter.getName()}" because type "${typeNode.getText()}" is not a static Angular dependency.`,
        );
        continue;
      }

      if (!isRuntimeSafeTypeDependency(typeNode, dependency)) {
        warnings.push(
          `Skipped constructor dependency "${dependency}" because it is unresolved, type-only, or not a runtime value.`,
        );
        continue;
      }

      dependencies.push(dependency);
    }
  }

  return { dependencies: mergeDeps(dependencies), warnings };
}

export function extractInjectCallDeps(
  classDeclaration: ClassDeclaration,
): InjectCallDependencyExtractionResult {
  const warnings: string[] = [];
  const dependencies: string[] = [];
  const generatedDependencies: InjectedDependencyDescriptor[] = [];
  const sourceFile = classDeclaration.getSourceFile();

  for (const callExpression of classDeclaration.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = callExpression.getExpression();
    const injectMethodName = getInjectMethodName(expression);
    if (
      !injectMethodName ||
      (injectMethodName !== 'inject' &&
        !resolveTrackedInjectHelper(expression))
    ) {
      continue;
    }

    const dependency =
      injectMethodName === 'inject'
        ? getAngularInjectCallDependency(callExpression)
        : getInjectionHelperDependency(expression);

    if (!dependency) {
      warnings.push(
        `Skipped ${injectMethodName}() call in ${classDeclaration.getName() ?? 'anonymous class'} because the injection dependency is not static.`,
      );
      continue;
    }

    dependencies.push(dependency);
    generatedDependencies.push({
      dependencyText: dependency,
      entry:
        injectMethodName === 'inject'
          ? createGeneratedDependencyEntry(sourceFile, dependency, 'inject')
          : createGeneratedInjectHelperDependencyEntry(
              sourceFile,
              callExpression,
              expression,
              dependency,
            ),
    });
  }

  return {
    dependencies: mergeDeps(dependencies),
    warnings,
    generatedDependencies,
  };
}

function extractPropertyDependencies(
  sourceFile: SourceFile,
  classDeclaration: ClassDeclaration,
  className: string,
): PropertyDependencyExtractionResult {
  const warnings: string[] = [];
  const dependencies: string[] = [];
  const entries: GeneratedDependencyEntry[] = [];
  const missingProvider: GeneratedDependencyEntry[] = [];

  for (const property of classDeclaration.getProperties()) {
    if (property.isStatic()) {
      continue;
    }

    const propertyName = getStaticPropertyName(property.getNameNode());
    if (!propertyName) {
      warnings.push(
        `Skipped property dependency tracking for ${property.getText()} because the property name is not static.`,
      );
      continue;
    }

    const initializer = property.getInitializer();
    if (Node.isCallExpression(initializer)) {
      const expression = initializer.getExpression();
      const injectMethodName = getInjectMethodName(expression);

      if (
        injectMethodName &&
        (injectMethodName === 'inject' ||
          resolveTrackedInjectHelper(expression))
      ) {
        const dependencyText =
          injectMethodName === 'inject'
            ? getAngularInjectCallDependency(initializer)
            : getInjectionHelperDependency(expression);

        if (!dependencyText) {
          warnings.push(
            `Skipped ${injectMethodName}() property dependency tracking for "${propertyName}" because the dependency is not static.`,
          );
        } else {
          dependencies.push(dependencyText);

          const dependencyEntry =
            injectMethodName === 'inject'
              ? createGeneratedDependencyEntry(
                  sourceFile,
                  dependencyText,
                  'inject',
                )
              : createGeneratedInjectHelperDependencyEntry(
                  sourceFile,
                  initializer,
                  expression,
                  dependencyText,
                );

          entries.push(
            createGeneratedPropertyDependencyEntry(
              propertyName,
              createSingleDependencyMapTypeText(dependencyEntry),
            ),
          );

          if (shouldGenerateLocalMissingProvider(sourceFile, dependencyText)) {
            missingProvider.push(
              createGeneratedDependencyEntry(
                sourceFile,
                dependencyText,
                'inject',
              ),
            );
          }

          continue;
        }
      }
    }

    entries.push(
      createGeneratedPropertyDependencyEntry(
        propertyName,
        createExtractDepsTypeText(className, propertyName),
      ),
    );
  }

  return {
    dependencies: mergeDeps(dependencies),
    warnings,
    entries,
    missingProvider: mergeGeneratedDependencyEntries(missingProvider),
  };
}

export function mergeDeps(...dependencyGroups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const dependencies: string[] = [];

  for (const group of dependencyGroups) {
    for (const dependency of group) {
      if (seen.has(dependency)) {
        continue;
      }

      seen.add(dependency);
      dependencies.push(dependency);
    }
  }

  return dependencies;
}

function emptyDependencyGroups(): DependencyGroups {
  return {
    injected: [],
    importDeps: [],
    providers: [],
  };
}

function emptyGeneratedDependencyGroups(): GeneratedDependencyGroups {
  return {
    deps: [],
    propertiesDeps: [],
    provided: [],
    missingProvider: [],
  };
}

function emptyGeneratedDependencyGroupAugmentation(): GeneratedDependencyGroupAugmentation {
  return {
    deps: [],
    missingProvider: [],
    legacyInjectedDependencies: [],
    suppressedImportDependencyTexts: new Set(),
  };
}

function getGeneratedDepsTypeName(className: string): string {
  return `GenDeps_${className}`;
}

function createGeneratedDependencyGroups(
  sourceFile: SourceFile,
  className: string,
  importDependencies: string[],
  constructorDependencies: string[],
  propertyDependencies: PropertyDependencyExtractionResult,
  providedEntries: GeneratedDependencyEntry[],
  augmentation: GeneratedDependencyGroupAugmentation,
): GeneratedDependencyGroups {
  const constructorEntries = constructorDependencies.map((dependency) =>
    createGeneratedDependencyEntry(sourceFile, dependency, 'inject'),
  );
  const deps = mergeGeneratedDependencyEntries(
    importDependencies
      .filter(
        (dependency) =>
          !augmentation.suppressedImportDependencyTexts.has(dependency),
      )
      .map((dependency) =>
        createGeneratedDependencyEntry(sourceFile, dependency, 'import'),
      ),
    constructorEntries,
    augmentation.deps.map((dependency) => dependency.entry),
  );
  const propertiesDeps = mergeGeneratedDependencyEntries(
    propertyDependencies.entries,
  );
  const provided = mergeGeneratedDependencyEntries(providedEntries);
  const providedKeys = new Set(provided.map((entry) => entry.key));
  const missingProvider = mergeGeneratedDependencyEntries(
    constructorDependencies
      .filter((dependencyText) =>
        shouldGenerateLocalMissingProvider(sourceFile, dependencyText),
      )
      .map((dependencyText) =>
        createGeneratedDependencyEntry(sourceFile, dependencyText, 'inject'),
      ),
    propertyDependencies.missingProvider,
    augmentation.missingProvider
      .map((dependency) => dependency.entry)
      .filter((entry) => !providedKeys.has(entry.key)),
  );

  return {
    deps,
    propertiesDeps,
    provided,
    missingProvider,
  };
}

function createGeneratedDependencyGroupAugmentation(
  sourceFile: SourceFile,
  metadataOccurrences: MetadataDependencyOccurrence[],
  config: NormalizedAngularBrandConfig,
): GeneratedDependencyGroupAugmentation {
  if (metadataOccurrences.length === 0) {
    return emptyGeneratedDependencyGroupAugmentation();
  }

  const deps: GeneratedDependencyDescriptor[] = [];
  const missingProvider: GeneratedDependencyDescriptor[] = [];
  const legacyInjectedDependencies: GeneratedDependencyDescriptor[] = [];
  const suppressedImportDependencyTexts = new Set<string>();

  for (const rule of config.importAugmentations) {
    const matchingOccurrences = metadataOccurrences.filter((occurrence) =>
      ruleMatchesMetadataOccurrence(rule, occurrence),
    );
    if (matchingOccurrences.length === 0) {
      continue;
    }

    const generatedDeps = rule.deps.map((entry) =>
      createConfiguredGeneratedDependencyDescriptor(
        sourceFile,
        entry,
        rule.match.module,
      ),
    );
    const generatedMissingProviders = rule.missingProvider.map((entry) =>
      createConfiguredGeneratedDependencyDescriptor(
        sourceFile,
        entry,
        rule.match.module,
      ),
    );

    deps.push(...generatedDeps);
    missingProvider.push(...generatedMissingProviders);
    legacyInjectedDependencies.push(...generatedMissingProviders);

    const ruleEntryKeys = new Set(rule.deps.map((entry) => entry.key));
    for (const occurrence of matchingOccurrences) {
      if (
        occurrence.metadataContext === 'imports' &&
        ruleEntryKeys.has(occurrence.symbolName)
      ) {
        suppressedImportDependencyTexts.add(occurrence.dependencyText);
      }
    }
  }

  return {
    deps,
    missingProvider,
    legacyInjectedDependencies,
    suppressedImportDependencyTexts,
  };
}

function ruleMatchesMetadataOccurrence(
  rule: NormalizedAngularBrandImportAugmentationRule,
  occurrence: MetadataDependencyOccurrence,
): boolean {
  if (occurrence.moduleSpecifier !== rule.match.module) {
    return false;
  }

  if (!rule.match.metadata.includes(occurrence.metadataContext)) {
    return false;
  }

  return (
    !rule.match.symbols || rule.match.symbols.includes(occurrence.symbolName)
  );
}

function createConfiguredGeneratedDependencyDescriptor(
  sourceFile: SourceFile,
  entry: AngularBrandConfigEntry,
  defaultModuleSpecifier: string,
): GeneratedDependencyDescriptor {
  return {
    dependencyText: entry.symbol,
    entry: createSyntheticGeneratedDependencyEntry(
      sourceFile,
      entry.symbol,
      'inject',
      entry.module ?? defaultModuleSpecifier,
      entry.key,
      entry.typeText,
    ),
  };
}

function mergeGeneratedDependencyEntries(
  ...groups: readonly GeneratedDependencyEntry[][]
): GeneratedDependencyEntry[] {
  const entries = new Map<string, GeneratedDependencyEntry>();

  for (const group of groups) {
    for (const entry of group) {
      entries.set(entry.key, entry);
    }
  }

  return [...entries.values()];
}

function createGeneratedDependencyEntry(
  sourceFile: SourceFile,
  dependencyText: string,
  context: 'import' | 'inject',
): GeneratedDependencyEntry {
  if (context === 'import') {
    const declarableResolution = resolveAngularDeclarableDependency(
      sourceFile,
      dependencyText,
    );
    if (declarableResolution) {
      const generatedTypeName = getGeneratedDepsTypeName(
        declarableResolution.className,
      );
      return {
        key: generatedTypeName,
        typeText: generatedTypeName,
        typeImport: declarableResolution.moduleSpecifier
          ? {
              moduleSpecifier: declarableResolution.moduleSpecifier,
              name: generatedTypeName,
            }
          : undefined,
      };
    }
  }

  return {
    key: createGeneratedDependencyKey(dependencyText),
    typeText: createGeneratedDependencyTypeText(sourceFile, dependencyText),
  };
}

function createSyntheticGeneratedDependencyEntry(
  sourceFile: SourceFile,
  dependencyText: string,
  context: 'import' | 'inject',
  moduleSpecifier: string,
  key = createGeneratedDependencyKey(dependencyText),
  typeText?: string,
): GeneratedDependencyEntry {
  return {
    ...createGeneratedDependencyEntry(sourceFile, dependencyText, context),
    key,
    typeText:
      typeText ?? createGeneratedDependencyTypeText(sourceFile, dependencyText),
    typeImport: {
      moduleSpecifier,
      name: dependencyText,
    },
  };
}

function createGeneratedInjectHelperDependencyEntry(
  sourceFile: SourceFile,
  callExpression: import('ts-morph').CallExpression,
  expression: Node,
  dependencyText: string,
): GeneratedDependencyEntry {
  const trackedHelper = resolveTrackedInjectHelper(expression);
  if (!trackedHelper) {
    return createGeneratedDependencyEntry(sourceFile, dependencyText, 'inject');
  }

  const exposureTracking = extractHelperExposureTracking(callExpression);

  return {
    key: trackedHelper.serviceName,
    typeText: createTrackedInjectHelperTypeText(
      dependencyText,
      trackedHelper.serviceName,
      exposureTracking,
    ),
  };
}

function createTrackedInjectHelperTypeText(
  dependencyText: string,
  serviceName: string,
  exposureTracking: HelperExposureTracking | undefined,
): string {
  const baseType = `ExtractDeps<typeof ${dependencyText}>[${JSON.stringify(serviceName)}]`;
  if (!exposureTracking) {
    return baseType;
  }

  return [
    `DerivedService<${baseType}, {`,
    `  derivedPropertiesUsed: ${formatHelperExposurePropertiesType(
      dependencyText,
      exposureTracking.usedProperties.map((sourceKey) => ({
        propertyKey: sourceKey,
        sourceKey,
      })),
    )};`,
    `  derivedPropertiesExposed: ${formatHelperExposurePropertiesType(
      dependencyText,
      exposureTracking.exposedProperties.map(({ exposedKey, sourceKey }) => ({
        propertyKey: exposedKey,
        sourceKey,
      })),
    )};`,
    '}>',
  ].join('\n');
}

function createGeneratedPropertyDependencyEntry(
  propertyName: string,
  typeText: string,
): GeneratedDependencyEntry {
  return {
    key: propertyName,
    typeText,
  };
}

function createExtractDepsTypeText(
  className: string,
  propertyName: string,
): string {
  return `ExtractDeps<${className}[${JSON.stringify(propertyName)}]>`;
}

function createSingleDependencyMapTypeText(
  entry: GeneratedDependencyEntry,
): string {
  return formatGeneratedDependencyObject([entry]);
}

function formatHelperExposurePropertiesType(
  dependencyText: string,
  properties: Array<{ propertyKey: string; sourceKey: string }>,
): string {
  if (properties.length === 0) {
    return '{}';
  }

  return [
    '{',
    ...properties.map(
      ({ propertyKey, sourceKey }) =>
        `    ${formatObjectKey(propertyKey)}: ${createTrackedHelperOutputTypeText(
          dependencyText,
          sourceKey,
        )};`,
    ),
    '  }',
  ].join('\n');
}

function createTrackedHelperOutputTypeText(
  dependencyText: string,
  sourceKey: string,
): string {
  if (sourceKey === '$self') {
    return `GetServiceOutput<typeof ${dependencyText}>`;
  }

  return `GetServiceOutput<typeof ${dependencyText}>[${JSON.stringify(sourceKey)}]`;
}

function resolveTrackedInjectHelper(
  expression: Node,
): TrackedHelperResolution | undefined {
  const symbol = expression.getSymbol() ?? expression.getType().getSymbol();
  const declarations =
    symbol?.getAliasedSymbol()?.getDeclarations() ??
    symbol?.getDeclarations() ??
    [];

  for (const declaration of declarations) {
    const helper = resolveTrackedInjectHelperFromDeclaration(declaration);
    if (helper) {
      return helper;
    }
  }

  return undefined;
}

function resolveTrackedInjectHelperFromDeclaration(
  declaration: Node,
): TrackedHelperResolution | undefined {
  if (!Node.isBindingElement(declaration)) {
    return undefined;
  }

  const objectBindingPattern = declaration.getFirstAncestorByKind(
    SyntaxKind.ObjectBindingPattern,
  );
  const variableDeclaration = objectBindingPattern?.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const initializer = variableDeclaration?.getInitializer();
  if (
    !Node.isCallExpression(initializer) ||
    !isServiceFactoryCall(initializer)
  ) {
    return undefined;
  }

  const [optionsArgument] = initializer.getArguments();
  if (!Node.isObjectLiteralExpression(optionsArgument)) {
    return undefined;
  }

  const nameInitializer = getObjectPropertyAssignment(
    optionsArgument,
    'name',
  )?.getInitializer();
  const scopeInitializer = getObjectPropertyAssignment(
    optionsArgument,
    'scope',
  )?.getInitializer();

  if (
    !Node.isStringLiteral(nameInitializer) ||
    !Node.isStringLiteral(scopeInitializer)
  ) {
    return undefined;
  }

  return {
    serviceName: nameInitializer.getLiteralText(),
    scope: scopeInitializer.getLiteralText(),
  };
}

function isServiceFactoryCall(
  callExpression: import('ts-morph').CallExpression,
): boolean {
  const expression = callExpression.getExpression();
  if (Node.isIdentifier(expression)) {
    return (
      expression.getText() === 'craftService' ||
      expression.getText() === 'toCraftService'
    );
  }

  if (Node.isPropertyAccessExpression(expression)) {
    const methodName = expression.getName();
    return methodName === 'craftService' || methodName === 'toCraftService';
  }

  return false;
}

function extractHelperExposureTracking(
  callExpression: import('ts-morph').CallExpression,
): HelperExposureTracking | undefined {
  const exposeArgument = [...callExpression.getArguments()]
    .reverse()
    .find(
      (argument) =>
        Node.isArrowFunction(argument) || Node.isFunctionExpression(argument),
    );

  if (
    !exposeArgument ||
    (!Node.isArrowFunction(exposeArgument) &&
      !Node.isFunctionExpression(exposeArgument))
  ) {
    return undefined;
  }

  const parameter = exposeArgument.getParameters()[0];
  const nameNode = parameter?.getNameNode();
  if (!nameNode || !Node.isObjectBindingPattern(nameNode)) {
    return undefined;
  }

  const bindings = extractHelperExposureBindings(nameNode);
  if (bindings.length === 0) {
    return undefined;
  }

  const returnObjectLiteral = getExposureReturnObjectLiteral(exposeArgument);
  if (!returnObjectLiteral) {
    return undefined;
  }

  const exposedProperties = extractHelperExposedProperties(
    returnObjectLiteral,
    bindings,
  );
  const usedProperties = mergeDeps(
    exposedProperties.map(({ sourceKey }) => sourceKey),
    extractHelperYieldedProperties(exposeArgument, bindings),
  );

  return {
    usedProperties,
    exposedProperties,
  };
}

function extractHelperExposureBindings(
  bindingPattern: import('ts-morph').ObjectBindingPattern,
): HelperExposureBinding[] {
  const bindings: HelperExposureBinding[] = [];

  for (const element of bindingPattern.getElements()) {
    const nameNode = element.getNameNode();
    if (!Node.isIdentifier(nameNode)) {
      continue;
    }

    const propertyNameNode = element.getPropertyNameNode();
    const sourceKey =
      getStaticPropertyName(propertyNameNode ?? nameNode) ?? nameNode.getText();

    bindings.push({
      localName: nameNode.getText(),
      sourceKey,
    });
  }

  return bindings;
}

function getExposureReturnObjectLiteral(
  exposeArgument:
    | import('ts-morph').ArrowFunction
    | import('ts-morph').FunctionExpression,
): ObjectLiteralExpression | undefined {
  const body = exposeArgument.getBody();
  if (Node.isObjectLiteralExpression(body)) {
    return body;
  }

  if (Node.isParenthesizedExpression(body)) {
    const expression = body.getExpression();
    return Node.isObjectLiteralExpression(expression) ? expression : undefined;
  }

  if (!Node.isBlock(body)) {
    return undefined;
  }

  const returnStatement = [
    ...body.getDescendantsOfKind(SyntaxKind.ReturnStatement),
  ]
    .reverse()
    .find((statement) =>
      Node.isObjectLiteralExpression(statement.getExpression()),
    );

  const expression = returnStatement?.getExpression();
  return Node.isObjectLiteralExpression(expression) ? expression : undefined;
}

function extractHelperExposedProperties(
  objectLiteral: ObjectLiteralExpression,
  bindings: HelperExposureBinding[],
): Array<{ exposedKey: string; sourceKey: string }> {
  const bindingMap = new Map(
    bindings.map((binding) => [binding.localName, binding.sourceKey]),
  );
  const exposedProperties: Array<{ exposedKey: string; sourceKey: string }> =
    [];

  for (const property of objectLiteral.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      const sourceKey = bindingMap.get(property.getName());
      if (sourceKey) {
        exposedProperties.push({
          exposedKey: property.getName(),
          sourceKey,
        });
      }
      continue;
    }

    if (!Node.isPropertyAssignment(property)) {
      continue;
    }

    const exposedKey = getStaticPropertyName(property.getNameNode());
    const initializer = property.getInitializer();
    if (!exposedKey || !Node.isIdentifier(initializer)) {
      continue;
    }

    const sourceKey = bindingMap.get(initializer.getText());
    if (!sourceKey) {
      continue;
    }

    exposedProperties.push({
      exposedKey,
      sourceKey,
    });
  }

  return exposedProperties;
}

function extractHelperYieldedProperties(
  exposeArgument:
    | import('ts-morph').ArrowFunction
    | import('ts-morph').FunctionExpression,
  bindings: HelperExposureBinding[],
): string[] {
  const bindingMap = new Map(
    bindings.map((binding) => [binding.localName, binding.sourceKey]),
  );
  const yieldedProperties: string[] = [];

  for (const yieldExpression of exposeArgument.getDescendantsOfKind(
    SyntaxKind.YieldExpression,
  )) {
    const expression = yieldExpression.getExpression();
    if (!Node.isCallExpression(expression)) {
      continue;
    }

    const target = expression.getExpression();
    if (!Node.isIdentifier(target)) {
      continue;
    }

    const sourceKey = bindingMap.get(target.getText());
    if (sourceKey) {
      yieldedProperties.push(sourceKey);
    }
  }

  return yieldedProperties;
}

function createGeneratedDependencyKey(dependencyText: string): string {
  const lastSegment = dependencyText.split('.').pop() ?? dependencyText;
  const helperMatch = /^(provide)([A-Z].*)$/.exec(lastSegment);
  if (helperMatch) {
    return helperMatch[2];
  }

  return lastSegment;
}

function createGeneratedDependencyTypeText(
  sourceFile: SourceFile,
  dependencyText: string,
): string {
  if (isHelperLikeDependency(dependencyText)) {
    return `ReturnType<typeof ${dependencyText}>`;
  }

  const resolution = resolveDependencyReference(sourceFile, dependencyText);
  if (resolution.kind === 'class' || resolution.kind === 'enum') {
    return dependencyText;
  }

  if (resolution.kind === 'unknown') {
    return dependencyText;
  }

  return `typeof ${dependencyText}`;
}

function isHelperLikeDependency(dependencyText: string): boolean {
  const lastSegment = dependencyText.split('.').pop() ?? dependencyText;
  return (
    /^provide[A-Z].*/.test(lastSegment)
  );
}

function resolveAngularDeclarableDependency(
  sourceFile: SourceFile,
  dependencyText: string,
): { className: string; moduleSpecifier?: string } | undefined {
  const resolution = resolveDependencyReference(sourceFile, dependencyText);
  if (!resolution.classDeclaration) {
    return undefined;
  }

  const angularKind = getAngularKind(resolution.classDeclaration);
  if (
    angularKind !== 'component' &&
    angularKind !== 'directive' &&
    angularKind !== 'pipe'
  ) {
    return undefined;
  }

  const className = resolution.classDeclaration.getName();
  if (!className) {
    return undefined;
  }

  const declarationSourceFile = resolution.classDeclaration.getSourceFile();
  if (
    declarationSourceFile === sourceFile ||
    declarationSourceFile.isDeclarationFile()
  ) {
    return undefined;
  }

  return {
    className,
    moduleSpecifier: resolution.moduleSpecifier,
  };
}

function ensureGeneratedDependencyTypeImports(
  sourceFile: SourceFile,
  generatedDependencyGroups: GeneratedDependencyGroups,
): void {
  const importsToAdd = new Map<string, Set<string>>();

  for (const entry of [
    ...generatedDependencyGroups.deps,
    ...generatedDependencyGroups.missingProvider,
  ]) {
    if (!entry.typeImport) {
      continue;
    }

    const importNames =
      importsToAdd.get(entry.typeImport.moduleSpecifier) ?? new Set<string>();
    importNames.add(entry.typeImport.name);
    importsToAdd.set(entry.typeImport.moduleSpecifier, importNames);
  }

  for (const [moduleSpecifier, importNames] of importsToAdd) {
    const existingImport = sourceFile
      .getImportDeclarations()
      .find(
        (importDeclaration) =>
          importDeclaration.getModuleSpecifierValue() === moduleSpecifier &&
          !importDeclaration.getNamespaceImport(),
      );

    if (existingImport) {
      const existingImportNames = new Set(
        existingImport.getNamedImports().map((namedImport) => {
          return (
            namedImport.getAliasNode()?.getText() ??
            namedImport.getNameNode().getText()
          );
        }),
      );
      const namesToAdd = [...importNames].filter(
        (name) => !existingImportNames.has(name),
      );
      if (namesToAdd.length === 0) {
        continue;
      }

      const declarationIsTypeOnly = existingImport.isTypeOnly();
      existingImport.addNamedImports(
        namesToAdd.map((name) => ({
          name,
          isTypeOnly: !declarationIsTypeOnly,
        })),
      );
      continue;
    }

    sourceFile.addImportDeclaration({
      moduleSpecifier,
      namedImports: [...importNames].map((name) => ({
        name,
        isTypeOnly: true,
      })),
    });
  }
}

function formatGeneratedDependencyType(
  angularKind: AngularKind,
  className: string,
  generatedDependencyGroups: GeneratedDependencyGroups,
): string {
  return [
    '{',
    `  deps: ${formatGeneratedDependencyObject(generatedDependencyGroups.deps)};`,
    ...(angularKind === 'component'
      ? [
          `  propertiesDeps: ${formatGeneratedDependencyObject(generatedDependencyGroups.propertiesDeps)};`,
        ]
      : []),
    `  provided: ${formatGeneratedDependencyObject(generatedDependencyGroups.provided)};`,
    ...(angularKind === 'component'
      ? [`  publicProperties: GetPublicComponentProperties<${className}>;`]
      : []),
    ...(generatedDependencyGroups.missingProvider.length > 0
      ? [
          `  missingProvider: ${formatGeneratedDependencyObject(
            generatedDependencyGroups.missingProvider,
          )};`,
        ]
      : []),
    '}',
  ].join('\n');
}

function formatGeneratedDependencyObject(
  entries: GeneratedDependencyEntry[],
): string {
  if (entries.length === 0) {
    return '{}';
  }

  return [
    '{',
    ...entries.map((entry) => formatGeneratedDependencyEntry(entry)),
    '  }',
  ].join('\n');
}

function formatGeneratedDependencyEntry(
  entry: GeneratedDependencyEntry,
): string {
  const typeLines = entry.typeText.split('\n');
  const lines = [
    `    ${formatObjectKey(entry.key)}: ${typeLines[0]}`,
    ...typeLines.slice(1).map((line) => `    ${line}`),
  ];
  lines[lines.length - 1] += ';';
  return lines.join('\n');
}

function formatObjectKey(key: string): string {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? key : `'${key}'`;
}

export function writeGeneratedDepsTypeAlias(
  sourceFile: SourceFile,
  angularKind: AngularKind,
  className: string,
  generatedDependencyGroups: GeneratedDependencyGroups,
): void {
  const generatedTypeName = getGeneratedDepsTypeName(className);
  const generatedType = `GetDeps<${formatGeneratedDependencyType(
    angularKind,
    className,
    generatedDependencyGroups,
  )}>`;
  const existingTypeAlias = sourceFile.getTypeAlias(generatedTypeName);

  if (existingTypeAlias) {
    existingTypeAlias.setIsExported(true);
    existingTypeAlias.setType(generatedType);
    return;
  }

  sourceFile.addTypeAlias({
    isExported: true,
    name: generatedTypeName,
    type: generatedType,
  });
}

export function migrateLegacyBrandExport(
  sourceFile: SourceFile,
  classDeclaration: ClassDeclaration,
  className: string,
): void {
  const existing = readExistingDependencyGroups(sourceFile, className);
  if (!existing.found || !existing.exportAssignmentNode) {
    return;
  }

  const exportAssignment = existing.exportAssignmentNode.asKind(
    SyntaxKind.ExportAssignment,
  );
  exportAssignment?.remove();

  if (
    !classDeclaration.isDefaultExport() &&
    !classDeclaration.isExported() &&
    exportAssignment
  ) {
    classDeclaration.setIsDefaultExport(true);
  }
}

function invalidExistingDependencyGroups(
  node: Node,
  warnings: string[],
): ExistingDependencyGroupsResult {
  return {
    found: true,
    warnings,
    dependencyGroups: emptyDependencyGroups(),
    exportAssignmentNode: node,
    depsObjectNode: node,
    propertyNodes: {},
  };
}

function readExistingDependencyGroupProperty(
  objectLiteral: ObjectLiteralExpression,
  propertyName: keyof DependencyGroups,
  warnings: string[],
  propertyNodes: ExistingDependencyGroupsResult['propertyNodes'],
): string[] {
  const property = getObjectPropertyAssignment(objectLiteral, propertyName);
  if (!property) {
    warnings.push(`deps(...) is missing the "${propertyName}" array.`);
    return [];
  }

  propertyNodes[propertyName] = property;
  const initializer = property.getInitializer();
  if (!Node.isArrayLiteralExpression(initializer)) {
    warnings.push(`deps.${propertyName} must be a static array.`);
    return [];
  }

  const dependencies: string[] = [];

  for (const element of initializer.getElements()) {
    const dependency = getStaticExpressionText(element);
    if (!dependency) {
      warnings.push(
        `deps.${propertyName} contains a non-static expression: ${element.getText()}`,
      );
      continue;
    }

    dependencies.push(dependency);
  }

  return dependencies;
}

function getInjectMethodName(expression: Node): string | undefined {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }

  return undefined;
}

function getAngularInjectCallDependency(
  callExpression: import('ts-morph').CallExpression,
): string | undefined {
  const [token] = callExpression.getArguments();
  return getStaticExpressionText(token);
}

function getInjectionHelperDependency(expression: Node): string | undefined {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    const left = expression.getExpression();
    if (Node.isIdentifier(left)) {
      return expression.getText();
    }
  }

  return undefined;
}

export function ensureHelperImports(
  sourceFile: SourceFile,
  helperImportPath: string,
): void {
  const missingImports = [
    'DerivedService',
    'ExtractDeps',
    'GetDeps',
    'GetPublicComponentProperties',
    'GetServiceOutput',
  ].filter(
    (importName) =>
      !hasLocalNamedImport(sourceFile, helperImportPath, importName),
  );

  if (missingImports.length === 0) {
    return;
  }

  const existingImport = sourceFile
    .getImportDeclarations()
    .find(
      (importDeclaration) =>
        importDeclaration.getModuleSpecifierValue() === helperImportPath,
    );

  if (existingImport) {
    existingImport.addNamedImports(
      missingImports.map((name) => ({ name, isTypeOnly: true })),
    );
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier: helperImportPath,
    namedImports: missingImports.map((name) => ({
      name,
      isTypeOnly: true,
    })),
  });
}

export function readExistingDependencyGroups(
  sourceFile: SourceFile,
  className?: string,
): ExistingDependencyGroupsResult {
  const defaultExport = sourceFile
    .getExportAssignments()
    .find((exportAssignment) => {
      if (exportAssignment.isExportEquals()) {
        return false;
      }

      const expression = exportAssignment.getExpression();
      if (!Node.isCallExpression(expression)) {
        return false;
      }

      const callTarget = expression.getExpression();
      if (
        !Node.isIdentifier(callTarget) ||
        callTarget.getText() !== 'brandAngularSymbol'
      ) {
        return false;
      }

      if (!className) {
        return true;
      }

      const [targetClass] = expression.getArguments();
      return (
        Node.isIdentifier(targetClass) && targetClass.getText() === className
      );
    });

  if (!defaultExport) {
    return {
      found: false,
      warnings: [],
      dependencyGroups: emptyDependencyGroups(),
      propertyNodes: {},
    };
  }

  const expression = defaultExport.getExpression();
  if (!Node.isCallExpression(expression)) {
    return invalidExistingDependencyGroups(defaultExport, [
      'Default export must call brandAngularSymbol(ClassName, deps({ ... })).',
    ]);
  }

  const [, depsArgument] = expression.getArguments();
  if (!Node.isCallExpression(depsArgument)) {
    return invalidExistingDependencyGroups(defaultExport, [
      'brandAngularSymbol must receive deps({ injected, importDeps, providers }).',
    ]);
  }

  const depsCallTarget = depsArgument.getExpression();
  if (
    !Node.isIdentifier(depsCallTarget) ||
    depsCallTarget.getText() !== 'deps'
  ) {
    return invalidExistingDependencyGroups(depsArgument, [
      'brandAngularSymbol second argument must be a deps(...) call.',
    ]);
  }

  const [depsObject] = depsArgument.getArguments();
  if (!Node.isObjectLiteralExpression(depsObject)) {
    return invalidExistingDependencyGroups(depsArgument, [
      'deps(...) must be called with an object literal.',
    ]);
  }

  const warnings: string[] = [];
  const propertyNodes: ExistingDependencyGroupsResult['propertyNodes'] = {};
  const dependencyGroups: DependencyGroups = {
    injected: readExistingDependencyGroupProperty(
      depsObject,
      'injected',
      warnings,
      propertyNodes,
    ),
    importDeps: readExistingDependencyGroupProperty(
      depsObject,
      'importDeps',
      warnings,
      propertyNodes,
    ),
    providers: readExistingDependencyGroupProperty(
      depsObject,
      'providers',
      warnings,
      propertyNodes,
    ),
  };

  return {
    found: true,
    warnings,
    dependencyGroups,
    exportAssignmentNode: defaultExport,
    depsObjectNode: depsObject,
    propertyNodes,
  };
}

export function formatDependencyGroups(
  dependencyGroups: DependencyGroups,
): string {
  return [
    `injected=[${dependencyGroups.injected.join(', ')}]`,
    `importDeps=[${dependencyGroups.importDeps.join(', ')}]`,
    `providers=[${dependencyGroups.providers.join(', ')}]`,
  ].join(' ');
}

export async function runAngularBrandCodemod(
  options: AngularBrandCodemodOptions & {
    rootDir?: string;
    tsConfigFilePath?: string;
    dryRun?: boolean;
    log?: (message: string) => void;
  } = {},
): Promise<RunSummary> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const config =
    options.config ??
    (options.configFilePath
      ? loadAngularBrandConfigFromFile(options.configFilePath)
      : loadDiscoveredAngularBrandConfig(rootDir));
  const tsConfigFilePath = options.tsConfigFilePath
    ? resolve(options.tsConfigFilePath)
    : getDefaultTsConfigPath(rootDir);
  const project = createProject(tsConfigFilePath);
  const files = collectTypeScriptFiles(rootDir);

  project.addSourceFilesAtPaths(files);
  setProjectQuoteKind(project);

  const summary: RunSummary = {
    transformedFiles: 0,
    skippedFiles: 0,
    warnings: 0,
    countByAngularKind: {
      component: 0,
      directive: 0,
      injectable: 0,
      pipe: 0,
    },
    files: [],
  };

  for (const sourceFile of project.getSourceFiles()) {
    if (!isWithinRoot(sourceFile.getFilePath(), rootDir)) {
      continue;
    }

    const result = transformSourceFile(sourceFile, {
      ...options,
      config,
    });
    const report: RunFileReport = {
      ...result,
      filePath: sourceFile.getFilePath(),
    };

    summary.files.push(report);
    summary.warnings += result.warnings.length;

    if (result.changed) {
      summary.transformedFiles += 1;
      if (
        result.angularKind &&
        result.angularKind in summary.countByAngularKind
      ) {
        summary.countByAngularKind[result.angularKind as AngularKind] += 1;
      }

      if (!options.dryRun) {
        await sourceFile.save();
      }
    }

    if (result.skipped) {
      summary.skippedFiles += 1;
    }

    logFileResult(report, options.log ?? console.log);
  }

  logSummary(summary, options.log ?? console.log);
  return summary;
}

function normalizeOptions(
  options: AngularBrandCodemodOptions,
): NormalizedOptions {
  return {
    helperImportPath:
      options.helperImportPath ?? DEFAULT_OPTIONS.helperImportPath,
    transformOnlyStandaloneDeclarables:
      options.transformOnlyStandaloneDeclarables ??
      DEFAULT_OPTIONS.transformOnlyStandaloneDeclarables,
    includeProviders:
      options.includeProviders ?? DEFAULT_OPTIONS.includeProviders,
    includeViewProviders:
      options.includeViewProviders ?? DEFAULT_OPTIONS.includeViewProviders,
    config: options.config,
    configFilePath: options.configFilePath,
  };
}

function skip(result: TransformResult, warnings: string[]): TransformResult {
  result.skipped = true;
  result.warnings.push(...warnings);
  return result;
}

function getDecoratorName(decorator: Decorator): string | undefined {
  const expression = decorator.getExpression();
  if (Node.isCallExpression(expression)) {
    const callTarget = expression.getExpression();
    if (Node.isIdentifier(callTarget)) {
      return callTarget.getText();
    }

    if (Node.isPropertyAccessExpression(callTarget)) {
      return callTarget.getName();
    }

    return undefined;
  }

  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }

  return undefined;
}

function decoratorLabel(angularKind: AngularKind): string {
  switch (angularKind) {
    case 'component':
      return '@Component';
    case 'directive':
      return '@Directive';
    case 'pipe':
      return '@Pipe';
    case 'injectable':
      return '@Injectable';
  }
}

function getDecoratorMetadataObject(
  classDeclaration: ClassDeclaration,
): ObjectLiteralExpression | undefined {
  for (const decorator of classDeclaration.getDecorators()) {
    if (!getAngularKindFromDecorator(decorator)) {
      continue;
    }

    const callExpression = decorator.getCallExpression();
    const [metadata] = callExpression?.getArguments() ?? [];
    if (Node.isObjectLiteralExpression(metadata)) {
      return metadata;
    }
  }

  return undefined;
}

function getAngularKindFromDecorator(
  decorator: Decorator,
): AngularKind | undefined {
  const decoratorName = getDecoratorName(decorator);
  return decoratorName && decoratorName in SUPPORTED_DECORATORS
    ? SUPPORTED_DECORATORS[decoratorName]
    : undefined;
}

function getObjectPropertyAssignment(
  objectLiteral: ObjectLiteralExpression,
  propertyName: string,
): PropertyAssignment | undefined {
  const property = objectLiteral.getProperties().find((objectProperty) => {
    if (!Node.isPropertyAssignment(objectProperty)) {
      return false;
    }

    return getStaticPropertyName(objectProperty.getNameNode()) === propertyName;
  });

  return Node.isPropertyAssignment(property) ? property : undefined;
}

function extractDecoratorMetadataDepGroups(
  classDeclaration: ClassDeclaration,
  angularKind: AngularKind,
  options: NormalizedOptions,
): MetadataDependencyGroups {
  const sourceFile = classDeclaration.getSourceFile();
  const metadata = getDecoratorMetadataObject(classDeclaration);
  const groups = emptyMetadataDependencyGroups();

  if (!metadata) {
    return groups;
  }

  groups.imports = extractMetadataArrayProperty(
    metadata,
    'imports',
    'imports',
    groups.warnings,
  );
  groups.hostDirectives = extractMetadataArrayProperty(
    metadata,
    'hostDirectives',
    'hostDirectives',
    groups.warnings,
  );

  if (options.includeProviders) {
    groups.providers = extractMetadataArrayProperty(
      metadata,
      'providers',
      'providers',
      groups.warnings,
    );
  }

  if (options.includeViewProviders && angularKind === 'component') {
    groups.viewProviders = extractMetadataArrayProperty(
      metadata,
      'viewProviders',
      'viewProviders',
      groups.warnings,
    );
  }

  groups.occurrences = [
    ...groups.imports.map((dependencyText) =>
      createMetadataDependencyOccurrence(sourceFile, dependencyText, 'imports'),
    ),
    ...groups.hostDirectives.map((dependencyText) =>
      createMetadataDependencyOccurrence(
        sourceFile,
        dependencyText,
        'hostDirectives',
      ),
    ),
  ];

  return groups;
}

function emptyMetadataDependencyGroups(): MetadataDependencyGroups {
  return {
    imports: [],
    hostDirectives: [],
    providers: [],
    viewProviders: [],
    occurrences: [],
    warnings: [],
  };
}

function createMetadataDependencyOccurrence(
  sourceFile: SourceFile,
  dependencyText: string,
  metadataContext: AngularBrandMetadataContext,
): MetadataDependencyOccurrence {
  const resolution = resolveDependencyReference(sourceFile, dependencyText);

  return {
    dependencyText,
    symbolName:
      resolution.importedName ??
      dependencyText.split('.').pop() ??
      dependencyText,
    moduleSpecifier: resolution.moduleSpecifier,
    metadataContext,
  };
}

function extractProvidedDependencies(
  sourceFile: SourceFile,
  classDeclaration: ClassDeclaration,
  angularKind: AngularKind,
  options: NormalizedOptions,
): ProvidedDependencyExtractionResult {
  const metadata = getDecoratorMetadataObject(classDeclaration);
  const warnings: string[] = [];
  const entries: GeneratedDependencyEntry[] = [];

  if (!metadata) {
    return { entries, warnings };
  }

  if (options.includeProviders) {
    entries.push(
      ...extractProvidedDependencyArrayProperty(
        sourceFile,
        metadata,
        'providers',
        warnings,
      ),
    );
  }

  if (options.includeViewProviders && angularKind === 'component') {
    entries.push(
      ...extractProvidedDependencyArrayProperty(
        sourceFile,
        metadata,
        'viewProviders',
        warnings,
      ),
    );
  }

  return {
    entries: mergeGeneratedDependencyEntries(entries),
    warnings,
  };
}

function extractProvidedDependencyArrayProperty(
  sourceFile: SourceFile,
  metadata: ObjectLiteralExpression,
  propertyName: 'providers' | 'viewProviders',
  warnings: string[],
): GeneratedDependencyEntry[] {
  const property = getObjectPropertyAssignment(metadata, propertyName);
  if (!property) {
    return [];
  }

  const initializer = property.getInitializer();
  if (!Node.isArrayLiteralExpression(initializer)) {
    warnings.push(
      `Skipped metadata property "${propertyName}" because it is not a static array.`,
    );
    return [];
  }

  return extractProvidedDependencyEntriesFromArray(
    sourceFile,
    initializer,
    propertyName,
    warnings,
  );
}

function extractProvidedDependencyEntriesFromArray(
  sourceFile: SourceFile,
  arrayLiteral: ArrayLiteralExpression,
  context: 'providers' | 'viewProviders',
  warnings: string[],
): GeneratedDependencyEntry[] {
  const entries: GeneratedDependencyEntry[] = [];

  for (const element of arrayLiteral.getElements()) {
    if (Node.isArrayLiteralExpression(element)) {
      entries.push(
        ...extractProvidedDependencyEntriesFromArray(
          sourceFile,
          element,
          context,
          warnings,
        ),
      );
      continue;
    }

    if (Node.isSpreadElement(element)) {
      warnings.push(
        `Skipped spread element in "${context}" metadata providers.`,
      );
      continue;
    }

    if (Node.isCallExpression(element)) {
      const providerFactory = getStaticExpressionText(element.getExpression());
      if (!providerFactory) {
        warnings.push(
          `Skipped complex provider factory "${element.getText()}" in "${context}".`,
        );
        continue;
      }

      entries.push({
        key: createGeneratedDependencyKey(providerFactory),
        typeText: `ReturnType<typeof ${providerFactory}>`,
      });
      continue;
    }

    const staticExpression = getStaticExpressionText(element);
    if (staticExpression) {
      entries.push({
        key: createGeneratedDependencyKey(staticExpression),
        typeText: createGeneratedDependencyTypeText(
          sourceFile,
          staticExpression,
        ),
      });
      continue;
    }

    if (Node.isObjectLiteralExpression(element)) {
      const providerEntry = extractProvidedDependencyEntryFromObjectLiteral(
        sourceFile,
        element,
        context,
        warnings,
      );
      if (providerEntry) {
        entries.push(providerEntry);
      }
      continue;
    }

    warnings.push(
      `Skipped complex expression "${element.getText()}" in "${context}" metadata providers.`,
    );
  }

  return entries;
}

function extractProvidedDependencyEntryFromObjectLiteral(
  sourceFile: SourceFile,
  objectLiteral: ObjectLiteralExpression,
  context: 'providers' | 'viewProviders',
  warnings: string[],
): GeneratedDependencyEntry | undefined {
  const provideProperty = getObjectPropertyAssignment(objectLiteral, 'provide');
  const provideText = getStaticExpressionText(
    provideProperty?.getInitializer(),
  );

  if (!provideText) {
    warnings.push(
      `Skipped provider object in "${context}" because "provide" is not static.`,
    );
    return undefined;
  }

  const useClass = getStaticExpressionText(
    getObjectPropertyAssignment(objectLiteral, 'useClass')?.getInitializer(),
  );
  const useExisting = getStaticExpressionText(
    getObjectPropertyAssignment(objectLiteral, 'useExisting')?.getInitializer(),
  );
  const useValue = getStaticExpressionText(
    getObjectPropertyAssignment(objectLiteral, 'useValue')?.getInitializer(),
  );
  const useFactory = getStaticExpressionText(
    getObjectPropertyAssignment(objectLiteral, 'useFactory')?.getInitializer(),
  );

  if (useFactory) {
    return {
      key: createGeneratedDependencyKey(provideText),
      typeText: `ReturnType<typeof ${useFactory}>`,
    };
  }

  if (useValue) {
    return {
      key: createGeneratedDependencyKey(provideText),
      typeText: `typeof ${useValue}`,
    };
  }

  const valueText = useClass ?? useExisting ?? provideText;
  return {
    key: createGeneratedDependencyKey(provideText),
    typeText: createGeneratedDependencyTypeText(sourceFile, valueText),
  };
}

function extractMetadataArrayProperty(
  metadata: ObjectLiteralExpression,
  propertyName: string,
  context: string,
  warnings: string[],
): string[] {
  const property = getObjectPropertyAssignment(metadata, propertyName);
  if (!property) {
    return [];
  }

  const initializer = property.getInitializer();
  if (!Node.isArrayLiteralExpression(initializer)) {
    warnings.push(
      `Skipped metadata property "${propertyName}" because it is not a static array.`,
    );
    return [];
  }

  return extractStaticArrayElements(initializer, context, warnings);
}

function extractStaticArrayElements(
  arrayLiteral: ArrayLiteralExpression,
  context: string,
  warnings: string[],
): string[] {
  const dependencies: string[] = [];

  for (const element of arrayLiteral.getElements()) {
    if (Node.isArrayLiteralExpression(element)) {
      dependencies.push(
        ...extractStaticArrayElements(element, context, warnings),
      );
      continue;
    }

    if (Node.isSpreadElement(element)) {
      warnings.push(
        `Skipped spread element in "${context}" metadata dependencies.`,
      );
      continue;
    }

    if (isProviderContext(context) && Node.isCallExpression(element)) {
      const providerFactory = getStaticExpressionText(element.getExpression());
      if (providerFactory) {
        dependencies.push(providerFactory);
        continue;
      }
    }

    const dependency = getStaticExpressionText(element);
    if (dependency) {
      dependencies.push(dependency);
      continue;
    }

    if (Node.isObjectLiteralExpression(element)) {
      dependencies.push(
        ...extractStaticObjectElementDependencies(element, context, warnings),
      );
      continue;
    }

    warnings.push(
      `Skipped complex expression "${element.getText()}" in "${context}" metadata dependencies.`,
    );
  }

  return dependencies;
}

function isProviderContext(context: string): boolean {
  return context === 'providers' || context === 'viewProviders';
}

function extractStaticObjectElementDependencies(
  objectLiteral: ObjectLiteralExpression,
  context: string,
  warnings: string[],
): string[] {
  const dependencies: string[] = [];
  const knownValueProperties =
    context === 'hostDirectives'
      ? new Set(['directive'])
      : new Set(['provide', 'useClass', 'useExisting']);

  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      warnings.push(
        `Skipped complex object member in "${context}" metadata dependencies.`,
      );
      continue;
    }

    const propertyName = getStaticPropertyName(property.getNameNode());

    if (!propertyName || !knownValueProperties.has(propertyName)) {
      continue;
    }

    const dependency = getStaticExpressionText(property.getInitializer());
    if (dependency) {
      dependencies.push(dependency);
      continue;
    }

    warnings.push(
      `Skipped complex "${propertyName}" value in "${context}" metadata dependencies.`,
    );
  }

  return dependencies;
}

function getInjectDecoratorToken(
  decorators: Decorator[],
  warnings: string[],
): InjectDecoratorTokenResult {
  for (const decorator of decorators) {
    if (getDecoratorName(decorator) !== 'Inject') {
      continue;
    }

    const [token] = decorator.getCallExpression()?.getArguments() ?? [];
    const dependency = getStaticExpressionText(token);
    if (!dependency) {
      warnings.push(
        'Skipped @Inject() dependency because the token is not a static identifier.',
      );
      return { found: true };
    }

    return { found: true, dependency };
  }

  return { found: false };
}

function getStaticExpressionText(
  expression: Node | undefined,
): string | undefined {
  if (!expression) {
    return undefined;
  }

  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getText();
  }

  return undefined;
}

function getStaticPropertyName(nameNode: Node): string | undefined {
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }

  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }

  return undefined;
}

function resolveDependencyReference(
  sourceFile: SourceFile,
  dependencyText: string,
): DependencyReferenceResolution {
  const [rootIdentifier] = dependencyText.split('.');
  if (!rootIdentifier) {
    return { kind: 'unknown' };
  }

  const importResolution = resolveImportedDependencyReference(
    sourceFile,
    dependencyText,
    rootIdentifier,
  );
  if (importResolution) {
    return importResolution;
  }

  const localClass = sourceFile.getClass(rootIdentifier);
  if (localClass) {
    return { kind: 'class', classDeclaration: localClass };
  }

  if (sourceFile.getEnum(rootIdentifier)) {
    return { kind: 'enum' };
  }

  if (sourceFile.getFunction(rootIdentifier)) {
    return { kind: 'function' };
  }

  if (
    sourceFile
      .getVariableDeclarations()
      .some((declaration) => declaration.getName() === rootIdentifier)
  ) {
    return { kind: 'variable' };
  }

  return { kind: 'unknown' };
}

function resolveImportedDependencyReference(
  sourceFile: SourceFile,
  dependencyText: string,
  rootIdentifier: string,
): DependencyReferenceResolution | undefined {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();

    if (importDeclaration.getDefaultImport()?.getText() === rootIdentifier) {
      const declaration = getDefaultImportClassDeclaration(importDeclaration);
      if (declaration) {
        return {
          kind: 'class',
          classDeclaration: declaration,
          importedName: rootIdentifier,
          moduleSpecifier,
        };
      }

      return { kind: 'unknown', importedName: rootIdentifier, moduleSpecifier };
    }

    if (importDeclaration.getNamespaceImport()?.getText() === rootIdentifier) {
      const declaration = getNamespaceImportClassDeclaration(
        importDeclaration,
        dependencyText,
      );
      if (declaration) {
        return {
          kind: 'class',
          classDeclaration: declaration,
          importedName: dependencyText.split('.').pop(),
          moduleSpecifier,
        };
      }

      return {
        kind: 'namespace',
        importedName: dependencyText.split('.').pop(),
        moduleSpecifier,
      };
    }

    const namedImport = importDeclaration
      .getNamedImports()
      .find((specifier) => {
        const localName =
          specifier.getAliasNode()?.getText() ??
          specifier.getNameNode().getText();
        return localName === rootIdentifier;
      });

    if (!namedImport) {
      continue;
    }

    const localIdentifier =
      namedImport.getAliasNode() ?? namedImport.getNameNode();
    const symbol =
      localIdentifier.getSymbol() ?? localIdentifier.getType().getSymbol();
    const aliasedSymbol = symbol?.getAliasedSymbol() ?? symbol;
    const declarations = aliasedSymbol?.getDeclarations() ?? [];
    const classDeclaration = declarations.find((declaration) =>
      Node.isClassDeclaration(declaration),
    );

    if (classDeclaration && Node.isClassDeclaration(classDeclaration)) {
      return {
        kind: 'class',
        classDeclaration,
        importedName: namedImport.getNameNode().getText(),
        moduleSpecifier,
      };
    }

    if (
      declarations.some((declaration) => Node.isEnumDeclaration(declaration))
    ) {
      return {
        kind: 'enum',
        importedName: namedImport.getNameNode().getText(),
        moduleSpecifier,
      };
    }

    if (
      declarations.some((declaration) =>
        Node.isFunctionDeclaration(declaration),
      )
    ) {
      return {
        kind: 'function',
        importedName: namedImport.getNameNode().getText(),
        moduleSpecifier,
      };
    }

    if (
      declarations.some((declaration) =>
        Node.isVariableDeclaration(declaration),
      )
    ) {
      return {
        kind: 'variable',
        importedName: namedImport.getNameNode().getText(),
        moduleSpecifier,
      };
    }

    return {
      kind: 'unknown',
      importedName: namedImport.getNameNode().getText(),
      moduleSpecifier,
    };
  }

  return undefined;
}

function getDefaultImportClassDeclaration(
  importDeclaration: import('ts-morph').ImportDeclaration,
): ClassDeclaration | undefined {
  const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFile();
  if (!moduleSourceFile) {
    return undefined;
  }

  const defaultExportSymbol = moduleSourceFile.getDefaultExportSymbol();
  const declarations = defaultExportSymbol?.getDeclarations() ?? [];
  return declarations.find((declaration) =>
    Node.isClassDeclaration(declaration),
  ) as ClassDeclaration | undefined;
}

function getNamespaceImportClassDeclaration(
  importDeclaration: import('ts-morph').ImportDeclaration,
  dependencyText: string,
): ClassDeclaration | undefined {
  const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFile();
  if (!moduleSourceFile) {
    return undefined;
  }

  const leafIdentifier = dependencyText.split('.').pop();
  if (!leafIdentifier) {
    return undefined;
  }

  const exportedDeclarations =
    moduleSourceFile.getExportedDeclarations().get(leafIdentifier) ?? [];
  return exportedDeclarations.find((declaration) =>
    Node.isClassDeclaration(declaration),
  ) as ClassDeclaration | undefined;
}

function isProvidedInInjectableTree(
  sourceFile: SourceFile,
  dependencyText: string,
): boolean {
  const resolution = resolveDependencyReference(sourceFile, dependencyText);
  const classDeclaration = resolution.classDeclaration;

  if (!classDeclaration || getAngularKind(classDeclaration) !== 'injectable') {
    return false;
  }

  const metadata = getDecoratorMetadataObject(classDeclaration);
  const providedInProperty = metadata
    ? getObjectPropertyAssignment(metadata, 'providedIn')
    : undefined;
  const initializer = providedInProperty?.getInitializer();

  if (!initializer) {
    return false;
  }

  return (
    !Node.isNullLiteral(initializer) &&
    !Node.isFalseLiteral(initializer) &&
    !(Node.isIdentifier(initializer) && initializer.getText() === 'undefined')
  );
}

function shouldGenerateLocalMissingProvider(
  sourceFile: SourceFile,
  dependencyText: string,
): boolean {
  return (
    !resolveTrackedInjectHelperByName(sourceFile, dependencyText) &&
    !isProvidedInInjectableTree(sourceFile, dependencyText)
  );
}

function resolveTrackedInjectHelperByName(
  sourceFile: SourceFile,
  dependencyText: string,
): TrackedHelperResolution | undefined {
  const [rootIdentifier] = dependencyText.split('.');
  if (!rootIdentifier) {
    return undefined;
  }

  for (const declaration of resolveDependencyIdentifierDeclarations(
    sourceFile,
    rootIdentifier,
  )) {
    const helper = resolveTrackedInjectHelperFromDeclaration(declaration);
    if (helper) {
      return helper;
    }
  }

  return undefined;
}

function resolveDependencyIdentifierDeclarations(
  sourceFile: SourceFile,
  rootIdentifier: string,
): Node[] {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const namedImport = importDeclaration
      .getNamedImports()
      .find((specifier) => {
        const localName =
          specifier.getAliasNode()?.getText() ??
          specifier.getNameNode().getText();
        return localName === rootIdentifier;
      });

    if (!namedImport) {
      continue;
    }

    const identifier = namedImport.getAliasNode() ?? namedImport.getNameNode();
    const symbol = identifier.getSymbol() ?? identifier.getType().getSymbol();
    const aliasedSymbol = symbol?.getAliasedSymbol() ?? symbol;
    return aliasedSymbol?.getDeclarations() ?? [namedImport];
  }

  return sourceFile
    .getDescendantsOfKind(SyntaxKind.BindingElement)
    .filter((bindingElement) => bindingElement.getName() === rootIdentifier);
}

function getDependencyTextFromTypeNode(typeNode: TypeNode): string | undefined {
  if (isPrimitiveTypeNode(typeNode)) {
    return undefined;
  }

  if (Node.isTypeReference(typeNode)) {
    const typeName = typeNode.getTypeName();
    const dependency = typeName.getText();
    return isPrimitiveDependencyText(dependency) ? undefined : dependency;
  }

  if (Node.isExpressionWithTypeArguments(typeNode)) {
    const expression = typeNode.getExpression();
    return getStaticExpressionText(expression);
  }

  return undefined;
}

function isPrimitiveTypeNode(typeNode: TypeNode): boolean {
  return [
    SyntaxKind.AnyKeyword,
    SyntaxKind.BigIntKeyword,
    SyntaxKind.BooleanKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NeverKeyword,
    SyntaxKind.NullKeyword,
    SyntaxKind.NumberKeyword,
    SyntaxKind.ObjectKeyword,
    SyntaxKind.StringKeyword,
    SyntaxKind.SymbolKeyword,
    SyntaxKind.TrueKeyword,
    SyntaxKind.UndefinedKeyword,
    SyntaxKind.UnknownKeyword,
    SyntaxKind.VoidKeyword,
  ].includes(typeNode.getKind());
}

function isPrimitiveDependencyText(dependency: string): boolean {
  return PRIMITIVE_TYPE_TEXTS.has(dependency);
}

function isRuntimeSafeTypeDependency(
  typeNode: TypeNode,
  dependency: string,
): boolean {
  const identifiers = getDependencyIdentifiersFromTypeNode(typeNode);
  if (
    identifiers.length === 0 ||
    identifiers.map((identifier) => identifier.getText()).join('.') !==
      dependency
  ) {
    return false;
  }

  const [rootIdentifier] = identifiers;
  const leafIdentifier = identifiers[identifiers.length - 1];
  const isQualifiedDependency = identifiers.length > 1;

  return (
    isRuntimeSafeIdentifier(rootIdentifier, {
      allowNamespaceContainer: isQualifiedDependency,
    }) &&
    isRuntimeSafeIdentifier(leafIdentifier, { allowNamespaceContainer: false })
  );
}

function getDependencyIdentifiersFromTypeNode(
  typeNode: TypeNode,
): Identifier[] {
  if (!Node.isTypeReference(typeNode)) {
    return [];
  }

  const typeName = typeNode.getTypeName();
  if (Node.isIdentifier(typeName)) {
    return [typeName];
  }

  return typeName.getDescendantsOfKind(SyntaxKind.Identifier);
}

function isRuntimeSafeIdentifier(
  identifier: Identifier,
  options: { allowNamespaceContainer: boolean },
): boolean {
  const symbol = identifier.getSymbol() ?? identifier.getType().getSymbol();
  if (!symbol) {
    return false;
  }

  const declarations = symbol.getDeclarations();
  if (declarations.length === 0) {
    return false;
  }

  if (
    declarations.some((declaration) => isTypeOnlyImportDeclaration(declaration))
  ) {
    return false;
  }

  if (
    options.allowNamespaceContainer &&
    declarations.some((declaration) => Node.isNamespaceImport(declaration))
  ) {
    return true;
  }

  const aliasedSymbol = symbol.getAliasedSymbol();
  const runtimeDeclarations = aliasedSymbol?.getDeclarations() ?? declarations;
  if (runtimeDeclarations.length === 0) {
    return false;
  }

  return runtimeDeclarations.some((declaration) =>
    isRuntimeValueDeclaration(declaration, options),
  );
}

function isTypeOnlyImportDeclaration(declaration: Node): boolean {
  if (Node.isImportSpecifier(declaration)) {
    return (
      declaration.isTypeOnly() ||
      declaration.getImportDeclaration().isTypeOnly()
    );
  }

  if (Node.isImportClause(declaration)) {
    return declaration.isTypeOnly();
  }

  if (Node.isNamespaceImport(declaration)) {
    return (
      declaration
        .getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
        ?.isTypeOnly() ?? false
    );
  }

  return false;
}

function isRuntimeValueDeclaration(
  declaration: Node,
  options: { allowNamespaceContainer: boolean },
): boolean {
  if (
    Node.isClassDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration) ||
    Node.isFunctionDeclaration(declaration) ||
    Node.isVariableDeclaration(declaration)
  ) {
    return true;
  }

  if (
    options.allowNamespaceContainer &&
    Node.isModuleDeclaration(declaration)
  ) {
    return true;
  }

  return false;
}

function getExportRewriteSafety(
  sourceFile: SourceFile,
  classDeclaration: ClassDeclaration,
  className: string,
): { safe: true; warnings: [] } | { safe: false; warnings: string[] } {
  const warnings: string[] = [];

  for (const statement of sourceFile.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.isDefaultExport()) {
      warnings.push(
        'Skipped file because it has an unrelated default-exported function.',
      );
    }

    if (
      Node.isClassDeclaration(statement) &&
      statement !== classDeclaration &&
      statement.isDefaultExport()
    ) {
      warnings.push(
        'Skipped file because it has an unrelated default-exported class.',
      );
    }
  }

  for (const exportAssignment of sourceFile.getExportAssignments()) {
    if (exportAssignment.isExportEquals()) {
      warnings.push(
        'Skipped file because export = is not safe to combine with export default.',
      );
      continue;
    }

    if (
      !isDefaultIdentifierExport(exportAssignment, className) &&
      !isDefaultBrandedExport(exportAssignment, className)
    ) {
      warnings.push(
        `Skipped file because it has a complex default export: ${exportAssignment.getText()}`,
      );
    }
  }

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const defaultExportSpecifier = exportDeclaration
      .getNamedExports()
      .find((specifier) => {
        const alias = specifier.getAliasNode()?.getText();
        return (
          alias === 'default' || (!alias && specifier.getName() === 'default')
        );
      });

    if (
      defaultExportSpecifier &&
      defaultExportSpecifier.getName() !== className
    ) {
      warnings.push(
        'Skipped file because it has an unrelated named default export.',
      );
    }

    if (exportDeclaration.getModuleSpecifier()) {
      const reExportsClass = exportDeclaration
        .getNamedExports()
        .some((specifier) => specifier.getName() === className);
      if (reExportsClass) {
        warnings.push(
          `Skipped file because it re-exports "${className}" from another module.`,
        );
      }
    }
  }

  return warnings.length === 0
    ? { safe: true, warnings: [] }
    : { safe: false, warnings };
}

function getHelperImportSafety(
  sourceFile: SourceFile,
  helperImportPath: string,
): { safe: true; warnings: [] } | { safe: false; warnings: string[] } {
  const warnings = [
    'DerivedService',
    'GetDeps',
    'GetServiceDependencies',
    'GetPublicComponentProperties',
    'GetServiceOutput',
  ]
    .filter((helperName) =>
      hasConflictingTopLevelBinding(sourceFile, helperImportPath, helperName),
    )
    .map(
      (helperName) =>
        `Skipped file because "${helperName}" is already bound to a different top-level symbol.`,
    );

  return warnings.length === 0
    ? { safe: true, warnings: [] }
    : { safe: false, warnings };
}

function hasConflictingTopLevelBinding(
  sourceFile: SourceFile,
  helperImportPath: string,
  helperName: string,
): boolean {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (importDeclaration.getDefaultImport()?.getText() === helperName) {
      return true;
    }

    if (importDeclaration.getNamespaceImport()?.getText() === helperName) {
      return true;
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const localName =
        namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      if (localName !== helperName) {
        continue;
      }

      return importDeclaration.getModuleSpecifierValue() !== helperImportPath;
    }
  }

  for (const statement of sourceFile.getStatements()) {
    if (
      Node.isClassDeclaration(statement) &&
      statement.getName() === helperName
    ) {
      return true;
    }

    if (
      Node.isFunctionDeclaration(statement) &&
      statement.getName() === helperName
    ) {
      return true;
    }

    if (
      Node.isEnumDeclaration(statement) &&
      statement.getName() === helperName
    ) {
      return true;
    }

    if (
      Node.isInterfaceDeclaration(statement) &&
      statement.getName() === helperName
    ) {
      return true;
    }

    if (
      Node.isTypeAliasDeclaration(statement) &&
      statement.getName() === helperName
    ) {
      return true;
    }

    if (Node.isVariableStatement(statement)) {
      const hasVariableName = statement
        .getDeclarationList()
        .getDeclarations()
        .some((declaration) => declaration.getName() === helperName);
      if (hasVariableName) {
        return true;
      }
    }
  }

  return false;
}

function isDefaultIdentifierExport(
  exportAssignment: ExportAssignment,
  className: string,
): boolean {
  if (exportAssignment.isExportEquals()) {
    return false;
  }

  const expression = exportAssignment.getExpression();
  return Node.isIdentifier(expression) && expression.getText() === className;
}

function isDefaultBrandedExport(
  exportAssignment: ExportAssignment,
  className: string,
): boolean {
  if (exportAssignment.isExportEquals()) {
    return false;
  }

  const expression = exportAssignment.getExpression();
  if (!Node.isCallExpression(expression)) {
    return false;
  }

  const callTarget = expression.getExpression();
  if (
    !Node.isIdentifier(callTarget) ||
    callTarget.getText() !== 'brandAngularSymbol'
  ) {
    return false;
  }

  const [targetClass] = expression.getArguments();
  return Node.isIdentifier(targetClass) && targetClass.getText() === className;
}

function removeClassFromExportDeclaration(
  exportDeclaration: ExportDeclaration,
  className: string,
): void {
  if (exportDeclaration.getModuleSpecifier()) {
    return;
  }

  for (const namedExport of exportDeclaration.getNamedExports()) {
    if (namedExport.getName() === className) {
      namedExport.remove();
    }
  }

  if (exportDeclaration.getNamedExports().length === 0) {
    exportDeclaration.remove();
  }
}

function hasLocalNamedImport(
  sourceFile: SourceFile,
  helperImportPath: string,
  importName: string,
): boolean {
  return sourceFile.getImportDeclarations().some((importDeclaration) => {
    if (importDeclaration.getModuleSpecifierValue() !== helperImportPath) {
      return false;
    }

    return importDeclaration.getNamedImports().some((namedImport) => {
      const localName =
        namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      return localName === importName;
    });
  });
}

function createProject(tsConfigFilePath: string | undefined): Project {
  if (tsConfigFilePath) {
    return new Project({
      skipAddingFilesFromTsConfig: true,
      tsConfigFilePath,
    });
  }

  return new Project({
    compilerOptions: {
      experimentalDecorators: true,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2022,
    },
  });
}

function getDefaultTsConfigPath(rootDir: string): string | undefined {
  const tsConfigPath = join(rootDir, 'tsconfig.json');
  return existsSync(tsConfigPath) ? tsConfigPath : undefined;
}

function collectTypeScriptFiles(rootDir: string): string[] {
  const files: string[] = [];
  collectTypeScriptFilesInto(rootDir, files);
  return files;
}

function collectTypeScriptFilesInto(directory: string, files: string[]): void {
  for (const entryName of readdirSync(directory)) {
    const entryPath = join(directory, entryName);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entryName)) {
        collectTypeScriptFilesInto(entryPath, files);
      }
      continue;
    }

    if (
      !stats.isFile() ||
      extname(entryName) !== '.ts' ||
      isGeneratedFile(entryPath)
    ) {
      continue;
    }

    files.push(entryPath);
  }
}

function isGeneratedFile(filePath: string): boolean {
  const fileName = basename(filePath);
  return (
    GENERATED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix)) ||
    filePath.includes('/generated/') ||
    filePath.includes('\\generated\\')
  );
}

function setProjectQuoteKind(project: Project): void {
  const firstModuleSpecifier = project
    .getSourceFiles()
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .map((importDeclaration) =>
      importDeclaration.getModuleSpecifier().getText(),
    )
    .find(Boolean);

  project.manipulationSettings.set({
    quoteKind: firstModuleSpecifier?.startsWith('"')
      ? QuoteKind.Double
      : QuoteKind.Single,
  });
}

function isWithinRoot(filePath: string, rootDir: string): boolean {
  const absoluteFilePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  return (
    absoluteFilePath === rootDir || absoluteFilePath.startsWith(`${rootDir}/`)
  );
}

function logFileResult(
  report: RunFileReport,
  log: (message: string) => void,
): void {
  if (!report.changed && !report.skipped && !report.angularKind) {
    return;
  }

  const status = report.changed
    ? 'transformed'
    : report.skipped
      ? 'skipped'
      : 'unchanged';
  const details = [
    `file=${report.filePath}`,
    report.angularKind ? `kind=${report.angularKind}` : undefined,
    report.className ? `class=${report.className}` : undefined,
    `deps=[${report.generatedDependencyGroups.deps.map((entry) => entry.key).join(', ')}]`,
    `provided=[${report.generatedDependencyGroups.provided.map((entry) => entry.key).join(', ')}]`,
    `missingProvider=[${report.generatedDependencyGroups.missingProvider.map((entry) => entry.key).join(', ')}]`,
    `status=${status}`,
  ].filter(Boolean);

  log(details.join(' '));

  for (const warning of report.warnings) {
    log(`  warning: ${warning}`);
  }
}

function logSummary(summary: RunSummary, log: (message: string) => void): void {
  log(
    [
      `summary transformed=${summary.transformedFiles}`,
      `skipped=${summary.skippedFiles}`,
      `warnings=${summary.warnings}`,
      `components=${summary.countByAngularKind.component}`,
      `directives=${summary.countByAngularKind.directive}`,
      `pipes=${summary.countByAngularKind.pipe}`,
      `injectables=${summary.countByAngularKind.injectable}`,
    ].join(' '),
  );
}

function parseCliArgs(argv: string[]): AngularBrandCodemodOptions & {
  rootDir?: string;
  tsConfigFilePath?: string;
  dryRun?: boolean;
} {
  const options: AngularBrandCodemodOptions & {
    rootDir?: string;
    tsConfigFilePath?: string;
    dryRun?: boolean;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--root':
        options.rootDir = argv[++index];
        break;
      case '--tsconfig':
        options.tsConfigFilePath = argv[++index];
        break;
      case '--config':
        options.configFilePath = argv[++index];
        break;
      case '--helper-import':
        options.helperImportPath = argv[++index];
        break;
      case '--transform-only-standalone-declarables':
        options.transformOnlyStandaloneDeclarables = true;
        break;
      case '--no-providers':
        options.includeProviders = false;
        break;
      case '--no-view-providers':
        options.includeViewProviders = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        printHelpAndExit();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelpAndExit(): never {
  console.log(`Usage: craft-brand [options]

Options:
  --root <dir>                                  Project root. Defaults to cwd.
  --tsconfig <path>                            tsconfig path. Defaults to <root>/tsconfig.json.
  --config <path>                              Explicit angular brand config file path.
  --helper-import <path>                       Import path for GetDeps.
  --transform-only-standalone-declarables      Only transform standalone components/directives.
  --no-providers                               Do not include metadata providers in generated types.
  --no-view-providers                          Do not include component viewProviders in generated types.
  --dry-run                                    Print results without writing files.
  --help                                       Show this help.
`);
  process.exit(0);
}

// Check if this module is being run directly (ESM equivalent of require.main === module)
if (
  import.meta.url === `file://${process.argv[1]}` ||
  (import.meta.url.startsWith('file:') &&
    process.argv[1] === fileURLToPath(import.meta.url))
) {
  runAngularBrandCodemod(parseCliArgs(process.argv.slice(2))).catch(
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
