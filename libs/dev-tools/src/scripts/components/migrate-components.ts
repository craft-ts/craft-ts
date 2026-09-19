import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
  type ArrowFunction,
  type CallExpression,
  type FunctionExpression,
  type Statement,
} from 'ts-morph';

type FunctionLikeArgument = ArrowFunction | FunctionExpression;
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
      const folded = foldLogicIntoTemplate(call);
      if (folded === 'manual') {
        diagnostics.push({
          code: 'TEMPLATE_MERGE_MANUAL',
          filePath: sourceFile.getFilePath(),
          message: `The logic factory of '${name}' cannot be folded into its template automatically.`,
          manual: true,
        });
      } else if (folded === 'merged') {
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
  // A `craftComponent` call that still carries a logic factory is legacy too.
  const unfoldedComponents = sourceFiles.reduce(
    (count, sourceFile) => count + countUnfoldedComponentCalls(sourceFile),
    0,
  );
  const remainingLegacyComponents =
    (options.write
      ? remainingLegacyComponentsAfterMigration
      : legacyComponentsBeforeMigration) + unfoldedComponents;
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

/**
 * The logic factory is gone: one generator declares the component's service and
 * returns its template. `(props) => logic` + `(context) => template` becomes
 * `function* (props) { …logic; return template; }`.
 */
function foldLogicIntoTemplate(
  call: CallExpression,
): 'merged' | 'unchanged' | 'manual' {
  const args = call.getArguments();
  if (args.length < 4) return 'unchanged';
  const logic = asFunction(args[2]);
  const template = asFunction(args[3]);
  if (!logic || !template) return 'manual';

  const exposed = exposedNames(logic);
  const consumed = consumedNames(template);
  if (!exposed || !consumed) return 'manual';
  if (consumed.some((name) => !exposed.names.includes(name))) return 'manual';

  const templateText = args[3].getText();
  // Nothing to keep from the logic: the template is already the whole component.
  if (exposed.names.length === 0 && exposed.statements.length === 0) {
    call.removeArgument(3);
    call.getArguments()[2]?.replaceWithText(templateText);
    return 'merged';
  }

  const indent = call.getIndentationText();
  const body = [
    ...exposed.statements.map((statement) => statement.getText()),
    templateReturnText(template),
  ]
    .join('\n')
    .split('\n')
    .map((line) => (line.trim() ? `${indent}  ${line.trim()}` : line))
    .join('\n');
  const parameters = logic
    .getParameters()
    .map((parameter) => parameter.getText())
    .join(', ');
  const merged = `function* (${parameters}) {\n${body}\n${indent}}`;

  call.removeArgument(3);
  call.getArguments()[2]?.replaceWithText(merged);
  return 'merged';
}

function asFunction(node: Node | undefined): FunctionLikeArgument | undefined {
  if (!node) return undefined;
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node)
    ? node
    : undefined;
}

/** The members the logic exposed, and the statements that build them. */
function exposedNames(
  logic: FunctionLikeArgument,
): { names: string[]; statements: Statement[] } | undefined {
  const body = logic.getBody();
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const last = statements[statements.length - 1];
    if (!last || !Node.isReturnStatement(last)) return undefined;
    const names = shorthandNames(last.getExpression());
    return names ? { names, statements: statements.slice(0, -1) } : undefined;
  }
  const names = shorthandNames(body);
  return names ? { names, statements: [] } : undefined;
}

function shorthandNames(expression: Node | undefined): string[] | undefined {
  const object = expression?.asKind(SyntaxKind.ParenthesizedExpression)
    ? expression
        .asKindOrThrow(SyntaxKind.ParenthesizedExpression)
        .getExpression()
    : expression;
  if (!object || !Node.isObjectLiteralExpression(object)) return undefined;
  const names: string[] = [];
  for (const property of object.getProperties()) {
    if (!Node.isShorthandPropertyAssignment(property)) return undefined;
    names.push(property.getName());
  }
  return names;
}

/** The names the template took from the logic context, or `undefined` when it renames them. */
function consumedNames(template: FunctionLikeArgument): string[] | undefined {
  const parameter = template.getParameters()[0];
  if (!parameter) return [];
  const nameNode = parameter.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) return undefined;
  const names: string[] = [];
  for (const element of nameNode.getElements()) {
    if (element.getPropertyNameNode() || element.getInitializer()) {
      return undefined;
    }
    if (element.getDotDotDotToken()) return undefined;
    names.push(element.getName());
  }
  return names;
}

function templateReturnText(template: FunctionLikeArgument): string {
  const body = template.getBody();
  if (Node.isBlock(body)) {
    return body
      .getStatements()
      .map((statement) => statement.getText())
      .join('\n');
  }
  return `return ${body.getText()};`;
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

function countUnfoldedComponentCalls(sourceFile: SourceFile): number {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(
      (call) =>
        call.getExpression().getText() === 'craftComponent' &&
        call.getArguments().length >= 4,
    ).length;
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
