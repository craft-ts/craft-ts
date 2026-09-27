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

/**
 * Migrates code to the `craftService` without `return`:
 *
 * 1. `craftComputed` / `craftMethod` / `craftEffect` become primitive
 *    generators — calls are consumed with `yield*` (inside a generator) or
 *    `craftUse(...)` (anywhere else), and an unnamed `craftComputed(fn)` takes
 *    its name from the binding it is assigned to.
 * 2. A plain `craftService` factory (`(inputs) => expr`) becomes a generator.
 * 3. In every `craftService` factory, the `return { ... }` is removed: a
 *    shorthand `{ x }` of a binding `const x = yield* <primitive named 'x'>` is
 *    exposed as is, `k: craftGen(function* ...)` or a plain function becomes
 *    `yield* craftMethod('k', function* ...)`, a key naming another binding
 *    renames that primitive at its source, and every named primitive that was
 *    NOT returned is wrapped in `craftPrivate(...)`.
 * 4. Anything else (a flattened `{ addItem: dataList.addItem }`, a spread, an
 *    injected service, a primitive returned alone) stays in the `return` and
 *    is reported as `SERVICE_EXPOSE_MANUAL`, so its consumers can be rewritten
 *    by hand.
 *
 * Every step edits the raw text (never re-printing a node), so the code it
 * does not change keeps its formatting.
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
const NAMEABLE_WHEN_UNNAMED = new Set([
  'state',
  'craftComputed',
  'craftStateMachine',
]);

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

  log(
    `${write ? 'Migrated' : 'Would migrate'} ${changedFiles.length} file(s).`,
  );
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
  const original = sourceFile.getFullText();
  const imports = new Set<string>();

  runPhase(sourceFile, convertPlainFactories);
  runPhase(sourceFile, (file) => consumeYieldableHelpers(file, imports));
  runPhase(sourceFile, (file) => migrateFactories(file, diagnostics, imports));
  if (sourceFile.getFullText() !== original) {
    runPhase(sourceFile, (file) => addImports(file, imports));
    removeUnusedImport(sourceFile, 'craftGen');
  }
  return sourceFile.getFullText() !== original;
}

// ---------------------------------------------------------------------------
// Text edits
// ---------------------------------------------------------------------------

type Edit = { start: number; end: number; text: string };

/** Collects edits on the current text, then applies them in one pass. */
function runPhase(
  sourceFile: SourceFile,
  collect: (sourceFile: SourceFile) => Edit[],
): void {
  const edits = collect(sourceFile);
  if (edits.length === 0) return;
  sourceFile.replaceWithText(applyEdits(sourceFile.getFullText(), edits));
}

/**
 * Applies non-overlapping edits. Insertions at the same offset keep the order
 * they were collected in.
 */
function applyEdits(text: string, edits: readonly Edit[]): string {
  const ordered = edits
    .map((edit, sequence) => ({ ...edit, sequence }))
    .sort(
      (a, b) => b.start - a.start || b.end - a.end || b.sequence - a.sequence,
    );
  let result = text;
  for (const edit of ordered) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** The text of `node` with the edits that fall inside it applied. */
function textWithEdits(node: Node, edits: readonly Edit[]): string {
  const start = node.getStart();
  const end = node.getEnd();
  const inner = edits
    .filter((edit) => edit.start >= start && edit.end <= end)
    .map((edit) => ({
      ...edit,
      start: edit.start - start,
      end: edit.end - start,
    }));
  return applyEdits(node.getText(), inner);
}

/** The whitespace that starts the line `node` begins on. */
function lineIndent(node: Node): string {
  const text = node.getSourceFile().getFullText();
  const lineStart = text.lastIndexOf('\n', node.getStart() - 1) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))![0];
}

// ---------------------------------------------------------------------------
// Phase 1 — plain factories become generators.
// ---------------------------------------------------------------------------

function convertPlainFactories(sourceFile: SourceFile): Edit[] {
  const edits: Edit[] = [];
  for (const call of serviceCalls(sourceFile)) {
    const factory = call.getArguments()[1];
    if (
      !factory ||
      !(Node.isArrowFunction(factory) || Node.isFunctionExpression(factory)) ||
      factory.isAsync() ||
      (Node.isFunctionExpression(factory) && factory.isGenerator())
    ) {
      continue;
    }
    if (isInsideServiceFactory(call)) continue;
    const parameters = factory
      .getParameters()
      .map((parameter) => parameter.getText())
      .join(', ');
    const body = factory.getBody();
    const indent = lineIndent(factory);
    const block = Node.isBlock(body)
      ? body.getText()
      : `{\n${indent}  return ${body.getText()};\n${indent}}`;
    edits.push({
      start: factory.getStart(),
      end: factory.getEnd(),
      text: `function* (${parameters}) ${block}`,
    });
  }
  return edits;
}

