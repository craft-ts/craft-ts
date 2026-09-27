import { dirname, relative, resolve } from 'node:path';
import {
  CallExpression,
  FunctionExpression,
  Node,
  ObjectLiteralExpression,
  Project,
  QuoteKind,
  ReturnStatement,
  SourceFile,
  Statement,
  SyntaxKind,
  VariableDeclaration,
  YieldExpression,
} from 'ts-morph';
import { migratePrimitiveGeneratorsInFile } from '../primitives/migrate-primitive-generators.js';

/**
 * Migrates code to the `craftService` without `return`:
 *
 * 1. `craftComputed` / `craftMethod` / `craftEffect` become primitive
 *    generators — calls are consumed with `yield*` (inside a generator) or
 *    `craftUse(...)` (anywhere else), and an unnamed `craftComputed(fn)` takes
 *    its name from the binding it is assigned to.
 * 2. In every `craftService` factory, the `return { ... }` is removed: a
 *    shorthand `{ x }` of a binding `const x = yield* <primitive named 'x'>` is
 *    exposed as is, a `k: craftGen(function* ...)` / plain function becomes
 *    `yield* craftMethod('k', function* ...)`, a renamed key renames the
 *    primitive at its source, and every named primitive that was NOT returned
 *    is wrapped in `craftPrivate(...)`.
 * 3. Anything else (a flattened `{ addItem: dataList.addItem }`, a spread, a
 *    returned injected service, a single primitive returned alone) is kept in
 *    the `return` and reported as `SERVICE_EXPOSE_MANUAL`, so its consumers
 *    can be rewritten by hand.
 */

export type ServiceExposeDiagnosticCode = 'SERVICE_EXPOSE_MANUAL';

export type ServiceExposeDiagnostic = {
  code: ServiceExposeDiagnosticCode;
  filePath: string;
  line: number;
  service?: string;
  message: string;
  manual: true;
};

export type MigrateServiceAutoExposeOptions = {
  paths: readonly string[];
  write?: boolean;
  log?: (message: string) => void;
};

export type MigrateServiceAutoExposeResult = {
  changedFiles: string[];
  diagnostics: ServiceExposeDiagnostic[];
};

/** Primitives that became generators in this migration. */
export const YIELDABLE_HELPERS = [
  'craftComputed',
  'craftMethod',
  'craftEffect',
] as const;

/**
 * Creators of a NAMED primitive (the ones a `craftService` exposes), with the
 * index of their name argument.
 */
export const NAMED_PRIMITIVE_NAME_ARG: Readonly<Record<string, number>> = {
  state: 0,
  query: 0,
  mutation: 0,
  asyncProcess: 0,
  queryParams: 0,
  craftComputed: 0,
  craftMethod: 0,
  craftEffect: 0,
  craftStateMachine: 0,
  source$: 0,
  fromEventToSource$: 1,
  queryEffect: 0,
  mutationEffect: 0,
  asyncProcessEffect: 0,
};

/** Primitives whose name argument is optional and may be inserted. */
const NAMEABLE_WHEN_UNNAMED = new Set(['state', 'craftComputed', 'craftStateMachine']);

const SERVICE_CALLEES = new Set(['craftService']);

export async function migrateServiceAutoExpose({
  paths,
  write = true,
  log = console.log,
}: MigrateServiceAutoExposeOptions): Promise<MigrateServiceAutoExposeResult> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  });
  project.addSourceFilesAtPaths(paths as string[]);

  const changedFiles: string[] = [];
  const diagnostics: ServiceExposeDiagnostic[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (migrateServiceAutoExposeInFile(sourceFile, diagnostics)) {
      changedFiles.push(relative(process.cwd(), sourceFile.getFilePath()));
    }
  }

  if (write) await project.save();

  log(`${write ? 'Migrated' : 'Would migrate'} ${changedFiles.length} file(s).`);
  for (const file of changedFiles) log(`  ${file}`);
  if (diagnostics.length > 0) {
    log(`\n${diagnostics.length} service exposure(s) need a manual rewrite:`);
    for (const d of diagnostics) {
      log(`  ${d.filePath}:${d.line} ${d.code} — ${d.message}`);
    }
  }
  return { changedFiles, diagnostics };
}

