import { relative } from 'node:path';
import {
  CallExpression,
  Identifier,
  Node,
  Project,
  QuoteKind,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';

/**
 * Migrates call-sites to the *named* craft primitives.
 *
 * The five primitives now take their name as first argument and resolve to the
 * primitive reference itself. `craftComputed` / `craftMethod` already take a
 * name and also return their reference directly:
 *
 * ```ts
 * const users = yield* query({ loader });      // before
 * const users = yield* query('users', { loader });  // after
 *
 * const handleFoo = craftMethod('handleFoo', fn);       // unchanged
 * ```
 *
 * The name is taken from the binding the call is assigned to:
 *
 * 1. `const X = <call>` → `const X = <call>` (the name literal is `'X'`).
 * 2. `const X = craftUse(<call>)` → same, looking through `craftUse` / `yield*`.
 * 3. Class fields and object properties keep the direct primitive reference.
 * 4. For `craftComputed` / `craftMethod` the name literal already exists and
 *    wins; the binding is left unchanged.
 *
 * Anything the codemod cannot name — an inline call with no binding, an
 * existing destructuring pattern — is left untouched and reported so it can be
 * fixed by hand.
 */

export const NAMED_PRIMITIVES = [
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParams',
] as const;

/** Helpers that already take a name literal; only their return shape changed. */
export const PRE_NAMED_HELPERS = ['craftComputed', 'craftMethod'] as const;

export type NamedPrimitiveName =
  | (typeof NAMED_PRIMITIVES)[number]
  | (typeof PRE_NAMED_HELPERS)[number];

export type MigrateNamedPrimitivesOptions = {
  paths: readonly string[];
  write?: boolean;
  log?: (message: string) => void;
};

export type UnmigratedCall = {
  file: string;
  line: number;
  primitive: string;
  reason: string;
  text: string;
};

export type MigrateNamedPrimitivesResult = {
  changedFiles: string[];
  unmigrated: UnmigratedCall[];
};

export async function migrateNamedPrimitives({
  paths,
  write = true,
  log = console.log,
}: MigrateNamedPrimitivesOptions): Promise<MigrateNamedPrimitivesResult> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  });
  project.addSourceFilesAtPaths(paths as string[]);

  const changedFiles: string[] = [];
  const unmigrated: UnmigratedCall[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (migrateFile(sourceFile, unmigrated)) {
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

  if (unmigrated.length > 0) {
    log(`\n${unmigrated.length} call(s) need a manual name:`);
    for (const entry of unmigrated) {
      log(`  ${entry.file}:${entry.line} ${entry.primitive} — ${entry.reason}`);
    }
  }

  return { changedFiles, unmigrated };
}

function migrateFile(
  sourceFile: SourceFile,
  unmigrated: UnmigratedCall[],
): boolean {
  const primitives = collectImportedLocalNames(sourceFile);
  if (primitives.size === 0) return false;

  let changed = false;

  // Bottom-up so an edit never invalidates a not-yet-processed call above it.
  const calls = findCreationCalls(sourceFile, primitives).sort(
    (a, b) => b.getStart() - a.getStart(),
  );

  for (const call of calls) {
    const primitive = primitives.get(
      (call.getExpression() as Identifier).getText(),
    ) as NamedPrimitiveName;
    const preNamed = (PRE_NAMED_HELPERS as readonly string[]).includes(
      primitive,
    );

    const declaredName = preNamed ? readNameLiteral(call, true) : undefined;
    if (preNamed && !declaredName) {
      report(unmigrated, call, primitive, 'name argument is not a literal');
      continue;
    }
    if (preNamed && removeLegacyNamedProperty(call, preNamed)) {
      changed = true;
      continue;
    }
    if ((preNamed && declaredName) || (!preNamed && hasPrimitiveName(call))) {
      if (rewriteLegacySingleBinding(call)) {
        changed = true;
        continue;
      }
      if (removeLegacyNamedProperty(call, preNamed)) {
        changed = true;
        continue;
      }
      report(unmigrated, call, primitive, 'already takes a name argument');
      continue;
    }

    const target = findBindingTarget(call, preNamed);
    if (!target) {
      report(
        unmigrated,
        call,
        primitive,
        'no binding to derive a name from — name it by hand',
      );
      continue;
    }

    const name = declaredName ?? target.name;

    if (!preNamed) {
      call.insertArgument(0, `'${name}'`);
    }

    if (target.kind === 'variable') {
      target.rewriteToDestructuring(name);
    } else {
      target.appendPropertyRead(name);
    }
    changed = true;
  }

  return changed;
}

/** Applies the named-primitive rewrite to an already loaded source file. */
export function migrateNamedPrimitivesInFile(
  sourceFile: SourceFile,
  unmigrated: UnmigratedCall[] = [],
): boolean {
  return migrateFile(sourceFile, unmigrated);
}

function removeLegacyNamedProperty(
  call: CallExpression,
  preNamed: boolean,
): boolean {
  let node: Node = call;
  let parent = node.getParent();

  while (parent) {
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === node &&
      isLegacyNamedProperty(parent, call, preNamed)
    ) {
      parent.replaceWithText(node.getText());
      return true;
    }
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isYieldExpression(parent) ||
      (Node.isCallExpression(parent) &&
        parent.getExpression().getText() === 'craftUse' &&
        parent.getArguments()[0] === node)
    ) {
      node = parent;
      parent = parent.getParent();
      continue;
    }
    break;
  }

  return false;
}