// ---------------------------------------------------------------------------
// Phase 2 — craftComputed / craftMethod / craftEffect are consumed.
// ---------------------------------------------------------------------------

/**
 * Where the yieldable helpers come from. `host/craft-signal` exports a
 * low-level `craftComputed` of its own, which is left alone.
 */
const YIELDABLE_HELPER_MODULE =
  /^@craft-ts\/core$|\/craft-(computed|method|effect)(\.js)?$|\/craft-runtime(\.js)?$/;

function consumeYieldableHelpers(
  sourceFile: SourceFile,
  imports: Set<string>,
): Edit[] {
  const local = importedLocalNames(
    sourceFile,
    new Set(YIELDABLE_HELPERS),
    YIELDABLE_HELPER_MODULE,
  );
  if (local.size === 0) return [];
  const edits: Edit[] = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const callee = call.getExpression();
    if (!Node.isIdentifier(callee)) continue;
    const helper = local.get(callee.getText());
    if (!helper || call.getArguments().length === 0) continue;

    const first = call.getArguments()[0]!;
    if (helper === 'craftComputed' && !isNameLiteral(first)) {
      edits.push({
        start: first.getStart(),
        end: first.getStart(),
        text: `'${bindingNameOf(call) ?? 'computed'}', `,
      });
    }

    if (isAlreadyConsumed(call)) continue;
    if (isInsideGeneratorFunction(call)) {
      const parens = needsYieldParens(call);
      edits.push({
        start: call.getStart(),
        end: call.getStart(),
        text: parens ? '(yield* ' : 'yield* ',
      });
      if (parens) {
        edits.push({ start: call.getEnd(), end: call.getEnd(), text: ')' });
      }
    } else {
      edits.push({
        start: call.getStart(),
        end: call.getStart(),
        text: 'craftUse(',
      });
      edits.push({ start: call.getEnd(), end: call.getEnd(), text: ')' });
      imports.add('craftUse');
    }
  }
  return edits;
}

function isAlreadyConsumed(call: CallExpression): boolean {
  let parent = call.getParent();
  while (parent && Node.isParenthesizedExpression(parent)) {
    parent = parent.getParent();
  }
  if (Node.isYieldExpression(parent)) return true;
  return (
    Node.isCallExpression(parent) &&
    ['craftUse', 'craftPrivate'].includes(parent.getExpression().getText())
  );
}

function isInsideGeneratorFunction(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    if (Node.isArrowFunction(current)) return false;
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isFunctionExpression(current) ||
      Node.isMethodDeclaration(current)
    ) {
      return current.isGenerator();
    }
    if (
      Node.isGetAccessorDeclaration(current) ||
      Node.isSetAccessorDeclaration(current) ||
      Node.isConstructorDeclaration(current) ||
      Node.isPropertyDeclaration(current)
    ) {
      return false;
    }
    current = current.getParent();
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
    Node.isAsExpression(parent) ||
    Node.isSatisfiesExpression(parent) ||
    Node.isArrayLiteralExpression(parent) ||
    (Node.isCallExpression(parent) && parent.getExpression() === call)
  );
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
  if (
    node &&
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
// Phase 3 — the service factories.
// ---------------------------------------------------------------------------

function serviceCalls(sourceFile: SourceFile): CallExpression[] {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const callee = call.getExpression();
      return Node.isIdentifier(callee) && SERVICE_CALLEES.has(callee.getText());
    });
}