/** Applies the whole migration to an already loaded source file. */
export function migrateServiceAutoExposeInFile(
  sourceFile: SourceFile,
  diagnostics: ServiceExposeDiagnostic[] = [],
): boolean {
  let changed = nameUnnamedHelpers(sourceFile);
  changed =
    migratePrimitiveGeneratorsInFile(sourceFile, YIELDABLE_HELPERS) || changed;

  changed = convertPlainFactories(sourceFile) || changed;

  // Bottom-up, and re-resolved each time: rewriting a `return` as raw text
  // forgets every node wrapper around it, but never shifts the ones above.
  const factoryCount = findServiceFactories(sourceFile).length;
  let needsCraftPrivate = false;
  let needsCraftMethod = false;
  for (let index = factoryCount - 1; index >= 0; index -= 1) {
    const { factory, serviceName } = findServiceFactories(sourceFile)[index]!;
    const outcome = migrateFactory(sourceFile, factory, serviceName, diagnostics);
    changed = outcome.changed || changed;
    needsCraftPrivate = outcome.usedCraftPrivate || needsCraftPrivate;
    needsCraftMethod = outcome.usedCraftMethod || needsCraftMethod;
  }
  if (needsCraftPrivate) ensureCoreImport(sourceFile, 'craftPrivate');
  if (needsCraftMethod) ensureCoreImport(sourceFile, 'craftMethod');
  if (factoryCount > 0) removeUnusedImport(sourceFile, 'craftGen');
  return changed;
}

// ---------------------------------------------------------------------------
// Step 1 — name the unnamed `craftComputed(fn)` from its binding.
// ---------------------------------------------------------------------------

function nameUnnamedHelpers(sourceFile: SourceFile): boolean {
  const local = importedLocalNames(sourceFile, new Set(['craftComputed']));
  if (local.size === 0) return false;
  let changed = false;
  const calls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const callee = call.getExpression();
      return (
        Node.isIdentifier(callee) &&
        local.has(callee.getText()) &&
        call.getArguments().length > 0 &&
        !Node.isStringLiteral(call.getArguments()[0]) &&
        !Node.isNoSubstitutionTemplateLiteral(call.getArguments()[0])
      );
    })
    .sort((a, b) => b.getStart() - a.getStart());
  for (const call of calls) {
    const name = bindingNameOf(call) ?? 'computed';
    call.insertArgument(0, `'${name}'`);
    changed = true;
  }
  return changed;
}

/** The variable / field / property a (possibly consumed) call is bound to. */
function bindingNameOf(call: Node): string | undefined {
  let node: Node | undefined = call.getParent();
  while (
    node &&
    (Node.isParenthesizedExpression(node) ||
      Node.isYieldExpression(node) ||
      Node.isAsExpression(node) ||
      Node.isSatisfiesExpression(node) ||
      (Node.isCallExpression(node) &&
        ['craftUse', 'craftPrivate'].includes(node.getExpression().getText())))
  ) {
    node = node.getParent();
  }
  if (!node) return undefined;
  if (
    (Node.isVariableDeclaration(node) ||
      Node.isPropertyDeclaration(node) ||
      Node.isPropertyAssignment(node)) &&
    Node.isIdentifier(node.getNameNode())
  ) {
    return node.getName();
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Step 2 — the service factories.
// ---------------------------------------------------------------------------

/**
 * `craftService(options, (inputs) => expr)` → `function* (inputs) { return expr; }`:
 * a craftService factory must be a generator; its `return` is handled next.
 */
function convertPlainFactories(sourceFile: SourceFile): boolean {
  const factories = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const callee = call.getExpression();
      if (!Node.isIdentifier(callee) || !SERVICE_CALLEES.has(callee.getText())) {
        return false;
      }
      const factory = call.getArguments()[1];
      return (
        !!factory &&
        ((Node.isArrowFunction(factory) && !factory.isAsync()) ||
          (Node.isFunctionExpression(factory) &&
            !factory.isGenerator() &&
            !factory.isAsync()))
      );
    })
    .map((call) => call.getArguments()[1]!)
    .sort((a, b) => b.getStart() - a.getStart());
  for (const factory of factories) {
    if (!Node.isArrowFunction(factory) && !Node.isFunctionExpression(factory)) continue;
    const parameters = factory.getParameters().map((p) => p.getText()).join(', ');
    const body = factory.getBody();
    const block = Node.isBlock(body)
      ? body.getText()
      : `{\n${lineIndent(factory)}  return ${body.getText()};\n${lineIndent(factory)}}`;
    factory.replaceWithText(`function* (${parameters}) ${block}`);
  }
  return factories.length > 0;
}

