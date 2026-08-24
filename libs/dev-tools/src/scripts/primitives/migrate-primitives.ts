import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  CallExpression,
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
import type {
  PrimitiveMigrationDiagnostic,
  PrimitiveMigrationDiagnosticCode,
} from './migration-diagnostic.js';
import { migrateYieldableReactiveReads } from './migrate-yieldable-reactive-reads.js';
import {
  migrateNamedPrimitivesInFile,
  type UnmigratedCall,
} from './migrate-named-primitives.js';
import { migratePrimitiveGeneratorsInFile } from './migrate-primitive-generators.js';

const execFileAsync = promisify(execFile);

export type MigratePrimitivesOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  files?: readonly string[];
  write?: boolean;
  check?: boolean;
  json?: boolean;
  jsonFilePath?: string;
  failOnManual?: boolean;
  eslint?: boolean;
  log?: (message: string) => void;
};

export type MigratedPrimitiveFile = {
  filePath: string;
  changed: boolean;
};

export type MigratePrimitivesResult = {
  changedFiles: string[];
  files: MigratedPrimitiveFile[];
  diagnostics: PrimitiveMigrationDiagnostic[];
  remainingAngularSignals: number;
  remainingSignalForms: number;
  eslintRan: boolean;
  exitCode: number;
};

