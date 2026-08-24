import {
  ArrowFunction,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  MethodDeclaration,
  Node,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
import { dirname, relative, resolve } from 'node:path';

const CRAFT_USE = 'craftUse';
const GENERATOR_HOSTS = new Set([
  'asyncProcess',
  'craftComponent',
  'craftComputed',
  'craftService',
  'query',
  'queryParams',
  'mutation',
  'state',
]);

export type YieldableReactiveReadMigrationResult = {
  changed: boolean;
  changedReads: number;
};

/**
 * Converts the old synchronous reader escape hatch into the public yieldable
 * reader contract.
 *
 * A reader used in a generator-capable callback becomes a local binding:
 *
 * ```ts
 * const item = craftUse(state()).find(...)
 * // becomes
 * const _state = yield* state();
 * const item = _state.find(...)
 * ```
 *
 * Ordinary callbacks keep `craftUse(...)`, but never through an alias such as
 * `__craftRead`. This makes the migration output match the public API and
 * keeps non-generator boundaries explicit.
 */
export function migrateYieldableReactiveReads(
  sourceFile: SourceFile,
): YieldableReactiveReadMigrationResult {
  const craftUseAliases = findCraftUseAliases(sourceFile);

  let changed = false;
  let changedReads = 0;

  // Promote compatible callbacks before processing their readers. This is
  // intentionally iterative because a reader can be nested in an insertion
  // method inside a primitive factory.
  for (let pass = 0; pass < 4; pass += 1) {
    const wrappers = findCraftUseWrappers(sourceFile, craftUseAliases);
    let promoted = false;
    for (const wrapper of wrappers) {
      if (wrapper.wasForgotten()) continue;
      const argument = unwrap(wrapper.getArguments()[0]);
      if (!argument || !isReactiveReaderInvocation(argument, true)) continue;
      const functionLike = nearestFunction(wrapper);
      if (
        functionLike &&
        !isGenerator(functionLike) &&
        canPromoteToGenerator(functionLike)
      ) {
        promoteToGenerator(functionLike);
        promoted = true;
        changed = true;
      }
    }
    if (!promoted) break;
  }

  for (const wrapper of findCraftUseWrappers(
    sourceFile,
    craftUseAliases,
  ).sort((left, right) => right.getStart() - left.getStart())) {
    if (wrapper.wasForgotten()) continue;
    const argument = unwrap(wrapper.getArguments()[0]);
    if (!argument || !isReactiveReaderInvocation(argument, true)) continue;

    const functionLike = nearestFunction(wrapper);
    if (functionLike && isGenerator(functionLike)) {
      const name = createReaderBindingName(functionLike, argument);
      insertReaderBinding(wrapper, name, argument.getText());
      wrapper.replaceWithText(name);
      changed = true;
      changedReads += 1;
    } else {
      wrapper.getExpression().replaceWithText(CRAFT_USE);
      changed = true;
      changedReads += 1;
    }
  }

  // Handle readers that were not hidden behind craftUse. This is useful for
  // partially migrated files and makes the codemod idempotent across passes.
  for (const call of sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .sort((left, right) => right.getStart() - left.getStart())) {
    if (call.wasForgotten() || !isReactiveReaderInvocation(call, false)) continue;
    if (isConsumedReader(call)) continue;

    const functionLike = nearestFunction(call);
    if (!functionLike || !isGenerator(functionLike)) continue;

    const name = createReaderBindingName(functionLike, call);
    insertReaderBinding(call, name, call.getText());
    call.replaceWithText(name);
    changed = true;
    changedReads += 1;
  }

  changed = normalizeCraftUseImports(sourceFile, craftUseAliases) || changed;
  return { changed, changedReads };
}

function findCraftUseAliases(sourceFile: SourceFile): Set<string> {
  const aliases = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration
      .getNamedImports()
      .find((item) => item.getName() === CRAFT_USE);
    if (specifier) aliases.add(specifier.getAliasNode()?.getText() ?? CRAFT_USE);
  }
  return aliases;
}

function findCraftUseWrappers(
  sourceFile: SourceFile,
  aliases: Set<string>,
): CallExpression[] {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expression = call.getExpression();
      return (
        Node.isIdentifier(expression) &&
        aliases.has(expression.getText()) &&
        !isShadowed(expression) &&
        call.getArguments().length === 1
      );
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
        const binding = parameter.getNameNode();
        if (binding.getText() === name) return true;
        if (
          Node.isObjectBindingPattern(binding) &&
          binding.getElements().some((element) => element.getName() === name)
        )
          return true;
      }
    }
    node = node.getParent();
  }
  return false;
}