type ServiceFactory = { factory: FunctionExpression; serviceName?: string };

function findServiceFactories(sourceFile: SourceFile): ServiceFactory[] {
  const result: ServiceFactory[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isIdentifier(callee) || !SERVICE_CALLEES.has(callee.getText())) {
      continue;
    }
    const [options, factory] = call.getArguments();
    if (!factory || !Node.isFunctionExpression(factory) || !factory.isGenerator()) {
      continue;
    }
    result.push({ factory, serviceName: readServiceName(options) });
  }
  return result.sort((a, b) => a.factory.getStart() - b.factory.getStart());
}

function readServiceName(options: Node | undefined): string | undefined {
  if (!options || !Node.isObjectLiteralExpression(options)) return undefined;
  const name = options.getProperty('name');
  if (!name || !Node.isPropertyAssignment(name)) return undefined;
  const initializer = name.getInitializer();
  return initializer && Node.isStringLiteral(initializer)
    ? initializer.getLiteralValue()
    : undefined;
}

type FactoryOutcome = {
  changed: boolean;
  usedCraftPrivate: boolean;
  usedCraftMethod: boolean;
};

/** A named primitive yielded at the top level of the factory body. */
type YieldedPrimitive = {
  statement: Statement;
  yieldExpression: YieldExpression;
  call: CallExpression;
  primitive: string;
  binding?: VariableDeclaration;
};

/** What happens to a named yield once the returned object is read. */
type Exposure = { yielded: YieldedPrimitive; key: string; renameBinding: boolean };

function migrateFactory(
  sourceFile: SourceFile,
  factory: FunctionExpression,
  serviceName: string | undefined,
  diagnostics: ServiceExposeDiagnostic[],
): FactoryOutcome {
  const outcome: FactoryOutcome = {
    changed: false,
    usedCraftPrivate: false,
    usedCraftMethod: false,
  };
  const body = factory.getBody();
  if (!body || !Node.isBlock(body)) return outcome;

  const report = (node: Node, message: string) =>
    diagnostics.push({
      code: 'SERVICE_EXPOSE_MANUAL',
      filePath: relative(process.cwd(), sourceFile.getFilePath()),
      line: node.getStartLineNumber(),
      service: serviceName,
      message,
      manual: true,
    });

  const returns = ownReturns(factory);
  if (returns.length > 1) {
    report(returns[0], 'several return statements: expose each primitive by hand.');
    return outcome;
  }
  const returnStatement = returns[0];
  const returned = returnStatement?.getExpression();
  const yields = topLevelNamedYields(body.getStatements());

  // --- plan ---------------------------------------------------------------
  const exposures: Exposure[] = [];
  const hoisted: Hoisted[] = [];
  const kept: Node[] = [];
  if (returnStatement && returned) {
    const object = unwrapExpression(returned);
    if (!Node.isObjectLiteralExpression(object)) {
      report(
        returnStatement,
        `returns ${describe(object)} instead of an object literal: expose its members as named primitives and update the consumers.`,
      );
      return outcome;
    }
    planReturnedObject(object, yields, exposures, hoisted, kept, report);
    outcome.usedCraftMethod = hoisted.some(({ text }) => text().includes('craftMethod('));
  }

  // --- apply ------------------------------------------------------------
  // 1. Renamed bindings first: `rename` rewrites every reference, including
  //    those inside the hoisted methods, so their text is read afterwards.
  for (const exposure of exposures) {
    if (exposure.renameBinding) {
      exposure.yielded
        .binding!.getNameNode()
        .asKindOrThrow(SyntaxKind.Identifier)
        .rename(exposure.key);
    }
  }
  const replacement = returnStatement
    ? (() => {
        const indent = lineIndent(returnStatement);
        const lines = hoisted.map((entry) => reindent(entry, indent));
        if (kept.length > 0) {
          lines.push(`return { ${kept.map((node) => node.getText()).join(', ')} };`);
        }
        return lines.join(`\n${indent}`);
      })()
    : undefined;
  const keptNames = new Set(
    kept.flatMap((node) =>
      node.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText()),
    ),
  );

  // 2. The yields: exposed ones get their key as name, the others go private.
  for (const yielded of [...yields].reverse()) {
    const exposure = exposures.find((e) => e.yielded === yielded);
    if (exposure) {
      renameCall(yielded.call, yielded.primitive, exposure.key);
      outcome.changed = true;
      continue;
    }
    // A binding a manual `return` still reads stays as it is.
    if (
      yielded.binding &&
      Node.isIdentifier(yielded.binding.getNameNode()) &&
      keptNames.has(yielded.binding.getName())
    ) {
      continue;
    }
    const argument = yielded.yieldExpression.getExpression();
    if (!argument) continue;
    argument.replaceWithText(`craftPrivate(${argument.getText()})`);
    outcome.usedCraftPrivate = true;
    outcome.changed = true;
  }

  // 3. The return itself, last: replacing raw text forgets the nodes around.
  if (returnStatement && replacement !== undefined) {
    if (replacement === '') returnStatement.remove();
    else {
      sourceFile.replaceText(
        [returnStatement.getStart(), returnStatement.getEnd()],
        replacement,
      );
    }
    outcome.changed = true;
  }
  return outcome;
}

