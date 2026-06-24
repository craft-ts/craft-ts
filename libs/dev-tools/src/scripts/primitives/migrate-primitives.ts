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
    const changedSignals = migrateSignalsToState(sourceFile);
    const changedWorkflows = annotateImperativeWorkflows(
      sourceFile,
      diagnostics,
    );
    diagnoseSignalForms(sourceFile, diagnostics);
    if (changedSignals || changedWorkflows) touched.add(sourceFile);
    if (changedSignals || changedWorkflows)
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
    call.replaceWithText(
      `state(${value}, ({ set, update }) => ({ set, update }))`,
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
        '`validateAsync(...)` basé sur `rxResource(...)` doit devenir une `query(...)` locale déclenchée par la valeur du champ, puis `cAsyncValidate(queryRef, ...)`. Dans un craftService, créer la query avec `yield* track(query(...))`.',
      );
    }
  }
  if (sourceFile.getImportDeclaration('@angular/core/rxjs-interop')?.getNamedImports().some((item) => item.getName() === 'rxResource')) {
    diagnose(
      diagnostics,
      'RX_RESOURCE_REQUIRES_QUERY',
      sourceFile,
      '`rxResource(...)` doit être remplacé par `query(...)` ou `mutation(...)` selon l’intention; dans un validateur async, préférer `query(...) + cAsyncValidate(...)`. Dans un craftService, englober toute primitive dépendante avec `yield* track(...)`.',
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
  let declaration = file.getImportDeclaration('@craft-ng/core');
  if (!declaration)
    declaration = file.addImportDeclaration({
      moduleSpecifier: '@craft-ng/core',
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