function isReactiveReaderInvocation(
  node: Node,
  allowSyntacticReader: boolean,
): node is CallExpression {
  if (!Node.isCallExpression(node) || node.getArguments().length !== 0) {
    return false;
  }
  const expression = node.getExpression();
  if (
    allowSyntacticReader &&
    (Node.isIdentifier(expression) || Node.isPropertyAccessExpression(expression))
  ) {
    return true;
  }
  if (allowSyntacticReader && Node.isElementAccessExpression(expression)) return true;
  return hasReactiveReaderBrand(expression.getType(), new Set());
}

function hasReactiveReaderBrand(type: any, seen: Set<any>): boolean {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  if (type.isUnion?.())
    return type.getUnionTypes().some((part: any) => hasReactiveReaderBrand(part, seen));
  if (type.isIntersection?.())
    return type
      .getIntersectionTypes()
      .some((part: any) => hasReactiveReaderBrand(part, seen));
  return type
    .getProperties?.()
    .some((property: any) => property.getName().includes('RAW_REACTIVE_VALUE'));
}

function isConsumedReader(call: CallExpression): boolean {
  let node: Node = call;
  let parent = node.getParent();
  while (
    parent &&
    (Node.isParenthesizedExpression(parent) ||
      Node.isAsExpression(parent) ||
      Node.isTypeAssertion(parent) ||
      Node.isNonNullExpression(parent))
  ) {
    node = parent;
    parent = node.getParent();
  }
  if (Node.isYieldExpression(parent) && parent.getAsteriskToken()) return true;
  return (
    Node.isCallExpression(parent) &&
    Node.isIdentifier(parent.getExpression()) &&
    parent.getExpression().getText() === CRAFT_USE
  );
}

function nearestFunction(node: Node):
  | ArrowFunction
  | FunctionDeclaration
  | FunctionExpression
  | MethodDeclaration
  | undefined {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isArrowFunction(ancestor) ||
      Node.isFunctionDeclaration(ancestor) ||
      Node.isFunctionExpression(ancestor) ||
      Node.isMethodDeclaration(ancestor),
  ) as
    | ArrowFunction
    | FunctionDeclaration
    | FunctionExpression
    | MethodDeclaration
    | undefined;
}

function isGenerator(
  node:
    | ArrowFunction
    | FunctionDeclaration
    | FunctionExpression
    | MethodDeclaration,
): boolean {
  return !Node.isArrowFunction(node) && node.isGenerator();
}

function canPromoteToGenerator(
  functionLike:
    | ArrowFunction
    | FunctionDeclaration
    | FunctionExpression
    | MethodDeclaration,
): boolean {
  if (Node.isFunctionDeclaration(functionLike)) return false;
  let node: Node = functionLike;
  let parent = node.getParent();
  while (parent) {
    if (Node.isCallExpression(parent)) {
      const callee = parent.getExpression().getText();
      return GENERATOR_HOSTS.has(callee) && parent.getArguments().some((arg) => arg === node);
    }
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isPropertyAssignment(parent) ||
      Node.isObjectLiteralExpression(parent) ||
      Node.isArrayLiteralExpression(parent) ||
      Node.isArrowFunction(parent)
    ) {
      node = parent;
      parent = node.getParent();
      continue;
    }
    return false;
  }
  return false;
}

function promoteToGenerator(
  functionLike:
    | ArrowFunction
    | FunctionDeclaration
    | FunctionExpression
    | MethodDeclaration,
): void {
  if (Node.isArrowFunction(functionLike)) {
    const parameters = functionLike
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(', ');
    const body = functionLike.getBody();
    if (!body) return;
    const replacement = Node.isBlock(body)
      ? `function* (${parameters}) ${body.getText()}`
      : `function* (${parameters}) { return ${body.getText()}; }`;
    functionLike.replaceWithText(replacement);
    return;
  }
  if (Node.isMethodDeclaration(functionLike)) {
    functionLike.replaceWithText(`*${functionLike.getText()}`);
    return;
  }
  functionLike.replaceWithText(
    functionLike.getText().replace(/^function\b/, 'function*'),
  );
}