/**
 * Hoisted text keeps the indentation of the property it came from; shift its
 * continuation lines so they sit under the statement instead.
 */
type Hoisted = { text: () => string; from: Node };

function reindent({ text, from }: Hoisted, indent: string): string {
  const [first, ...rest] = text().split('\n');
  const fromIndent = lineIndent(from).length;
  const shift = Math.max(0, fromIndent - indent.length);
  const strip = new RegExp(`^ {0,${shift}}`);
  return [first, ...rest.map((line) => line.replace(strip, ''))].join('\n');
}

/** The whitespace that starts the line `node` begins on. */
function lineIndent(node: Node): string {
  const text = node.getSourceFile().getFullText();
  const lineStart = text.lastIndexOf('\n', node.getStart() - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))![0];
}

function planReturnedObject(
  object: ObjectLiteralExpression,
  yields: YieldedPrimitive[],
  exposures: Exposure[],
  hoisted: Hoisted[],
  kept: Node[],
  report: (node: Node, message: string) => void,
): void {
  const byBinding = new Map(
    yields
      .filter((y) => y.binding && Node.isIdentifier(y.binding.getNameNode()))
      .map((y) => [y.binding!.getName(), y]),
  );
  const claimed = new Set<YieldedPrimitive>();
  const expose = (yielded: YieldedPrimitive, key: string, renameBinding: boolean) => {
    if (claimed.has(yielded) || !canName(yielded.call, yielded.primitive)) return false;
    claimed.add(yielded);
    exposures.push({ yielded, key, renameBinding });
    return true;
  };

  for (const property of object.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      const key = property.getName();
      const yielded = byBinding.get(key);
      if (yielded && expose(yielded, key, false)) continue;
      report(
        property,
        yielded
          ? `"${key}" cannot be named at its source (${yielded.primitive}).`
          : `"${key}" is not bound to a named primitive yielded by the factory.`,
      );
      kept.push(property);
      continue;
    }

    if (Node.isPropertyAssignment(property) && isPlainKey(property.getNameNode())) {
      const key = property.getName().replace(/^['"]|['"]$/g, '');
      const value = unwrapExpression(property.getInitializerOrThrow());

      // `k: y` — a primitive bound under another name: rename it at the source.
      if (Node.isIdentifier(value)) {
        const yielded = byBinding.get(value.getText());
        if (
          yielded &&
          canRenameBinding(yielded.binding!, key) &&
          expose(yielded, key, true)
        ) {
          continue;
        }
      }

      // `k: yield* <named primitive>` — hoisted as a statement named `k`.
      if (Node.isYieldExpression(value) && value.getText().startsWith('yield*')) {
        const call = unwrapExpression(value.getExpressionOrThrow());
        const primitive = Node.isCallExpression(call) ? primitiveOf(call) : undefined;
        if (Node.isCallExpression(call) && primitive && canName(call, primitive)) {
          hoisted.push({ text: () => `yield* ${renamedCallText(call, primitive, key)};`, from: property });
          continue;
        }
      }

      // `k: craftGen(function* ...)` — a method.
      if (Node.isCallExpression(value) && value.getExpression().getText() === 'craftGen') {
        const fn = value.getArguments()[0];
        const generator = fn ? toGeneratorFunctionText(fn) : undefined;
        if (generator && value.getArguments().length === 1) {
          const fnNode = Node.isCallExpression(value) ? value.getArguments()[0]! : value;
          hoisted.push({
            text: () => `yield* craftMethod('${key}', ${toGeneratorFunctionText(fnNode)});`,
            from: property,
          });
          continue;
        }
      }

      // `k: (args) => ...` / `k: function (...) {}` — a plain method.
      if (Node.isArrowFunction(value) || Node.isFunctionExpression(value)) {
        const generator = toGeneratorFunctionText(value);
        if (generator) {
          const fnNode = Node.isCallExpression(value) ? value.getArguments()[0]! : value;
          hoisted.push({
            text: () => `yield* craftMethod('${key}', ${toGeneratorFunctionText(fnNode)});`,
            from: property,
          });
          continue;
        }
      }

      report(
        property,
        `"${key}: ${truncate(value.getText())}" cannot be exposed automatically: expose a named primitive and rewrite the consumers.`,
      );
      kept.push(property);
      continue;
    }

    if (Node.isMethodDeclaration(property) && isPlainKey(property.getNameNode())) {
      const generator = methodToGeneratorText(property);
      if (generator) {
        hoisted.push({
          text: () => `yield* craftMethod('${property.getName()}', ${methodToGeneratorText(property)});`,
          from: property,
        });
        continue;
      }
    }

    report(property, `"${truncate(property.getText())}" cannot be exposed automatically.`);
    kept.push(property);
  }
}

function topLevelNamedYields(statements: Statement[]): YieldedPrimitive[] {
  const result: YieldedPrimitive[] = [];
  for (const statement of statements) {
    const candidates: { expression: Node | undefined; binding?: VariableDeclaration }[] = [];
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        candidates.push({ expression: declaration.getInitializer(), binding: declaration });
      }
    } else if (Node.isExpressionStatement(statement)) {
      candidates.push({ expression: statement.getExpression() });
    }
    for (const { expression, binding } of candidates) {
      if (!expression) continue;
      const yieldExpression = unwrapExpression(expression);
      if (!Node.isYieldExpression(yieldExpression)) continue;
      if (!yieldExpression.getText().startsWith('yield*')) continue;
      const call = unwrapExpression(yieldExpression.getExpressionOrThrow());
      if (!Node.isCallExpression(call)) continue;
      const primitive = primitiveOf(call);
      if (!primitive) continue;
      result.push({ statement, yieldExpression, call, primitive, binding });
    }
  }
  return result;
}

