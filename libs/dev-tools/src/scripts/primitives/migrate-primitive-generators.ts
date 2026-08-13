import { relative, dirname, resolve } from 'node:path';
import {
  ArrowFunction,
  CallExpression,
  Identifier,
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';

/**
 * Migrates call-sites of the generator-returning craft primitives (`state`,
 * `query`, `mutation`, `asyncProcess`, `queryParams`):
 *
 * 1. `yield* track(X)` → `yield* X` (track import purged when unused).
 * 2. Already-consumed invocations (`yield*`, `craftUse(...)`) are left alone.
 * 3. Inside a generator function → prefix with `yield* ` (parenthesised when
 *    the parent is a spread / member access / template position).
 * 4. Direct expression-body return of a `craftService` factory or of a
 *    `queryParams:` arrow stays as-is (the runtime drives the generator).
 * 5. Anywhere else → wrap with `craftUse(...)` (import added).
 * 6. A `craftService` factory / `queryParams:` arrow returning an object
 *    literal containing primitive creations is first converted to a
 *    `function*` so rule 3 applies.
 */

export const ALL_PRIMITIVES = [
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParams',
] as const;

export type PrimitiveName = (typeof ALL_PRIMITIVES)[number];

export type MigratePrimitiveGeneratorsOptions = {
  paths: readonly string[];
  primitives?: readonly PrimitiveName[];
  write?: boolean;
  log?: (message: string) => void;
};

export type MigratePrimitiveGeneratorsResult = {
  changedFiles: string[];
};

const FACTORY_HOST_CALLEES = new Set(['craftService', 'toCraftService']);

export async function migratePrimitiveGenerators({
  paths,
  primitives = ALL_PRIMITIVES,
  write = true,
  log = console.log,
}: MigratePrimitiveGeneratorsOptions): Promise<MigratePrimitiveGeneratorsResult> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  });
  project.addSourceFilesAtPaths(paths as string[]);

  const changedFiles: string[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (migrateFile(sourceFile, new Set(primitives))) {
      changedFiles.push(relative(process.cwd(), sourceFile.getFilePath()));
    }
  }

  if (write) {
    await project.save();
  }

  log(
    `${write ? 'Migrated' : 'Would migrate'} ${changedFiles.length} file(s).`,
  );
  for (const file of changedFiles) log(`  ${file}`);

  return { changedFiles };
}

function migrateFile(
  sourceFile: SourceFile,
  primitives: Set<string>,
): boolean {
  const localNames = collectImportedLocalNames(sourceFile, primitives);
  if (localNames.size === 0) return false;

  let changed = false;

  changed = unwrapTrackCalls(sourceFile) || changed;
  changed = convertObjectLiteralFactories(sourceFile, localNames) || changed;

  // Bottom-up so an edit never invalidates a not-yet-processed call above it.
  const calls = findPrimitiveCreationCalls(sourceFile, localNames).sort(
    (a, b) => b.getStart() - a.getStart(),
  );

  let needsCraftUseImport = false;
  for (const call of calls) {
    if (isAlreadyConsumed(call) || isDirectFactoryReturn(call)) continue;

    if (isInsideGeneratorFunction(call)) {
      const text = call.getText();
      call.replaceWithText(
        needsYieldParens(call) ? `(yield* ${text})` : `yield* ${text}`,
      );
      changed = true;
      continue;
    }

    call.replaceWithText(`craftUse(${call.getText()})`);
    needsCraftUseImport = true;
    changed = true;
  }

  if (needsCraftUseImport) {
    ensureCraftUseImport(sourceFile);
  }

  return changed;
}

/** Applies primitive-generator consumption to an already loaded source file. */
export function migratePrimitiveGeneratorsInFile(
  sourceFile: SourceFile,
  primitives: readonly PrimitiveName[] = ALL_PRIMITIVES,
): boolean {
  return migrateFile(sourceFile, new Set(primitives));
}

function collectImportedLocalNames(
  sourceFile: SourceFile,
  primitives: Set<string>,
): Map<string, string> {
  const localNames = new Map<string, string>();
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    for (const specifier of importDeclaration.getNamedImports()) {
      const original = specifier.getName();
      if (primitives.has(original)) {
        localNames.set(specifier.getAliasNode()?.getText() ?? original, original);
      }
    }
  }
  return localNames;
}

function findPrimitiveCreationCalls(
  sourceFile: SourceFile,
  localNames: Map<string, string>,
): CallExpression[] {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee)) return false;
      if (!localNames.has(callee.getText())) return false;
      // A creation call always takes a config; destructured readers such as
      // `({ state }) => state().page` are argument-less.
      if (call.getArguments().length === 0) return false;
      return !isShadowed(callee);
    });
}

function isShadowed(identifier: Identifier): boolean {
  const name = identifier.getText();
  let node: Node | undefined = identifier.getParent();
  while (node) {
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isFunctionExpression(node) ||
      Node.isArrowFunction(node) ||
      Node.isMethodDeclaration(node)
    ) {
      for (const parameter of node.getParameters()) {
        const bindsName = parameter
          .getDescendants()
          .concat(parameter.getNameNode())
          .some(
            (descendant) =>
              (Node.isIdentifier(descendant) &&
                descendant.getText() === name &&
                (Node.isBindingElement(descendant.getParent()) ||
                  Node.isParameterDeclaration(descendant.getParent())) &&
                (descendant.getParent() as any).getNameNode?.() === descendant),
          );
        if (bindsName) return true;
      }
    }
    node = node.getParent();
  }
  return false;
}