export async function runPrimitivesMigration(
  options: MigratePrimitivesOptions = {},
): Promise<MigratePrimitivesResult> {
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

  const selected = options.files?.length
    ? new Set(options.files.map((file) => resolve(rootDir, file)))
    : undefined;
  const sourceFiles = project.getSourceFiles().filter((file) => {
    const path = resolve(file.getFilePath());
    return isInside(path, rootDir) && (!selected || selected.has(path));
  });

  const files = new Map<string, MigratedPrimitiveFile>();
  const touched = new Set<SourceFile>();
  const diagnostics: PrimitiveMigrationDiagnostic[] = [];

  for (const sourceFile of sourceFiles) {
    // Name existing Craft primitive creations before Angular APIs are
    // converted. A string-valued Angular signal config is otherwise
    // indistinguishable from the first argument of a named `state(...)`.
    const unmigratedNames: UnmigratedCall[] = [];
    const changedNamedPrimitives = migrateNamedPrimitivesInFile(
      sourceFile,
      unmigratedNames,
    );
    for (const unmigrated of unmigratedNames) {
      if (unmigrated.reason === 'already takes a name argument') continue;
      diagnose(
        diagnostics,
        'PRIMITIVE_NAME_REQUIRES_REVIEW',
        sourceFile,
        `${unmigrated.primitive}(${unmigrated.text}) ne peut pas recevoir un nom déterministe automatiquement: ${unmigrated.reason}.`,
      );
    }
    const changedSignals = migrateSignalsToState(sourceFile);
    const changedResources = migrateSingleEmissionRxResources(
      sourceFile,
      diagnostics,
    );
    const changedWorkflows = annotateImperativeWorkflows(
      sourceFile,
      diagnostics,
    );
    const changedFormTreeInserts = annotateFormTreeInsertExtractions(
      sourceFile,
      diagnostics,
    );
    const changedPrimitiveGenerators = migratePrimitiveGeneratorsInFile(
      sourceFile,
    );
    const changedYieldableReads = migrateYieldableReactiveReads(sourceFile).changed;
    diagnoseSignalForms(sourceFile, diagnostics);
    if (
      changedSignals ||
      changedResources ||
      changedWorkflows ||
      changedFormTreeInserts ||
      changedNamedPrimitives ||
      changedPrimitiveGenerators ||
      changedYieldableReads
    )
      touched.add(sourceFile);
    if (
      changedSignals ||
      changedResources ||
      changedWorkflows ||
      changedFormTreeInserts ||
      changedNamedPrimitives ||
      changedPrimitiveGenerators ||
      changedYieldableReads
    )
      getFileReport(files, sourceFile.getFilePath()).changed = true;
  }

  for (const file of touched) file.organizeImports();

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

  const remainingAngularSignals = countAngularSignalImports(project, rootDir);
  const remainingSignalForms = countSignalFormImports(project, rootDir);
  const result: MigratePrimitivesResult = {
    changedFiles: [...touched].map((file) => file.getFilePath()),
    files: [...files.values()],
    diagnostics,
    remainingAngularSignals,
    remainingSignalForms,
    eslintRan,
    exitCode:
      (options.check &&
        (remainingAngularSignals > 0 || remainingSignalForms > 0)) ||
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

function migrateSignalsToState(sourceFile: SourceFile): boolean {
  const angularCore = sourceFile.getImportDeclaration('@angular/core');
  const signalImport = angularCore
    ?.getNamedImports()
    .find((item) => item.getName() === 'signal');
  if (!signalImport) return false;

  let changed = false;
  const declarationsToAnnotate = new Set<Node>();
  for (const call of [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression),
  ]) {
    if (call.wasForgotten()) continue;
    if (call.getExpression().getText() !== 'signal') continue;
    const typeArgument = call.getTypeArguments()[0];
    const initialValue = call.getArguments()[0];
    if (!initialValue) continue;
    const value = typeArgument
      ? `${initialValue.getText()} as ${typeArgument.getText()} satisfies ${typeArgument.getText()}`
      : initialValue.getText();
    const declaration = findImperativeStateDeclaration(call);
    if (declaration) declarationsToAnnotate.add(declaration);
    const bindingName = readStateBindingName(call);
    const stateCall = bindingName
      ? `state('${bindingName}', ${value}, ({ set, update }) => ({ set, update }))`
      : `state(${value}, ({ set, update }) => ({ set, update }))`;
    call.replaceWithText(
      stateCall,
    );
    changed = true;
  }
  for (const declaration of [...declarationsToAnnotate].sort(
    (left, right) => right.getStart() - left.getStart(),
  )) {
    if (declaration.wasForgotten()) continue;
    declaration.replaceWithText(
      `${IMPERATIVE_STATE_COMMENT}\n${declaration.getText()}`,
    );
  }

  if (!changed) return false;
  signalImport.remove();
  if (
    angularCore &&
    !angularCore.getDefaultImport() &&
    !angularCore.getNamespaceImport() &&
    angularCore.getNamedImports().length === 0
  )
    angularCore.remove();
  ensureCoreImports(sourceFile, ['state']);
  return true;
}

function readStateBindingName(call: CallExpression): string | undefined {
  const property = call.getFirstAncestor((ancestor) =>
    Node.isPropertyDeclaration(ancestor),
  );
  if (property) {
    const name = property.getNameNode();
    if (Node.isIdentifier(name)) return name.getText();
  }
  const declaration = call.getFirstAncestor((ancestor) =>
    Node.isVariableDeclaration(ancestor),
  );
  if (!declaration) return undefined;
  const name = declaration.getNameNode();
  if (Node.isIdentifier(name)) return name.getText();
  return undefined;
}

const IMPERATIVE_STATE_COMMENT =
  '// CRAFT_IMPERATIVE_CODE_DETECTED: imperative code detected, prefer a declarative approach.';

function findImperativeStateDeclaration(
  call: CallExpression,
): Node | undefined {
  const declaration = call.getFirstAncestor(
    (ancestor) =>
      Node.isPropertyDeclaration(ancestor) ||
      Node.isVariableStatement(ancestor),
  );
  if (
    !declaration ||
    declaration.getFullText().includes('CRAFT_IMPERATIVE_CODE_DETECTED')
  )
    return undefined;
  return declaration;
}

const REACTIVE_WORKFLOW_COMMENT =
  '// CRAFT_REACTIVE_WORKFLOW_RECOMMENDED: workflow impératif détecté...';
const FIRST_VALUE_FROM_REVIEW_COMMENT =
  '// CRAFT_FIRST_VALUE_FROM_REVIEW: firstValueFrom bridges an Observable temporarily; prefer a Promise-native Craft API when possible.';
const FORM_TREE_INSERT_EXTRACTION_REVIEW_COMMENT =
  '// CRAFT_FORM_TREE_INSERT_EXTRACTION_REVIEW: makeFormTreeInsert sert surtout à extraire et découper une logique de formulaire; si cet insert n’est utilisé qu’ici, envisager de le placer directement dans insertForm.';

function annotateFormTreeInsertExtractions(
  sourceFile: SourceFile,
  diagnostics: PrimitiveMigrationDiagnostic[],
): boolean {
  const statements = new Set<Node>();
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== 'makeFormTreeInsert') continue;
    const statement = call.getFirstAncestor((ancestor) =>
      Node.isVariableStatement(ancestor),
    );
    if (statement) statements.add(statement);
  }

  let changed = false;
  for (const statement of [...statements].sort(
    (left, right) => right.getStart() - left.getStart(),
  )) {
    if (
      statement.wasForgotten() ||
      statement
        .getFullText()
        .includes('CRAFT_FORM_TREE_INSERT_EXTRACTION_REVIEW')
    )
      continue;
    statement.replaceWithText(
      `${FORM_TREE_INSERT_EXTRACTION_REVIEW_COMMENT}\n${statement.getText()}`,
    );
    changed = true;
  }
  if (changed) {
    diagnose(
      diagnostics,
      'FORM_TREE_INSERT_EXTRACTION_REQUIRES_REVIEW',
      sourceFile,
      '`makeFormTreeInsert(...)` est utile pour extraire une logique de formulaire; si l’insert n’a qu’un seul usage local, envisager de l’imbriquer directement dans `insertForm(...)`.',
    );
  }
  return changed;
}