function primitiveOf(call: CallExpression): string | undefined {
  const callee = call.getExpression();
  const name = Node.isIdentifier(callee)
    ? callee.getText()
    : Node.isPropertyAccessExpression(callee)
      ? callee.getName()
      : undefined;
  return name && name in NAMED_PRIMITIVE_NAME_ARG ? name : undefined;
}

function nameArgumentOf(call: CallExpression, primitive: string): Node | undefined {
  const index = NAMED_PRIMITIVE_NAME_ARG[primitive];
  const argument = call.getArguments()[index];
  if (!argument) return undefined;
  if (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) {
    return argument;
  }
  // `craftMethod({ name: 'x', providers })`
  if (Node.isObjectLiteralExpression(argument)) {
    const name = argument.getProperty('name');
    if (name && Node.isPropertyAssignment(name)) {
      const initializer = name.getInitializer();
      if (initializer && Node.isStringLiteral(initializer)) return initializer;
    }
  }
  return undefined;
}

function isUnnamed(call: CallExpression, primitive: string): boolean {
  if (!NAMEABLE_WHEN_UNNAMED.has(primitive)) return false;
  const first = call.getArguments()[0];
  if (!first) return false;
  if (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first)) {
    return false;
  }
  // `state(config)` has a single argument; `state('x', config, ...)` two or more.
  return primitive !== 'state' || call.getArguments().length === 1;
}

