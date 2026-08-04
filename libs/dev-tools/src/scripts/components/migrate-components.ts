import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  type CallExpression,
} from 'ts-morph';
import type { ComponentMigrationDiagnostic } from './migration-diagnostic.js';

export type MigrateComponentsOptions = {
  rootDir?: string;
  tsConfigFilePath?: string;
  files?: readonly string[];
  write?: boolean;
  check?: boolean;
  json?: boolean;
  failOnManual?: boolean;
  eslint?: boolean;
  log?: (message: string) => void;
};

export type MigrateComponentsResult = {
  changedFiles: string[];
  diagnostics: ComponentMigrationDiagnostic[];
  remainingLegacyComponents: number;
  remainingLegacyDirectives: number;
  exitCode: number;
};

export async function runComponentsMigration(
  options: MigrateComponentsOptions = {},
): Promise<MigrateComponentsResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const tsConfigFilePath = options.tsConfigFilePath
    ? resolve(options.tsConfigFilePath)
    : join(rootDir, 'tsconfig.json');
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
    return path.startsWith(`${rootDir}/`) && (!selected || selected.has(path));
  });
  const touched = new Set<SourceFile>();
  const diagnostics: ComponentMigrationDiagnostic[] = [];
  const legacyComponentsBeforeMigration = sourceFiles.reduce(
    (count, sourceFile) => count + countLegacyComponentCalls(sourceFile),
    0,
  );

  for (const sourceFile of sourceFiles) {
    const componentImport = sourceFile
      .getImportDeclarations()
      .flatMap((declaration) => declaration.getNamedImports())
      .find((specifier) => specifier.getName() === 'component');
    const componentNameNode = componentImport?.getNameNode();
    const componentAliasNode = componentImport?.getAliasNode();
    if (componentImport && componentAliasNode) {
      if (componentAliasNode.getText() !== 'craftComponent') {
        componentAliasNode.rename('craftComponent');
      }
      componentImport.setName('craftComponent').removeAlias();
      touched.add(sourceFile);
    } else if (componentNameNode && Node.isIdentifier(componentNameNode)) {
      if (componentNameNode.getText() !== 'craftComponent') {
        componentNameNode.rename('craftComponent');
        touched.add(sourceFile);
      }
    }

    const componentCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'craftComponent');
    for (const call of componentCalls.sort(
      (a, b) => b.getStart() - a.getStart(),
    )) {
      const name = declaredNameFor(call);
      if (!name) {
        diagnostics.push({
          code: 'NAME_NOT_DEDUCIBLE',
          filePath: sourceFile.getFilePath(),
          message: 'Could not infer the name for craftComponent(...).',
          manual: true,
        });
        continue;
      }
      if (!isStringLiteral(call.getArguments()[0])) {
        call.insertArgument(0, `'${name}'`);
        touched.add(sourceFile);
      }
    }

    const directiveCalls = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => call.getExpression().getText() === 'craftDirective');
    for (const call of directiveCalls.sort(
      (a, b) => b.getStart() - a.getStart(),
    )) {
      const name = declaredNameFor(call);
      if (!name) {
        diagnostics.push({
          code: 'NAME_NOT_DEDUCIBLE',
          filePath: sourceFile.getFilePath(),
          message: 'Could not infer the name for craftDirective(...).',
          manual: true,
        });
        continue;
      }
      if (!isStringLiteral(call.getArguments()[0])) {
        call.insertArgument(0, `'${name}'`);
        call.insertArgument(1, '{}');
        touched.add(sourceFile);
      }
    }
  }

  if (options.write) await Promise.all([...touched].map((file) => file.save()));

  const remainingLegacyComponentsAfterMigration = sourceFiles.reduce(
    (count, sourceFile) => {
      const hasLegacyImport = sourceFile
        .getImportDeclarations()
        .flatMap((declaration) => declaration.getNamedImports())
        .some((specifier) => specifier.getName() === 'component');
      return hasLegacyImport
        ? count + countCalls(sourceFile, 'component')
        : count;
    },
    0,
  );
  const remainingLegacyComponents = options.write
    ? remainingLegacyComponentsAfterMigration
    : legacyComponentsBeforeMigration;
  const remainingLegacyDirectives = sourceFiles.reduce(
    (count, sourceFile) =>
      count + countCalls(sourceFile, 'craftDirective', true),
    0,
  );
  const result: MigrateComponentsResult = {
    changedFiles: [...touched].map((file) => file.getFilePath()),
    diagnostics,
    remainingLegacyComponents,
    remainingLegacyDirectives,
    exitCode:
      (options.check &&
        (remainingLegacyComponents > 0 || remainingLegacyDirectives > 0)) ||
      (options.failOnManual && diagnostics.length > 0)
        ? 1
        : 0,
  };
  const log = options.log ?? console.log;
  if (options.json) log(JSON.stringify(result, null, 2));
  else
    log(
      `Components migration complete: ${result.changedFiles.length} changed file(s), ${diagnostics.length} manual diagnostic(s).`,
    );
  return result;
}

function declaredNameFor(call: CallExpression): string | undefined {
  let current: Node | undefined = call;
  while (current) {
    if (Node.isVariableDeclaration(current) && current.getNameNode()) {
      return current.getName();
    }
    if (
      Node.isPropertyDeclaration(current) ||
      Node.isPropertyAssignment(current)
    ) {
      return current.getName();
    }
    current = current.getParent();
  }
  return undefined;
}

function isStringLiteral(node: Node | undefined): boolean {
  return Boolean(
    node &&
      (Node.isStringLiteral(node) ||
        (Node.isNoSubstitutionTemplateLiteral(node) && node.getLiteralText())),
  );
}

function countCalls(
  sourceFile: SourceFile,
  name: string,
  migrated = false,
): number {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expression = call.getExpression().getText();
      return migrated
        ? expression === name && !isStringLiteral(call.getArguments()[0])
        : expression === name;
    }).length;
}

function countLegacyComponentCalls(sourceFile: SourceFile): number {
  const localNames = new Set(
    sourceFile
      .getImportDeclarations()
      .flatMap((declaration) => declaration.getNamedImports())
      .filter((specifier) => specifier.getName() === 'component')
      .map((specifier) => specifier.getAliasNode()?.getText() ?? 'component'),
  );
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => localNames.has(call.getExpression().getText())).length;
}