function migrateSingleEmissionRxResources(
  sourceFile: SourceFile,
  diagnostics: PrimitiveMigrationDiagnostic[],
): boolean {
  const rxInterop = sourceFile.getImportDeclaration(
    '@angular/core/rxjs-interop',
  );
  if (
    !rxInterop
      ?.getNamedImports()
      .some((item) => item.getName() === 'rxResource')
  )
    return false;

  let changed = false;
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.wasForgotten() || call.getExpression().getText() !== 'rxResource')
      continue;
    const config = call.getArguments()[0];
    if (!config || !Node.isObjectLiteralExpression(config)) continue;
    const stream = config.getProperty('stream');
    if (!stream || !Node.isPropertyAssignment(stream)) continue;

    const converted = convertSingleEmissionStream(
      stream.getInitializer()?.getText() ?? '',
    );
    if (!converted) continue;

    call.getExpression().replaceWithText('query');
    stream.replaceWithText(`loader: ${converted}`);
    changed = true;
  }

  if (!changed) return false;
  ensureCoreImports(sourceFile, ['query']);
  ensureNamedImport(sourceFile, 'rxjs', 'firstValueFrom');
  removeNamedImportIfUnused(sourceFile, '@angular/core/rxjs-interop', 'rxResource');
  removeNamedImportIfUnused(sourceFile, 'rxjs', 'from');
  removeNamedImportIfUnused(sourceFile, 'rxjs', 'of');
  removeNamedImportIfUnused(sourceFile, 'rxjs/operators', 'switchMap');

  if (
    !sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => call.getExpression().getText() === 'rxResource')
  ) {
    removeDiagnostic(diagnostics, sourceFile, 'RX_RESOURCE_REQUIRES_QUERY');
  }
  return true;
}