function canName(call: CallExpression, primitive: string): boolean {
  return nameArgumentOf(call, primitive) !== undefined || isUnnamed(call, primitive);
}

/** Sets the primitive's name literal to `name` (inserting it when absent). */
function renameCall(call: CallExpression, primitive: string, name: string): void {
  const literal = nameArgumentOf(call, primitive);
  if (literal) {
    if (!Node.isStringLiteral(literal) || literal.getLiteralValue() !== name) {
      literal.replaceWithText(`'${name}'`);
    }
    return;
  }
  if (isUnnamed(call, primitive)) call.insertArgument(0, `'${name}'`);
}

function renamedCallText(call: CallExpression, primitive: string, name: string): string {
  const literal = nameArgumentOf(call, primitive);
  const text = call.getText();
  if (literal) {
    const start = literal.getStart() - call.getStart();
    return `${text.slice(0, start)}'${name}'${text.slice(start + literal.getWidth())}`;
  }
  const first = call.getArguments()[0]!;
  const start = first.getStart() - call.getStart();
  return `${text.slice(0, start)}'${name}', ${text.slice(start)}`;
}

function canRenameBinding(binding: VariableDeclaration, name: string): boolean {
  if (!Node.isIdentifier(binding.getNameNode())) return false;
  const scope = binding.getFirstAncestor(
    (node) => Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node),
  );
  if (!scope) return false;
  return !scope.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => {
    if (identifier.getText() !== name) return false;
    // A property key or member name is not a binding that could clash.
    const parent = identifier.getParent();
    return !(
      (Node.isPropertyAssignment(parent) && parent.getNameNode() === identifier) ||
      (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier) ||
      (Node.isMethodDeclaration(parent) && parent.getNameNode() === identifier)
    );
  });
}

/** Return statements of `fn` itself — not those of nested functions. */
function ownReturns(fn: FunctionExpression): ReturnStatement[] {
  return fn
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((statement) => enclosingFunction(statement) === fn);
}

function enclosingFunction(node: Node): Node | undefined {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionExpression(ancestor) ||
      Node.isArrowFunction(ancestor) ||
      Node.isFunctionDeclaration(ancestor) ||
      Node.isMethodDeclaration(ancestor) ||
      Node.isGetAccessorDeclaration(ancestor) ||
      Node.isSetAccessorDeclaration(ancestor) ||
      Node.isConstructorDeclaration(ancestor),
  );
}

/**
 * `(a) => expr` / `function (a) { ... }` / `function* (a) { ... }` as the text
 * of a generator function. `undefined` for what cannot become one faithfully:
 * an async function, or one relying on `this` / `arguments`.
 */
function toGeneratorFunctionText(fn: Node): string | undefined {
  if (!Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn)) return undefined;
  if (fn.isAsync()) return undefined;
  const bodyNode = fn.getBody();
  if (Node.isFunctionExpression(fn) && usesOwnThisOrArguments(fn)) return undefined;
  const typeParameters = fn.getTypeParameters().map((t) => t.getText());
  const typeParams = typeParameters.length ? `<${typeParameters.join(', ')}>` : '';
  const parameters = fn.getParameters().map((p) => p.getText()).join(', ');
  const returnType = fn.getReturnTypeNode();
  if (Node.isFunctionExpression(fn) && fn.isGenerator()) {
    return `function* ${typeParams}(${parameters})${returnType ? `: ${returnType.getText()}` : ''} ${bodyNode!.getText()}`;
  }
  if (returnType) return undefined; // a declared plain return type would lie
  const block = Node.isBlock(bodyNode)
    ? bodyNode.getText()
    : `{ return ${bodyNode!.getText()}; }`;
  return `function* ${typeParams}(${parameters}) ${block}`;
}