function rewriteLegacySingleBinding(call: CallExpression): boolean {
  let node: Node = call;
  let parent = node.getParent();

  while (parent) {
    if (
      Node.isVariableDeclaration(parent) &&
      parent.getInitializer() === node
    ) {
      const nameNode = parent.getNameNode();
      if (!Node.isObjectBindingPattern(nameNode)) return false;
      const elements = nameNode.getElements();
      if (elements.length !== 1) return false;
      const binding = elements[0];
      if (!Node.isBindingElement(binding)) return false;
      const bindingName = binding.getNameNode();
      if (!Node.isIdentifier(bindingName)) return false;
      nameNode.replaceWithText(bindingName.getText());
      return true;
    }
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isYieldExpression(parent) ||
      (Node.isCallExpression(parent) &&
        parent.getExpression().getText() === 'craftUse' &&
        parent.getArguments()[0] === node)
    ) {
      node = parent;
      parent = parent.getParent();
      continue;
    }
    break;
  }

  return false;
}

type BindingTarget =
  | {
      kind: 'variable';
      name: string;
      rewriteToDestructuring: (recordKey: string) => void;
    }
  | {
      kind: 'property';
      name: string;
      appendPropertyRead: (recordKey: string) => void;
    };

const HOST_FACTORIES = new Set([
  'craftService',
  'craftComponent',
  'toCraftService',
  'craftGen',
]);

/**
 * Walks up from the creation call through the consumption wrappers (`yield*`,
 * `craftUse(...)`, parentheses) to the binding that will hold the result.
 */