function convertSingleEmissionStream(initializer: string): string | undefined {
  const match = initializer.match(
    /^\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*)\}\s*$/,
  );
  if (!match) return undefined;
  let body = match[2];
  const bridge = body.match(
    /return\s+from\(([\s\S]*?)\)\.pipe\(\s*switchMap\(\s*\((\w+)\)\s*=>\s*([\s\S]*?)\s*\)\s*\)\s*;/,
  );
  if (!bridge) return undefined;

  body = body.replace(/return\s+of\(([\s\S]*?)\)\s*;/g, 'return $1;');
  body = body.replace(
    bridge[0],
    `${FIRST_VALUE_FROM_REVIEW_COMMENT}\nreturn firstValueFrom((await ${bridge[1]}).${stripReceiver(bridge[3], bridge[2])});`,
  );
  return `async (${match[1]}) => {${body}}`;
}

function stripReceiver(expression: string, receiver: string): string {
  const trimmed = expression.trim();
  const prefix = `${receiver}.`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}

function ensureNamedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  let declaration = sourceFile.getImportDeclaration(moduleSpecifier);
  if (!declaration)
    declaration = sourceFile.addImportDeclaration({ moduleSpecifier });
  if (
    !declaration
      .getNamedImports()
      .some((namedImport) => namedImport.getName() === name)
  )
    declaration.addNamedImport(name);
}

function removeNamedImportIfUnused(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  const declaration = sourceFile.getImportDeclaration(moduleSpecifier);
  const namedImport = declaration
    ?.getNamedImports()
    .find((item) => item.getName() === name);
  if (!namedImport) return;
  const stillUsed = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === name &&
        identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !==
          declaration,
    );
  if (stillUsed) return;
  namedImport.remove();
  if (
    declaration &&
    !declaration.getDefaultImport() &&
    !declaration.getNamespaceImport() &&
    declaration.getNamedImports().length === 0
  )
    declaration.remove();
}

function removeDiagnostic(
  diagnostics: PrimitiveMigrationDiagnostic[],
  sourceFile: SourceFile,
  code: PrimitiveMigrationDiagnosticCode,
): void {
  const index = diagnostics.findIndex(
    (diagnostic) =>
      diagnostic.code === code &&
      diagnostic.filePath === sourceFile.getFilePath(),
  );
  if (index >= 0) diagnostics.splice(index, 1);
}

function annotateImperativeWorkflows(
  sourceFile: SourceFile,
  diagnostics: PrimitiveMigrationDiagnostic[],
): boolean {
  let changed = false;
  const functions = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
  ];
  for (const functionLike of functions) {
    if (
      functionLike.getFullText().includes('CRAFT_REACTIVE_WORKFLOW_RECOMMENDED')
    )
      continue;
    const calls = functionLike.getDescendantsOfKind(SyntaxKind.CallExpression);
    const hasSubmit = calls.some((call) => {
      const expression = call.getExpression();
      return (
        expression.getText() === 'submit' ||
        (Node.isPropertyAccessExpression(expression) &&
          expression.getName() === 'submit')
      );
    });
    if (!hasSubmit) continue;
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
    if (stateWrites < 2 && !(stateWrites >= 1 && hasNavigation)) continue;

    functionLike.replaceWithText(
      `${REACTIVE_WORKFLOW_COMMENT}\n${functionLike.getText()}`,
    );
    diagnose(
      diagnostics,
      'IMPERATIVE_WORKFLOW_REQUIRES_REVIEW',
      sourceFile,
      'Workflow impératif détecté: préférer insertFormSubmit avec une réaction au statut du formulaire, ou source$ avec on$/effect.',
    );
    changed = true;
  }
  return changed;
}