function isInsideServiceFactory(call: CallExpression): boolean {
  return !!call.getFirstAncestor(
    (ancestor) =>
      Node.isCallExpression(ancestor) &&
      Node.isIdentifier(ancestor.getExpression()) &&
      SERVICE_CALLEES.has(ancestor.getExpression().getText()),
  );
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

/** A named primitive yielded at the top level of the factory body. */
type YieldedPrimitive = {
  statement: Statement;
  yieldExpression: YieldExpression;
  call: CallExpression;
  primitive: string;
  binding?: VariableDeclaration;
};

/** A named yield exposed under `key` (its binding renamed when asked). */
type Exposure = {
  yielded: YieldedPrimitive;
  key: string;
  renameBinding: boolean;
};

/** A statement that replaces a returned property (a method, a hoisted yield). */
type Hoisted = { from: Node; render: (edits: readonly Edit[]) => string };

function migrateFactories(
  sourceFile: SourceFile,
  diagnostics: ServiceExposeDiagnostic[],
  imports: Set<string>,
): Edit[] {
  const edits: Edit[] = [];
  for (const call of serviceCalls(sourceFile)) {
    if (isInsideServiceFactory(call)) continue;
    const [options, factory] = call.getArguments();
    if (
      !factory ||
      !Node.isFunctionExpression(factory) ||
      !factory.isGenerator()
    ) {
      continue;
    }
    edits.push(
      ...migrateFactory(
        factory,
        readServiceName(options),
        diagnostics,
        imports,
      ),
    );
  }
  return edits;
}

function migrateFactory(
  factory: FunctionExpression,
  serviceName: string | undefined,
  diagnostics: ServiceExposeDiagnostic[],
  imports: Set<string>,
): Edit[] {
  const body = factory.getBody();
  if (!body || !Node.isBlock(body)) return [];

  const report = (node: Node, message: string) =>
    diagnostics.push({
      code: 'SERVICE_EXPOSE_MANUAL',
      filePath: relative(process.cwd(), node.getSourceFile().getFilePath()),
      line: node.getStartLineNumber(),
      service: serviceName,
      message,
      manual: true,
    });

  const returns = ownReturns(factory);
  if (returns.length > 1) {
    report(
      returns[0]!,
      'several return statements: expose each primitive by hand.',
    );
    return [];
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
      return [];
    }
    planReturnedObject(object, yields, exposures, hoisted, kept, report);
  }

  // --- edits ----------------------------------------------------------------
  const edits: Edit[] = [];
  // Renamed bindings: every reference in the factory, the returned object
  // included (its hoisted text is rendered with these edits applied).
  for (const exposure of exposures) {
    if (!exposure.renameBinding) continue;
    const oldName = exposure.yielded.binding!.getName();
    for (const identifier of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (identifier.getText() !== oldName || isMemberName(identifier)) {
        continue;
      }
      edits.push({
        start: identifier.getStart(),
        end: identifier.getEnd(),
        text: exposure.key,
      });
    }
  }

  const keptNames = new Set(
    kept.flatMap((node) =>
      node
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText()),
    ),
  );
  for (const yielded of yields) {
    const exposure = exposures.find((e) => e.yielded === yielded);
    if (exposure) {
      edits.push(...nameEdits(yielded.call, yielded.primitive, exposure.key));
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
    edits.push({
      start: argument.getStart(),
      end: argument.getStart(),
      text: 'craftPrivate(',
    });
    edits.push({ start: argument.getEnd(), end: argument.getEnd(), text: ')' });
    imports.add('craftPrivate');
  }

  if (returnStatement) {
    const start = returnStatement.getStart();
    const end = returnStatement.getEnd();
    const inReturn = (edit: Edit) => edit.start >= start && edit.end <= end;
    const returnEdits = edits.filter(inReturn);
    const indent = lineIndent(returnStatement);
    const lines = hoisted.map((entry) =>
      reindent(entry.render(returnEdits), lineIndent(entry.from), indent),
    );
    if (lines.some((line) => line.includes('craftMethod('))) {
      imports.add('craftMethod');
    }
    if (kept.length > 0) {
      lines.push(
        `return { ${kept.map((node) => textWithEdits(node, returnEdits)).join(', ')} };`,
      );
    }
    const outside = edits.filter((edit) => !inReturn(edit));
    edits.length = 0;
    edits.push(
      ...outside,
      lines.length > 0
        ? { start, end, text: lines.join(`\n${indent}`) }
        : wholeLineRemoval(returnStatement),
    );
  }
  return edits;
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
  const expose = (
    yielded: YieldedPrimitive,
    key: string,
    renameBinding: boolean,
  ) => {
    if (claimed.has(yielded) || !canName(yielded.call, yielded.primitive)) {
      return false;
    }
    claimed.add(yielded);
    exposures.push({ yielded, key, renameBinding });
    return true;
  };
  const method = (key: string, from: Node, fn: Node) => {
    hoisted.push({
      from,
      render: (edits) =>
        `yield* craftMethod('${key}', ${toGeneratorFunctionText(fn, edits)});`,
    });
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

    if (
      Node.isPropertyAssignment(property) &&
      isPlainKey(property.getNameNode())
    ) {
      const key = property.getName().replace(/^['"]|['"]$/g, '');
      const value = unwrapExpression(property.getInitializerOrThrow());

      // `k: y` — a primitive bound under another name: renamed at the source.
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
      if (
        Node.isYieldExpression(value) &&
        value.getText().startsWith('yield*')
      ) {
        const call = unwrapExpression(value.getExpressionOrThrow());
        const primitive = Node.isCallExpression(call)
          ? primitiveOf(call)
          : undefined;
        if (
          Node.isCallExpression(call) &&
          primitive &&
          canName(call, primitive)
        ) {
          hoisted.push({
            from: property,
            render: (edits) =>
              `yield* ${textWithEdits(call, [...edits, ...nameEdits(call, primitive, key)])};`,
          });
          continue;
        }
      }

      // `k: craftGen(function* ...)` — a method.
      if (
        Node.isCallExpression(value) &&
        value.getExpression().getText() === 'craftGen' &&
        value.getArguments().length === 1 &&
        toGeneratorFunctionText(value.getArguments()[0]!, []) !== undefined
      ) {
        method(key, property, value.getArguments()[0]!);
        continue;
      }

      // `k: (args) => ...` / `k: function (...) {}` — a plain method.
      if (
        (Node.isArrowFunction(value) || Node.isFunctionExpression(value)) &&
        toGeneratorFunctionText(value, []) !== undefined
      ) {
        method(key, property, value);
        continue;
      }

      report(
        property,
        `"${key}: ${truncate(value.getText())}" cannot be exposed automatically: expose a named primitive and rewrite the consumers.`,
      );
      kept.push(property);
      continue;
    }

    if (
      Node.isMethodDeclaration(property) &&
      isPlainKey(property.getNameNode()) &&
      toGeneratorFunctionText(property, []) !== undefined
    ) {
      method(property.getName(), property, property);
      continue;
    }

    report(
      property,
      `"${truncate(property.getText())}" cannot be exposed automatically.`,
    );
    kept.push(property);
  }
}

function topLevelNamedYields(statements: Statement[]): YieldedPrimitive[] {
  const result: YieldedPrimitive[] = [];
  for (const statement of statements) {
    const candidates: {
      expression: Node | undefined;
      binding?: VariableDeclaration;
    }[] = [];
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        candidates.push({
          expression: declaration.getInitializer(),
          binding: declaration,
        });
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

function isNameLiteral(node: Node): boolean {
  return (
    Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
  );
}

function nameArgumentOf(
  call: CallExpression,
  primitive: string,
): Node | undefined {
  const argument = call.getArguments()[NAMED_PRIMITIVE_NAME_ARG[primitive]!];
  if (!argument) return undefined;
  if (isNameLiteral(argument)) return argument;
  // `craftMethod({ name: 'x', providers })`
  if (Node.isObjectLiteralExpression(argument)) {
    const name = argument.getProperty('name');
    if (name && Node.isPropertyAssignment(name)) {
      const initializer = name.getInitializer();
      if (initializer && isNameLiteral(initializer)) return initializer;
    }
  }
  return undefined;
}

function isUnnamed(call: CallExpression, primitive: string): boolean {
  if (!NAMEABLE_WHEN_UNNAMED.has(primitive)) return false;
  const first = call.getArguments()[0];
  if (!first || isNameLiteral(first)) return false;
  // `state(config)` has a single argument; `state('x', config, ...)` two or more.
  return primitive !== 'state' || call.getArguments().length === 1;
}

function canName(call: CallExpression, primitive: string): boolean {
  return (
    nameArgumentOf(call, primitive) !== undefined || isUnnamed(call, primitive)
  );
}

/** Edits that set the primitive's name to `name` (inserting it when absent). */
function nameEdits(
  call: CallExpression,
  primitive: string,
  name: string,
): Edit[] {
  const literal = nameArgumentOf(call, primitive);
  if (literal) {
    const current = literal.getText().slice(1, -1);
    return current === name
      ? []
      : [{ start: literal.getStart(), end: literal.getEnd(), text: `'${name}'` }];
  }
  if (isUnnamed(call, primitive)) {
    const first = call.getArguments()[0]!;
    return [
      { start: first.getStart(), end: first.getStart(), text: `'${name}', ` },
    ];
  }
  return [];
}

/** Hoisted text keeps the indentation of its property; move it under `indent`. */
function reindent(text: string, fromIndent: string, indent: string): string {
  const [first, ...rest] = text.split('\n');
  const shift = Math.max(0, fromIndent.length - indent.length);
  const strip = new RegExp(`^ {0,${shift}}`);
  return [first, ...rest.map((line) => line.replace(strip, ''))].join('\n');
}

function wholeLineRemoval(node: Node): Edit {
  const text = node.getSourceFile().getFullText();
  const lineStart = text.lastIndexOf('\n', node.getStart() - 1) + 1;
  const onlyOnLine = text.slice(lineStart, node.getStart()).trim() === '';
  const lineEnd = text.indexOf('\n', node.getEnd());
  const restOfLine = text.slice(
    node.getEnd(),
    lineEnd === -1 ? text.length : lineEnd,
  );
  if (onlyOnLine && restOfLine.trim() === '' && lineEnd !== -1) {
    return { start: lineStart, end: lineEnd + 1, text: '' };
  }
  return { start: node.getStart(), end: node.getEnd(), text: '' };
}

function canRenameBinding(binding: VariableDeclaration, name: string): boolean {
  if (!Node.isIdentifier(binding.getNameNode())) return false;
  const scope = binding.getFirstAncestor(
    (node) =>
      Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node),
  );
  if (!scope) return false;
  return !scope
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === name && !isMemberName(identifier),
    );
}

/** A property key or member name — not a reference to a binding. */
function isMemberName(identifier: Node): boolean {
  const parent = identifier.getParent();
  return (
    (Node.isPropertyAssignment(parent) &&
      parent.getNameNode() === identifier) ||
    (Node.isPropertyAccessExpression(parent) &&
      parent.getNameNode() === identifier) ||
    (Node.isMethodDeclaration(parent) && parent.getNameNode() === identifier) ||
    (Node.isPropertySignature(parent) && parent.getNameNode() === identifier)
  );
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
 * `(a) => expr`, `function (a) {}`, `function* (a) {}` or a method as the text
 * of a generator function — `undefined` for what cannot become one
 * faithfully: an async function, or one relying on its own `this` /
 * `arguments`. A declared return type `T` becomes `Generator<never, T>`.
 */
function toGeneratorFunctionText(
  fn: Node,
  edits: readonly Edit[],
): string | undefined {
  if (
    !Node.isArrowFunction(fn) &&
    !Node.isFunctionExpression(fn) &&
    !Node.isMethodDeclaration(fn)
  ) {
    return undefined;
  }
  if (fn.isAsync()) return undefined;
  if (!Node.isArrowFunction(fn) && usesOwnThisOrArguments(fn)) {
    return undefined;
  }
  const isGenerator = !Node.isArrowFunction(fn) && fn.isGenerator();
  const returnType = fn.getReturnTypeNode();

  const typeParameters = fn
    .getTypeParameters()
    .map((typeParameter) => textWithEdits(typeParameter, edits));
  const typeParams = typeParameters.length
    ? `<${typeParameters.join(', ')}>`
    : '';
  const parameters = fn
    .getParameters()
    .map((parameter) => textWithEdits(parameter, edits))
    .join(', ');
  const body = fn.getBody();
  if (!body) return undefined;
  const bodyText = textWithEdits(body, edits);
  const block = Node.isBlock(body) ? bodyText : `{ return ${bodyText}; }`;
  const annotation = !returnType
    ? ''
    : isGenerator
      ? `: ${textWithEdits(returnType, edits)}`
      : `: Generator<never, ${textWithEdits(returnType, edits)}>`;
  return `function* ${typeParams}(${parameters})${annotation} ${block}`;
}

function usesOwnThisOrArguments(fn: Node): boolean {
  return fn.getDescendants().some((node) => {
    const isThis = Node.isThisExpression(node);
    const isArguments =
      Node.isIdentifier(node) && node.getText() === 'arguments';
    if (!isThis && !isArguments) return false;
    // `this` / `arguments` belong to the closest non-arrow function.
    const owner = node.getFirstAncestor(
      (ancestor) =>
        Node.isFunctionExpression(ancestor) ||
        Node.isFunctionDeclaration(ancestor) ||
        Node.isMethodDeclaration(ancestor),
    );
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
    (Node.isStringLiteral(name) &&
      /^[A-Za-z_$][\w$]*$/.test(name.getLiteralValue()))
  );
}

function describe(node: Node): string {
  if (Node.isCallExpression(node)) {
    return `a call (${truncate(node.getText())})`;
  }
  return `"${truncate(node.getText())}"`;
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > 60 ? `${flat.slice(0, 57)}...` : flat;
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

function importedLocalNames(
  sourceFile: SourceFile,
  names: Set<string>,
  module: RegExp,
): Map<string, string> {
  const local = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!module.test(declaration.getModuleSpecifierValue())) continue;
    for (const specifier of declaration.getNamedImports()) {
      if (names.has(specifier.getName())) {
        local.set(
          specifier.getAliasNode()?.getText() ?? specifier.getName(),
          specifier.getName(),
        );
      }
    }
  }
  return local;
}

const CORE_SYMBOL_MODULE: Record<string, string> = {
  craftPrivate: 'libs/core/src/lib/craft-primitive-gen',
  craftMethod: 'libs/core/src/lib/craft-method',
  craftUse: 'libs/core/src/lib/craft-use',
};

function addImports(sourceFile: SourceFile, symbols: Set<string>): Edit[] {
  const edits: Edit[] = [];
  const pending = new Map<string, string[]>();
  for (const symbol of symbols) {
    const imported = sourceFile
      .getImportDeclarations()
      .some((declaration) =>
        declaration
          .getNamedImports()
          .some((specifier) => specifier.getName() === symbol),
      );
    if (imported) continue;
    const module = moduleFor(sourceFile, symbol);
    pending.set(module, [...(pending.get(module) ?? []), symbol]);
  }

  const text = sourceFile.getFullText();
  for (const [module, names] of pending) {
    const declaration = sourceFile
      .getImportDeclarations()
      .find(
        (candidate) =>
          candidate.getModuleSpecifierValue() === module &&
          !candidate.isTypeOnly() &&
          candidate.getNamedImports().length > 0,
      );
    if (declaration) {
      const specifiers = declaration.getNamedImports();
      const last = specifiers[specifiers.length - 1]!;
      const afterLast = text.slice(last.getEnd());
      const trailingComma = /^\s*,/.test(afterLast);
      if (declaration.getText().includes('\n')) {
        // One specifier per line, trailing comma kept as found.
        const indent = lineIndent(last);
        const position = trailingComma
          ? last.getEnd() + afterLast.indexOf(',') + 1
          : last.getEnd();
        const added = names.map((name) => `\n${indent}${name}`).join(',');
        edits.push({
          start: position,
          end: position,
          text: trailingComma ? `${added},` : `,${added}`,
        });
      } else {
        edits.push({
          start: last.getEnd(),
          end: last.getEnd(),
          text: names.map((name) => `, ${name}`).join(''),
        });
      }
      continue;
    }
    const declarations = sourceFile.getImportDeclarations();
    const anchor = declarations[declarations.length - 1];
    const line = `import { ${names.join(', ')} } from '${module}';`;
    edits.push(
      anchor
        ? { start: anchor.getEnd(), end: anchor.getEnd(), text: `\n${line}` }
        : { start: 0, end: 0, text: `${line}\n` },
    );
  }
  return edits;
}

function moduleFor(sourceFile: SourceFile, symbol: string): string {
  const filePath = resolve(sourceFile.getFilePath());
  const coreSrc = resolve('libs/core/src');
  if (!filePath.startsWith(coreSrc + '/')) return '@craft-ts/core';
  let specifier = relative(
    dirname(filePath),
    resolve(CORE_SYMBOL_MODULE[symbol]!),
  );
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

function removeUnusedImport(sourceFile: SourceFile, symbol: string): void {
  const used = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === symbol &&
        !Node.isImportSpecifier(identifier.getParent()),
    );
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

const isCli = process.argv[1]?.includes('migrate-service-auto-expose');
if (isCli) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--paths');
  const paths =
    index === -1 ? undefined : args[index + 1]?.split(',').filter(Boolean);
  if (!paths || paths.length === 0) {
    console.error(
      'Usage: migrate-service-auto-expose --paths <glob,...> [--dry]',
    );
    process.exit(1);
  }
  void migrateServiceAutoExpose({
    paths,
    write: !args.includes('--dry'),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