function methodToGeneratorText(method: Node): string | undefined {
  if (!Node.isMethodDeclaration(method)) return undefined;
  if (method.isAsync()) return undefined;
  if (usesOwnThisOrArguments(method)) return undefined;
  const typeParameters = method.getTypeParameters().map((t) => t.getText());
  const typeParams = typeParameters.length ? `<${typeParameters.join(', ')}>` : '';
  const parameters = method.getParameters().map((p) => p.getText()).join(', ');
  const returnType = method.getReturnTypeNode();
  if (!method.isGenerator() && returnType) return undefined;
  return `function* ${typeParams}(${parameters})${method.isGenerator() && returnType ? `: ${returnType.getText()}` : ''} ${method.getBodyOrThrow().getText()}`;
}

function usesOwnThisOrArguments(fn: Node): boolean {
  return fn.getDescendants().some((node) => {
    if (!Node.isThisExpression(node) && !(Node.isIdentifier(node) && node.getText() === 'arguments')) {
      return false;
    }
    let owner = node.getParent();
    while (owner && Node.isArrowFunction(owner) === false && owner !== fn) {
      if (Node.isFunctionExpression(owner) || Node.isFunctionDeclaration(owner) || Node.isMethodDeclaration(owner)) {
        return owner === fn;
      }
      owner = owner.getParent();
    }
    return owner === fn;
  });
}

function unwrapExpression(node: Node): Node {
  let current = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function isPlainKey(name: Node): boolean {
  return (
    Node.isIdentifier(name) ||
    (Node.isStringLiteral(name) && /^[A-Za-z_$][\w$]*$/.test(name.getLiteralValue()))
  );
}

function describe(node: Node): string {
  if (Node.isIdentifier(node)) return `"${node.getText()}"`;
  if (Node.isCallExpression(node)) return `a call (${truncate(node.getText())})`;
  return `"${truncate(node.getText())}"`;
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

function importedLocalNames(sourceFile: SourceFile, names: Set<string>): Set<string> {
  const local = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      if (names.has(specifier.getName())) {
        local.add(specifier.getAliasNode()?.getText() ?? specifier.getName());
      }
    }
  }
  return local;
}

function removeUnusedImport(sourceFile: SourceFile, symbol: string): void {
  const used = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some((id) => id.getText() === symbol && !Node.isImportSpecifier(id.getParent()));
  if (used) return;
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.getName() !== symbol) continue;
      specifier.remove();
      if (
        declaration.getNamedImports().length === 0 &&
        !declaration.getDefaultImport() &&
        !declaration.getNamespaceImport()
      ) {
        declaration.remove();
      }
    }
  }
}

const CORE_SYMBOL_MODULE: Record<string, string> = {
  craftPrivate: 'libs/core/src/lib/craft-primitive-gen',
  craftMethod: 'libs/core/src/lib/craft-method',
};

function ensureCoreImport(sourceFile: SourceFile, symbol: string): void {
  const imported = sourceFile
    .getImportDeclarations()
    .some((declaration) =>
      declaration.getNamedImports().some((specifier) => specifier.getName() === symbol),
    );
  if (imported) return;

  const filePath = sourceFile.getFilePath();
  const coreSrc = resolve('libs/core/src');
  if (resolve(filePath).startsWith(coreSrc + '/')) {
    let specifier = relative(dirname(filePath), resolve(CORE_SYMBOL_MODULE[symbol]));
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    const existing = sourceFile
      .getImportDeclarations()
      .find((d) => d.getModuleSpecifierValue() === specifier && !d.isTypeOnly());
    if (existing) existing.addNamedImport(symbol);
    else sourceFile.addImportDeclaration({ moduleSpecifier: specifier, namedImports: [symbol] });
    return;
  }

  const coreImport = sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === '@craft-ts/core' && !declaration.isTypeOnly(),
    );
  if (coreImport) {
    coreImport.addNamedImport(symbol);
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier: '@craft-ts/core',
    namedImports: [symbol],
  });
}

const isCli = process.argv[1]?.includes('migrate-service-auto-expose');
if (isCli) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--paths');
  const paths = index === -1 ? undefined : args[index + 1]?.split(',').filter(Boolean);
  if (!paths || paths.length === 0) {
    console.error('Usage: migrate-service-auto-expose --paths <glob,...> [--dry]');
    process.exit(1);
  }
  void migrateServiceAutoExpose({ paths, write: !args.includes('--dry') }).catch(
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