function isAlreadyConsumed(call: CallExpression): boolean {
  const parent = skipParens(call.getParent());
  if (Node.isYieldExpression(parent)) return true;
  if (
    Node.isCallExpression(parent) &&
    parent.getExpression().getText() === 'craftUse' &&
    parent.getArguments()[0] === skipParensDown(call)
  ) {
    return true;
  }
  return false;
}

function isDirectFactoryReturn(call: CallExpression): boolean {
  const arrow = skipParens(call.getParent());
  if (!Node.isArrowFunction(arrow)) return false;
  if (skipParensDown(arrow.getBody()) !== call) return false;
  return isFactoryHostArrow(arrow);
}

function isFactoryHostArrow(arrow: ArrowFunction): boolean {
  const parent = arrow.getParent();
  if (Node.isCallExpression(parent)) {
    const callee = parent.getExpression();
    if (Node.isIdentifier(callee) && FACTORY_HOST_CALLEES.has(callee.getText())) {
      return parent.getArguments().includes(arrow);
    }
  }
  if (Node.isPropertyAssignment(parent)) {
    return parent.getName() === 'queryParams';
  }
  return false;
}

function isInsideGeneratorFunction(call: CallExpression): boolean {
  let node: Node | undefined = call.getParent();
  while (node) {
    if (Node.isArrowFunction(node)) return false;
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isFunctionExpression(node) ||
      Node.isMethodDeclaration(node)
    ) {
      return node.isGenerator();
    }
    node = node.getParent();
  }
  return false;
}

function needsYieldParens(call: CallExpression): boolean {
  const parent = call.getParent();
  return (
    Node.isSpreadElement(parent) ||
    Node.isSpreadAssignment(parent) ||
    Node.isPropertyAccessExpression(parent) ||
    Node.isElementAccessExpression(parent) ||
    Node.isTemplateSpan(parent) ||
    Node.isBinaryExpression(parent) ||
    Node.isConditionalExpression(parent) ||
    (Node.isCallExpression(parent) && parent.getExpression() === call)
  );
}

function unwrapTrackCalls(sourceFile: SourceFile): boolean {
  const trackImport = sourceFile
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports())
    .find((specifier) => specifier.getName() === 'track');
  if (!trackImport) return false;

  const localName = trackImport.getAliasNode()?.getText() ?? 'track';
  const trackCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const callee = call.getExpression();
      return (
        Node.isIdentifier(callee) &&
        callee.getText() === localName &&
        call.getArguments().length === 1
      );
    })
    .sort((a, b) => b.getStart() - a.getStart());

  if (trackCalls.length === 0) return false;

  for (const call of trackCalls) {
    call.replaceWithText(call.getArguments()[0].getText());
  }

  const remaining = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (identifier) =>
        identifier.getText() === localName &&
        !Node.isImportSpecifier(identifier.getParent()),
    );
  if (remaining.length === 0) {
    trackImport.remove();
  }

  return true;
}

function convertObjectLiteralFactories(
  sourceFile: SourceFile,
  localNames: Map<string, string>,
): boolean {
  const arrows = sourceFile
    .getDescendantsOfKind(SyntaxKind.ArrowFunction)
    .filter((arrow) => {
      if (!isFactoryHostArrow(arrow)) return false;
      const body = skipParensDown(arrow.getBody());
      if (!Node.isObjectLiteralExpression(body)) return false;
      return findPrimitiveCreationCalls(sourceFile, localNames).some((call) =>
        body.getDescendants().includes(call),
      );
    })
    .sort((a, b) => b.getStart() - a.getStart());

  for (const arrow of arrows) {
    const body = skipParensDown(arrow.getBody());
    const parameters = arrow
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(', ');
    arrow.replaceWithText(
      `function* (${parameters}) {\n  return ${body.getText()};\n}`,
    );
  }

  return arrows.length > 0;
}

function ensureCraftUseImport(sourceFile: SourceFile): void {
  const alreadyImported = sourceFile
    .getImportDeclarations()
    .some((declaration) =>
      declaration
        .getNamedImports()
        .some((specifier) => specifier.getName() === 'craftUse'),
    );
  if (alreadyImported) return;

  const filePath = sourceFile.getFilePath();
  const coreSrc = resolve('libs/core/src');
  const isInsideCore = resolve(filePath).startsWith(coreSrc + '/');

  if (isInsideCore) {
    let specifier = relative(
      dirname(filePath),
      resolve('libs/core/src/lib/craft-use'),
    );
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    sourceFile.addImportDeclaration({
      moduleSpecifier: specifier,
      namedImports: ['craftUse'],
    });
    return;
  }

  const coreImport = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === '@craft-ng/core');
  if (coreImport) {
    coreImport.addNamedImport('craftUse');
    return;
  }

  sourceFile.addImportDeclaration({
    moduleSpecifier: '@craft-ng/core',
    namedImports: ['craftUse'],
  });
}

function skipParens(node: Node | undefined): Node | undefined {
  while (node && Node.isParenthesizedExpression(node)) {
    node = node.getParent();
  }
  return node;
}

function skipParensDown(node: Node): Node {
  while (Node.isParenthesizedExpression(node)) {
    node = node.getExpression();
  }
  return node;
}

const isCli = process.argv[1]?.includes('migrate-primitive-generators');
if (isCli) {
  const args = process.argv.slice(2);
  const readListArg = (name: string): string[] | undefined => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return undefined;
    return args[index + 1]?.split(',').filter(Boolean);
  };

  const paths = readListArg('paths');
  if (!paths || paths.length === 0) {
    console.error(
      'Usage: migrate-primitive-generators --paths <glob,...> [--primitives state,query,...] [--dry]',
    );
    process.exit(1);
  }

  void migratePrimitiveGenerators({
    paths,
    primitives: readListArg('primitives') as PrimitiveName[] | undefined,
    write: !args.includes('--dry'),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