function diagnoseSignalForms(
  sourceFile: SourceFile,
  diagnostics: PrimitiveMigrationDiagnostic[],
): void {
  const formsImport = sourceFile.getImportDeclaration('@angular/forms/signals');
  if (!formsImport) return;
  const names = new Set(formsImport.getNamedImports().map((item) => item.getName()));
  if (names.has('form')) {
    diagnose(
      diagnostics,
      'SIGNAL_FORM_REQUIRES_INSERT_FORM',
      sourceFile,
      'Angular signal form `form(...)` doit être migré vers `state(..., insertForm(...))`; les chemins de champs doivent être remappés vers le form tree craft.',
    );
  }
  if (names.has('validateAsync')) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!isValidateAsyncRxResourceCall(call)) continue;
      diagnose(
        diagnostics,
        'ASYNC_VALIDATOR_REQUIRES_QUERY',
        sourceFile,
        '`validateAsync(...)` basé sur `rxResource(...)` doit devenir une `query(...)` locale déclenchée par la valeur du champ, puis `cAsyncValidate(queryRef, ...)`. Dans un craftService, créer la query avec `yield* query(...)` ; dans un champ de composant, `craftUse(query(...))`.',
      );
    }
  }
  if (sourceFile.getImportDeclaration('@angular/core/rxjs-interop')?.getNamedImports().some((item) => item.getName() === 'rxResource')) {
    diagnose(
      diagnostics,
      'RX_RESOURCE_REQUIRES_QUERY',
      sourceFile,
      '`rxResource(...)` doit être remplacé par `query(...)` ou `mutation(...)` selon l’intention; dans un validateur async, préférer `query(...) + cAsyncValidate(...)`. Dans un craftService, consommer toute primitive avec `yield*` ; dans un champ de composant, `craftUse(...)`.',
    );
  }
}

function isValidateAsyncRxResourceCall(call: CallExpression): boolean {
  if (call.getExpression().getText() !== 'validateAsync') return false;
  return call
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((inner) => inner.getExpression().getText() === 'rxResource');
}

function ensureCoreImports(file: SourceFile, names: string[]): void {
  let declaration = file.getImportDeclaration('@craft-ts/core');
  if (!declaration)
    declaration = file.addImportDeclaration({
      moduleSpecifier: '@craft-ts/core',
    });
  const existing = new Set(
    declaration.getNamedImports().map((item) => item.getName()),
  );
  declaration.addNamedImports(names.filter((name) => !existing.has(name)));
}

function diagnose(
  diagnostics: PrimitiveMigrationDiagnostic[],
  code: PrimitiveMigrationDiagnosticCode,
  sourceFile: SourceFile,
  message: string,
): void {
  if (
    diagnostics.some(
      (item) => item.code === code && item.filePath === sourceFile.getFilePath(),
    )
  )
    return;
  diagnostics.push({
    code,
    filePath: sourceFile.getFilePath(),
    message,
    manual: true,
  });
}

function countAngularSignalImports(project: Project, rootDir: string): number {
  return project
    .getSourceFiles()
    .filter((file) => isInside(resolve(file.getFilePath()), rootDir))
    .filter((file) =>
      file
        .getImportDeclaration('@angular/core')
        ?.getNamedImports()
        .some((item) => item.getName() === 'signal'),
    ).length;
}

function countSignalFormImports(project: Project, rootDir: string): number {
  return project
    .getSourceFiles()
    .filter((file) => isInside(resolve(file.getFilePath()), rootDir))
    .filter((file) => Boolean(file.getImportDeclaration('@angular/forms/signals')))
    .length;
}

function getFileReport(
  map: Map<string, MigratedPrimitiveFile>,
  filePath: string,
): MigratedPrimitiveFile {
  let report = map.get(filePath);
  if (!report) {
    report = { filePath, changed: false };
    map.set(filePath, report);
  }
  return report;
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
  result: MigratePrimitivesResult,
  log: (message: string) => void,
  wrote: boolean,
): void {
  log(
    `${wrote ? 'Migrated' : 'Would migrate'} ${result.changedFiles.length} file(s); ${result.diagnostics.length} manual diagnostic(s).`,
  );
  for (const diagnostic of result.diagnostics)
    log(`[${diagnostic.code}] ${diagnostic.filePath}: ${diagnostic.message}`);
}