function createReaderBindingName(
  functionLike:
    | ArrowFunction
    | FunctionDeclaration
    | FunctionExpression
    | MethodDeclaration,
  reader: CallExpression,
): string {
  const expression = reader.getExpression();
  let base = Node.isIdentifier(expression)
    ? expression.getText()
    : Node.isPropertyAccessExpression(expression)
      ? `${expression.getExpression().getText()}${expression.getName()}`
      : 'value';
  base = base.replace(/[^A-Za-z0-9_$]/g, '');
  if (!base) base = 'value';
  if (/^\d/.test(base)) base = `value${base}`;
  const preferred = `_${base}`;
  const used = new Set(
    functionLike
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );
  if (!used.has(preferred)) return preferred;
  for (let index = 2; ; index += 1) {
    const candidate = `${preferred}${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function insertReaderBinding(
  reader: CallExpression,
  name: string,
  expression: string,
): void {
  const statement = reader.getFirstAncestor((ancestor) =>
    Node.isStatement(ancestor),
  );
  if (!statement) return;
  const parent = statement.getParent();
  if (Node.isBlock(parent)) {
    const index = parent.getStatements().indexOf(statement);
    parent.insertStatements(index, `const ${name} = yield* ${expression};`);
    return;
  }
  statement.replaceWithText(
    `const ${name} = yield* ${expression};\n${statement.getText()}`,
  );
}

function normalizeCraftUseImports(
  sourceFile: SourceFile,
  aliases: Set<string>,
): boolean {
  let changed = false;
  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration
      .getNamedImports()
      .find((item) => aliases.has(item.getAliasNode()?.getText() ?? item.getName()));
    if (!specifier) continue;
    const localNames = new Set(aliases);
    const references = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          localNames.has(identifier.getText()) &&
          identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== declaration,
      );
    const canonicalReferences = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          identifier.getText() === CRAFT_USE &&
          !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
      );
    if (references.length > 0) {
      for (const reference of references) {
        if (reference.getText() !== CRAFT_USE) {
          reference.replaceWithText(CRAFT_USE);
          changed = true;
        }
      }
      if (specifier.getAliasNode()) {
        specifier.removeAlias();
        changed = true;
      }
    } else if (canonicalReferences.length > 0) {
      const hasOtherCanonicalImport = sourceFile
        .getImportDeclarations()
        .some(
          (candidate) =>
            candidate !== declaration &&
            candidate
              .getNamedImports()
              .some((item) => item.getName() === CRAFT_USE),
        );
      if (hasOtherCanonicalImport) {
        specifier.remove();
        changed = true;
      } else if (specifier.getAliasNode()) {
        specifier.removeAlias();
        changed = true;
      }
    } else {
      specifier.remove();
      changed = true;
      if (
        declaration.getNamedImports().length === 0 &&
        !declaration.getDefaultImport() &&
        !declaration.getNamespaceImport()
      ) {
        declaration.remove();
      }
    }
  }
  if (
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some(
        (identifier) =>
          identifier.getText() === CRAFT_USE &&
          !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
      ) &&
    !sourceFile.getImportDeclarations().some((declaration) =>
      declaration
        .getNamedImports()
        .some((item) => item.getName() === CRAFT_USE),
    )
  ) {
    ensureCraftUseImport(sourceFile);
    changed = true;
  }
  return changed;
}

function ensureCraftUseImport(sourceFile: SourceFile): void {
  const filePath = resolve(sourceFile.getFilePath());
  const workspace = resolve(process.cwd());
  const insideCore = filePath.startsWith(`${workspace}/libs/core/src/lib/`);
  const moduleSpecifier = insideCore
    ? localCraftUseSpecifier(filePath, workspace)
    : '@craft-ts/core';
  const existing = sourceFile
    .getImportDeclarations()
    .find((declaration) => declaration.getModuleSpecifierValue() === moduleSpecifier);
  if (existing) {
    existing.addNamedImport(CRAFT_USE);
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier,
    namedImports: [CRAFT_USE],
  });
}

function localCraftUseSpecifier(filePath: string, workspace: string): string {
  let specifier = relative(
    dirname(filePath),
    resolve(workspace, 'libs/core/src/lib/craft-use'),
  ).replace(/\\/g, '/');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

function unwrap(node: Node | undefined): Node | undefined {
  while (
    node &&
    (Node.isParenthesizedExpression(node) ||
      Node.isAsExpression(node) ||
      Node.isTypeAssertion(node) ||
      Node.isNonNullExpression(node))
  ) {
    node = Node.isParenthesizedExpression(node)
      ? node.getExpression()
      : Node.isAsExpression(node) || Node.isTypeAssertion(node)
        ? node.getExpression()
        : node.getExpression();
  }
  return node;
}