function findBindingTarget(
  call: CallExpression,
  preNamed: boolean,
): BindingTarget | undefined {
  let node: Node = call;
  let parent = node.getParent();

  while (parent) {
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === node &&
      isLegacyNamedProperty(parent, call, preNamed)
    ) {
      const propertyName = parent.getName();
      parent.replaceWithText(node.getText());
      return {
        kind: 'property',
        name: propertyName,
        appendPropertyRead: () => undefined,
      };
    }
    if (
      Node.isParenthesizedExpression(parent) ||
      Node.isYieldExpression(parent)
    ) {
      node = parent;
      parent = parent.getParent();
      continue;
    }
    if (
      Node.isCallExpression(parent) &&
      parent.getExpression().getText() === 'craftUse' &&
      parent.getArguments()[0] === node
    ) {
      node = parent;
      parent = parent.getParent();
      continue;
    }
    break;
  }

  if (!parent) return undefined;

  if (Node.isVariableDeclaration(parent) && parent.getInitializer() === node) {
    const nameNode = parent.getNameNode();
    let name: string;
    if (Node.isIdentifier(nameNode)) {
      name = nameNode.getText();
    } else if (Node.isObjectBindingPattern(nameNode)) {
      const elements = nameNode.getElements();
      if (elements.length !== 1) return undefined;
      const binding = elements[0];
      if (!Node.isBindingElement(binding)) return undefined;
      const bindingName = binding.getNameNode();
      if (!Node.isIdentifier(bindingName)) return undefined;
      name = bindingName.getText();
      nameNode.replaceWithText(name);
    } else {
      return undefined;
    }
    return {
      kind: 'variable',
      name,
      rewriteToDestructuring: () => undefined,
    };
  }

  if (
    (Node.isPropertyDeclaration(parent) || Node.isPropertyAssignment(parent)) &&
    parent.getInitializer() === node &&
    isDriven(node, preNamed)
  ) {
    const nameNode = parent.getNameNode();
    if (!Node.isIdentifier(nameNode)) return undefined;
    return {
      kind: 'property',
      name: nameNode.getText(),
      appendPropertyRead: () => undefined,
    };
  }

  // `return yield* state(...)` as the whole body of a craftService factory has
  // no local binding. Use the enclosing service name for the primitive name and
  // keep returning the direct primitive reference.
  if (
    isDriven(node, preNamed) &&
    (Node.isReturnStatement(parent) ||
      (Node.isArrowFunction(parent) && parent.getBody() === node))
  ) {
    const hostName =
      findEnclosingHostName(parent) ?? findEnclosingBindingName(parent);
    if (!hostName) return undefined;
    return {
      kind: 'property',
      name: hostName,
      appendPropertyRead: () => undefined,
    };
  }

  // `craftService(meta, () => state(0, ...))` can now hand the primitive
  // generator directly to the runtime. Only add the name argument; keep the
  // arrow unchanged. The same applies to a route's
  // `queryParams: () => queryParams(config)` field.
  if (
    Node.isArrowFunction(parent) &&
    parent.getBody() === node &&
    !isDriven(node, preNamed)
  ) {
    const hostName =
      findEnclosingHostName(parent) ?? readOwningPropertyName(parent);
    if (!hostName) return undefined;
    const arrow = parent;
    return {
      kind: 'property',
      name: hostName,
      appendPropertyRead: () => undefined,
    };
  }

  return undefined;
}

function isLegacyNamedProperty(
  property: import('ts-morph').PropertyAccessExpression,
  call: CallExpression,
  preNamed: boolean,
): boolean {
  const name = readNameLiteral(call, preNamed);
  return name !== undefined && property.getName() === name;
}

/**
 * `true` once the primitive generator has actually been driven — by `yield*` or
 * `craftUse(...)`.
 */
function isDriven(node: Node, preNamed = false): boolean {
  if (preNamed) return true;
  if (Node.isYieldExpression(node)) return true;
  return (
    Node.isCallExpression(node) && node.getExpression().getText() === 'craftUse'
  );
}

/**
 * Name of the nearest enclosing `craftService` / `craftComponent`, lower-cased
 * on the first character (`'Counter'` → `'counter'`), used to name a primitive
 * that is returned directly rather than bound to a variable.
 */
function findEnclosingHostName(from: Node): string | undefined {
  const HOSTS = HOST_FACTORIES;
  let node: Node | undefined = from;
  while (node) {
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      if (Node.isIdentifier(callee) && HOSTS.has(callee.getText())) {
        for (const argument of node.getArguments()) {
          if (Node.isStringLiteral(argument)) {
            return uncapitalize(argument.getLiteralValue());
          }
          if (Node.isObjectLiteralExpression(argument)) {
            const nameProperty = argument.getProperty('name');
            if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
              const value = nameProperty.getInitializer();
              if (value && Node.isStringLiteral(value)) {
                return uncapitalize(value.getLiteralValue());
              }
            }
          }
        }
        return undefined;
      }
    }
    node = node.getParent();
  }
  return undefined;
}

/**
 * Name of the property the given node is the initializer of, if any.
 *
 * Used for a route's `queryParams: () => queryParams(config)` field: there is
 * no craft host around it to take a name from, so the field itself names the
 * primitive (`queryParams('queryParams', config)`).
 */
function readOwningPropertyName(node: Node): string | undefined {
  const parent = node.getParent();
  if (
    !parent ||
    !(Node.isPropertyAssignment(parent) || Node.isPropertyDeclaration(parent))
  ) {
    return undefined;
  }
  if (parent.getInitializer() !== node) return undefined;
  const nameNode = parent.getNameNode();
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
}

/**
 * Nearest enclosing `const X = ...` name, used when a primitive is returned
 * from a plain factory (`const listQueryParams = () => craftUse(...)`) rather
 * than bound directly or wrapped in a craft host.
 */
function findEnclosingBindingName(from: Node): string | undefined {
  let node: Node | undefined = from;
  while (node) {
    if (Node.isVariableDeclaration(node)) {
      const nameNode = node.getNameNode();
      if (Node.isIdentifier(nameNode)) return nameNode.getText();
      return undefined;
    }
    if (Node.isPropertyDeclaration(node) || Node.isPropertyAssignment(node)) {
      const nameNode = node.getNameNode();
      if (Node.isIdentifier(nameNode)) return nameNode.getText();
      return undefined;
    }
    node = node.getParent();
  }
  return undefined;
}

function uncapitalize(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Whether one of the five primitives has *already* been migrated.
 *
 * Their first argument used to be the config, and a config can legitimately be
 * a string (`state('2026-05-10 12:00', insertForm(...))`), so the literal alone
 * proves nothing. A migrated call has an identifier-shaped name followed by the
 * config it used to take alone.
 */
function hasPrimitiveName(call: CallExpression): boolean {
  const first = call.getArguments()[0];
  if (!first || !Node.isStringLiteral(first)) return false;
  if (!/^[A-Za-z_$][\w$]*$/.test(first.getLiteralValue())) return false;
  return call.getArguments().length > 1;
}

/**
 * The name a call already carries, if any.
 *
 * `acceptObjectForm` is only true for `craftComputed` / `craftMethod`, whose
 * name may be given as `{ name: 'foo', providers: [...] }`. For the five
 * primitives the first argument is the *config*, and `state({ name: 'romain',
 * password: 'x' })` would otherwise look deceptively like a named call.
 */
function readNameLiteral(
  call: CallExpression,
  acceptObjectForm: boolean,
): string | undefined {
  const first = call.getArguments()[0];
  if (!first) return undefined;
  if (Node.isStringLiteral(first)) return first.getLiteralValue();
  if (acceptObjectForm && Node.isObjectLiteralExpression(first)) {
    const nameProperty = first.getProperty('name');
    if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
      const value = nameProperty.getInitializer();
      if (value && Node.isStringLiteral(value)) return value.getLiteralValue();
    }
  }
  return undefined;
}

function report(
  unmigrated: UnmigratedCall[],
  call: CallExpression,
  primitive: string,
  reason: string,
): void {
  unmigrated.push({
    file: relative(process.cwd(), call.getSourceFile().getFilePath()),
    line: call.getStartLineNumber(),
    primitive,
    reason,
    text: call.getText().slice(0, 120),
  });
}

function collectImportedLocalNames(
  sourceFile: SourceFile,
): Map<string, string> {
  const targets = new Set<string>([...NAMED_PRIMITIVES, ...PRE_NAMED_HELPERS]);
  const localNames = new Map<string, string>();
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    for (const specifier of importDeclaration.getNamedImports()) {
      const original = specifier.getName();
      if (targets.has(original)) {
        localNames.set(
          specifier.getAliasNode()?.getText() ?? original,
          original,
        );
      }
    }
  }
  return localNames;
}

function findCreationCalls(
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
              Node.isIdentifier(descendant) &&
              descendant.getText() === name &&
              (Node.isBindingElement(descendant.getParent()) ||
                Node.isParameterDeclaration(descendant.getParent())),
          );
        if (bindsName) return true;
      }
    }
    node = node.getParent();
  }
  return false;
}
