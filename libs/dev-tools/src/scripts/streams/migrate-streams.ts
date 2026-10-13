import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type Expression,
  type SourceFile,
} from 'ts-morph';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// RxJS -> @craft-ts/stream.
//
// The migration is ALL-OR-NOTHING per file. A file that mixes migrated and
// unmigrated RxJS would end up piping craft operators onto an rxjs `Observable`
// (or the reverse), which compiles to nonsense; so a file is rewritten only when
// every rxjs symbol it imports has an equivalent AND every `.pipe(...)` receiver
// can be classified. Otherwise the file is left untouched and a manual
// diagnostic says exactly what blocks it.
//
// Semantics that DO change are reported as non-blocking review notices:
// `timeout` now raises a typed exception, `retry` retries typed exceptions (not
// defects), `catchError` has no equivalent (it is `catchTag`, which is typed).
// ---------------------------------------------------------------------------

export type StreamMigrationDiagnosticCode =
  | 'RXJS_SYMBOL_UNSUPPORTED'
  | 'RXJS_IMPORT_FORM_UNSUPPORTED'
  | 'RXJS_CALL_FORM_UNSUPPORTED'
  | 'RXJS_PIPE_RECEIVER_UNKNOWN'
  | 'RXJS_SEMANTICS_CHANGED';

export type StreamMigrationDiagnostic = {
  code: StreamMigrationDiagnosticCode;
  filePath: string;
  symbol?: string;
  message: string;
  /** `true` blocks the file; `false` is a review notice on a migrated file. */
  manual: boolean;
};

export type MigrateStreamsOptions = {
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

export type MigrateStreamsResult = {
  changedFiles: string[];
  files: Array<{ filePath: string; changed: boolean }>;
  diagnostics: StreamMigrationDiagnostic[];
  remainingRxjsImports: number;
  eslintRan: boolean;
  exitCode: number;
};

// --- the symbol table -------------------------------------------------------

/** Same name in `@craft-ts/stream`. */
const SAME_NAME_STREAM = new Set([
  'map',
  'filter',
  'tap',
  'scan',
  'take',
  'skip',
  'takeWhile',
  'distinctUntilChanged',
  'startWith',
  'takeUntil',
  'switchMap',
  'mergeMap',
  'concatMap',
  'exhaustMap',
  'merge',
  'zip',
  'race',
  'withLatestFrom',
  'combineLatest',
  'delay',
  'timeout',
  'retry',
  'repeat',
  'buffer',
  'bufferCount',
  'bufferTime',
  'pairwise',
  'sample',
  'groupBy',
  'window',
  'auditTime',
  'windowCount',
  'bufferWhen',
  'expand',
  'interval',
  'timer',
  'fromEvent',
  'share',
  'shareReplay',
  'of',
  'first',
  'last',
  'takeLast',
  'reduce',
  'skipWhile',
  'skipUntil',
  'defaultIfEmpty',
  'ignoreElements',
  'endWith',
  'distinct',
  'finalize',
  'switchAll',
  'mergeAll',
  'concatAll',
  'exhaustAll',
  'concat',
  'concatWith',
  'mergeWith',
  'combineLatestWith',
  'defer',
  'throwError',
  'materialize',
  'dematerialize',
  'observeOn',
  'subscribeOn',
  'publish',
  'publishReplay',
  'publishBehavior',
  'multicast',
  'refCount',
  'connectable',
  'generate',
  'bindCallback',
  'bindNodeCallback',
  'fromFetch',
  'webSocket',
  'connect',
  'count',
  'min',
  'max',
  'every',
  'isEmpty',
  'find',
  'findIndex',
  'single',
  'elementAt',
  'throwIfEmpty',
  'skipLast',
  'mapTo',
  'distinctUntilKeyChanged',
  'timestamp',
  'timeInterval',
  'range',
  'iif',
  'forkJoin',
  'partition',
  'zipWith',
  'raceWith',
  'zipAll',
  'combineLatestAll',
  'audit',
  'delayWhen',
  'sampleTime',
]);

/** Renamed on the way. */
const RENAMED_STREAM = new Map([
  ['debounceTime', 'debounce'],
  ['throttleTime', 'throttle'],
  ['exhaust', 'exhaustAll'],
]);

const SUBJECT_FACTORIES = new Map([
  ['Subject', 'subject'],
  ['BehaviorSubject', 'behaviorSubject'],
  ['ReplaySubject', 'replaySubject'],
]);

/** Creators whose result is already a craft stream. */
const STREAM_CREATORS = new Set([
  'of',
  'merge',
  'combineLatest',
  'zip',
  'race',
  'interval',
  'timer',
  'fromEvent',
  'concat',
  'defer',
  'throwError',
  'connectable',
  'generate',
  'fromFetch',
  'webSocket',
  'ajax',
  'range',
  'iif',
  'forkJoin',
]);

const TYPE_ONLY = new Set(['Observable', 'Subscription']);

/**
 * rxjs scheduler constants. craft has exactly one scheduler — the temporal
 * runtime — so a scheduler argument has nothing to select: it is dropped, and a
 * review notice says that the timing is now the temporal runtime's. (For
 * `asapScheduler`, `queueScheduler` and `animationFrameScheduler` that IS a
 * change of timing, which is why the notice names them.)
 */
const DROPPABLE_SCHEDULERS = new Set([
  'asyncScheduler',
  'asapScheduler',
  'queueScheduler',
  'animationFrameScheduler',
]);

/** Operators whose result is connectable (`.connect()`). */
const PUBLISH_FAMILY = new Set([
  'publish',
  'publishReplay',
  'publishBehavior',
  'multicast',
]);

/**
 * Symbols with no one-to-one equivalent, and the way out. Empty today: every
 * rxjs export the codemod knows of has a translation. A symbol outside every
 * table is reported without a hint.
 */
const UNSUPPORTED_HINTS = new Map<string, string>([
  ['retryWhen', 'use `retry` with a policy (delay, backoff) or `catchTag`'],
  ['repeatWhen', 'use `repeat` with its options'],
  ['mergeScan', 'use `scan` over `mergeMap`, or `expand`'],
  ['switchScan', 'use `scan` over `switchMap`'],
  ['windowTime', 'use `bufferTime`, or `windowCount`'],
  ['windowToggle', 'use `bufferWhen` / `windowCount`'],
  ['windowWhen', 'use `bufferWhen`'],
  ['bufferToggle', 'use `bufferWhen`'],
  ['using', 'use `defer` and `finalize` for the resource'],
  ['onErrorResumeNext', 'use `catchTag` / `orElse` on the typed exceptions'],
  ['publishLast', 'use `connectable` with a `replaySubject(1)` connector'],
  ['timeoutWith', 'use `timeout` and `catchTag` on its exception'],
  ['sequenceEqual', 'use `zip` + `every`, or compare `toArray()` results'],
  ['animationFrames', 'use `fromEvent` on a frame source, or `interval`'],
  ['pluck', 'use `map((value) => value.key)`'],
  ['concatMapTo', 'use `concatMap(() => inner)`'],
  ['mergeMapTo', 'use `mergeMap(() => inner)`'],
  ['switchMapTo', 'use `switchMap(() => inner)`'],
  [
    'OperatorFunction',
    'use `StreamOperator<AIn, YIn, AOut, YOut>`: it also carries the yielded type (dependencies, exceptions)',
  ],
  [
    'MonoTypeOperatorFunction',
    'use `StreamOperator<A, Y, A, Y>` (or a generic `<A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>`)',
  ],
  ['UnaryFunction', 'write the function type out: `(source: T) => R`'],
  [
    'ObservableInput',
    'use `Subscribable<T> | PromiseLike<T> | Iterable<T>`, or accept a `CraftStream<T, Y>` to keep its type',
  ],
  ['ObservedValueOf', 'use `StreamValue<S>`'],
  [
    'Subscriber',
    'use `StreamSink<T>` inside an operator, `StreamObserver<T>` for a consumer',
  ],
  [
    'TeardownLogic',
    'return an `Unsubscribable` or a cleanup function from the stream setup',
  ],
  [
    'Notification',
    'use `materialize()` / `dematerialize()` and their notification values',
  ],
  [
    'ObservableNotification',
    'use `materialize()` / `dematerialize()` and their notification values',
  ],
  [
    'SchedulerLike',
    'there is one scheduler, the temporal runtime: drop the parameter',
  ],
]);

/**
 * Names that move to `@craft-ts/stream` unchanged, wherever they are used (as
 * a value, a member-call receiver like `ajax.getJSON`, or a type).
 */
const PASSTHROUGH_NAMES = new Set([
  'ajax',
  'AjaxError',
  'AjaxResponse',
  'AjaxConfig',
]);

/** Type names that move to `@craft-ts/stream` under another name. */
const RENAMED_TYPES = new Map([
  ['WebSocketSubject', 'WebSocketStream'],
  ['WebSocketSubjectConfig', 'WebSocketConfig'],
]);

/**
 * rxjs names with a direct `@craft-ts/core` counterpart (same name or renamed),
 * wherever they are used: a value, a call or a type.
 */
const CORE_RENAMES = new Map([
  ['isObservable', 'isObservableLike'],
  ['Observer', 'StreamObserver'],
  ['SubscriptionLike', 'Unsubscribable'],
  ['Unsubscribable', 'Unsubscribable'],
  ['Subscribable', 'Subscribable'],
]);

/** The rxjs entry points whose imports are migrated (or diagnosed). */
const RXJS_MODULES = new Set([
  'rxjs',
  'rxjs/operators',
  'rxjs/ajax',
  'rxjs/webSocket',
  'rxjs/fetch',
]);

const WRAP = 'fromSubscribable';

type Edit = { start: number; end: number; text: string };

type Classification = 'stream' | 'wrap' | 'unknown';

type FileContext = {
  sourceFile: SourceFile;
  /** local name -> imported name, for the rxjs imports. */
  locals: Map<string, string>;
  edits: Edit[];
  blockers: StreamMigrationDiagnostic[];
  notices: StreamMigrationDiagnostic[];
  needsStream: Set<string>;
  needsCore: Set<string>;
};

export async function runStreamsMigration(
  options: MigrateStreamsOptions = {},
): Promise<MigrateStreamsResult> {
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

  const diagnostics: StreamMigrationDiagnostic[] = [];
  const touched: SourceFile[] = [];
  const files = new Map<string, { filePath: string; changed: boolean }>();

  for (const sourceFile of sourceFiles) {
    const outcome = migrateStreamsInFile(sourceFile);
    diagnostics.push(...outcome.diagnostics);
    files.set(sourceFile.getFilePath(), {
      filePath: sourceFile.getFilePath(),
      changed: outcome.changed,
    });
    if (outcome.changed) touched.push(sourceFile);
  }

  if (options.write) {
    await Promise.all(touched.map((file) => file.save()));
  }

  let eslintRan = false;
  if (options.write && options.eslint !== false && touched.length > 0) {
    await runEslint(
      touched.map((file) => file.getFilePath()),
      rootDir,
    );
    eslintRan = true;
  }

  const remainingRxjsImports = sourceFiles.filter(
    (file) => rxjsImports(file).length > 0,
  ).length;
  const result: MigrateStreamsResult = {
    changedFiles: touched.map((file) => file.getFilePath()),
    files: [...files.values()],
    diagnostics,
    remainingRxjsImports,
    eslintRan,
    exitCode:
      (options.check && remainingRxjsImports > 0) ||
      (options.failOnManual && diagnostics.some((item) => item.manual))
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

function rxjsImports(sourceFile: SourceFile) {
  return sourceFile.getImportDeclarations().filter((declaration) => {
    return RXJS_MODULES.has(declaration.getModuleSpecifierValue());
  });
}

type ImportProblem = { message: string; symbol?: string };

/**
 * Rewrites aliased (`map as rxMap`) and namespace (`import * as rx`) rxjs
 * imports to plain named ones, renaming every reference, so the rest of the
 * migration only ever sees canonical names. Anything it cannot rename safely
 * (a clash with another binding, a shorthand property, the namespace used as a
 * value) is reported and left alone. The caller restores the file when the
 * migration is blocked.
 */
function normalizeRxjsImports(sourceFile: SourceFile): ImportProblem[] {
  const problems: ImportProblem[] = [];
  const edits: Edit[] = [];

  const isImportName = (node: Node) =>
    node.getFirstAncestorByKind(SyntaxKind.ImportSpecifier) !== undefined ||
    node.getFirstAncestorByKind(SyntaxKind.NamespaceImport) !== undefined;
  const nameInUse = (name: string) =>
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some((identifier) => {
        if (identifier.getText() !== name || isImportName(identifier)) {
          return false;
        }
        // A property name (`x.name`, `Ns.name`) is not a binding: it cannot clash.
        const parent = identifier.getParent();
        if (
          Node.isPropertyAccessExpression(parent) &&
          parent.getNameNode() === identifier
        ) {
          return false;
        }
        if (Node.isQualifiedName(parent) && parent.getRight() === identifier) {
          return false;
        }
        return true;
      });

  for (const declaration of rxjsImports(sourceFile)) {
    for (const specifier of declaration.getNamedImports()) {
      const alias = specifier.getAliasNode();
      if (!alias) continue;
      const name = specifier.getName();
      if (nameInUse(name)) {
        problems.push({
          message: `\`${name} as ${alias.getText()}\`: \`${name}\` is already used as another name in this file, so the alias cannot be renamed away.`,
          symbol: name,
        });
        continue;
      }
      // The import specifier itself is rewritten as a whole below.
      const references = alias
        .findReferencesAsNodes()
        .filter((reference) => !isImportName(reference));
      if (
        references.some((reference) =>
          Node.isShorthandPropertyAssignment(reference.getParent()),
        )
      ) {
        problems.push({
          message: `\`${alias.getText()}\` is used as a shorthand property: renaming it would change the property name.`,
          symbol: name,
        });
        continue;
      }
      for (const reference of references) {
        edits.push({
          start: reference.getStart(),
          end: reference.getEnd(),
          text: name,
        });
      }
      edits.push({
        start: specifier.getStart(),
        end: specifier.getEnd(),
        text: name,
      });
    }

    const namespace = declaration.getNamespaceImport();
    if (!namespace) continue;
    const members = new Set<string>();
    const namespaceEdits: Edit[] = [];
    let usable = true;
    const use = (outer: Node, member: string) => {
      members.add(member);
      namespaceEdits.push({
        start: outer.getStart(),
        end: outer.getEnd(),
        text: member,
      });
    };
    for (const reference of namespace
      .findReferencesAsNodes()
      .filter((candidate) => !isImportName(candidate))) {
      const parent = reference.getParent();
      if (
        Node.isPropertyAccessExpression(parent) &&
        parent.getExpression() === reference
      ) {
        const outer = parent.getParent();
        if (parent.getName() === 'operators') {
          // rx.operators.map
          if (
            Node.isPropertyAccessExpression(outer) &&
            outer.getExpression() === parent
          ) {
            use(outer, outer.getName());
            continue;
          }
          usable = false;
          break;
        }
        use(parent, parent.getName());
      } else if (
        Node.isQualifiedName(parent) &&
        parent.getLeft() === reference
      ) {
        use(parent, parent.getRight().getText());
      } else {
        usable = false;
        break;
      }
    }
    const namespaceName = namespace.getText();
    if (!usable) {
      problems.push({
        message: `\`${namespaceName}\` is used as a value (not only as \`${namespaceName}.member\`), so the namespace import cannot be expanded.`,
      });
    } else if ([...members].some(nameInUse)) {
      problems.push({
        message: `A member of \`${namespaceName}\` would clash with another name already used in this file.`,
      });
    } else {
      // The `* as ns` clause is the identifier's parent node.
      const clause = namespace.getParent();
      edits.push(...namespaceEdits);
      edits.push({
        start: clause.getStart(),
        end: clause.getEnd(),
        text: `{ ${[...members].sort().join(', ')} }`,
      });
    }
  }

  if (edits.length > 0) {
    const ordered = [...edits].sort(
      (a, b) => b.start - a.start || b.end - a.end,
    );
    let text = sourceFile.getFullText();
    for (const edit of ordered) {
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    }
    sourceFile.replaceWithText(text);
  }
  return problems;
}

export function migrateStreamsInFile(sourceFile: SourceFile): {
  changed: boolean;
  diagnostics: StreamMigrationDiagnostic[];
} {
  if (rxjsImports(sourceFile).length === 0) {
    return { changed: false, diagnostics: [] };
  }
  const original = sourceFile.getFullText();
  const importProblems = normalizeRxjsImports(sourceFile);
  const declarations = rxjsImports(sourceFile);

  const filePath = sourceFile.getFilePath();
  const context: FileContext = {
    sourceFile,
    locals: new Map(),
    edits: [],
    blockers: [],
    notices: [],
    needsStream: new Set(),
    needsCore: new Set(),
  };
  const block = (
    code: StreamMigrationDiagnosticCode,
    message: string,
    symbol?: string,
  ) =>
    context.blockers.push({
      code,
      filePath,
      message,
      manual: true,
      ...(symbol ? { symbol } : {}),
    });

  for (const problem of importProblems) {
    block('RXJS_IMPORT_FORM_UNSUPPORTED', problem.message, problem.symbol);
  }

  // 1. Imports: every symbol must have an equivalent.
  for (const declaration of declarations) {
    if (declaration.getNamespaceImport() || declaration.getDefaultImport()) {
      // A namespace that normalization could not expand has already been
      // reported, with the reason.
      if (importProblems.length === 0) {
        block(
          'RXJS_IMPORT_FORM_UNSUPPORTED',
          'A namespace or default import of rxjs cannot be migrated automatically.',
        );
      }
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const name = specifier.getName();
      if (specifier.getAliasNode()) {
        // An alias that normalization could not rename has already been reported.
        if (importProblems.length === 0) {
          block(
            'RXJS_IMPORT_FORM_UNSUPPORTED',
            `\`${name} as ${specifier.getAliasNode()?.getText()}\`: aliased rxjs imports are not migrated automatically.`,
            name,
          );
        }
        continue;
      }
      if (
        SAME_NAME_STREAM.has(name) ||
        RENAMED_STREAM.has(name) ||
        SUBJECT_FACTORIES.has(name) ||
        TYPE_ONLY.has(name) ||
        name === 'from' ||
        name === 'scheduled' ||
        name === 'EMPTY' ||
        name === 'NEVER' ||
        name === 'catchError' ||
        name === 'firstValueFrom' ||
        name === 'lastValueFrom' ||
        PASSTHROUGH_NAMES.has(name) ||
        RENAMED_TYPES.has(name) ||
        CORE_RENAMES.has(name) ||
        DROPPABLE_SCHEDULERS.has(name)
      ) {
        context.locals.set(name, name);
        continue;
      }
      const hint = UNSUPPORTED_HINTS.get(name);
      block(
        'RXJS_SYMBOL_UNSUPPORTED',
        `\`${name}\` has no @craft-ts/stream equivalent${hint ? `: ${hint}` : ''}.`,
        name,
      );
    }
  }

  if (context.blockers.length === 0) collectEdits(context, block);

  if (context.blockers.length > 0) {
    // Import normalization may already have rewritten the file in memory.
    if (sourceFile.getFullText() !== original) {
      sourceFile.replaceWithText(original);
    }
    return { changed: false, diagnostics: context.blockers };
  }

  applyEdits(context);
  return { changed: true, diagnostics: context.notices };
}

// --- classification of stream-ish expressions --------------------------------

function classify(
  expression: Node,
  context: FileContext,
  depth = 0,
): Classification {
  if (depth > 6) return 'unknown';

  if (Node.isParenthesizedExpression(expression)) {
    return classify(expression.getExpression(), context, depth + 1);
  }
  if (Node.isAsExpression(expression) || Node.isNonNullExpression(expression)) {
    return classify(expression.getExpression(), context, depth + 1);
  }

  if (Node.isNewExpression(expression)) {
    const callee = expression.getExpression().getText();
    return SUBJECT_FACTORIES.has(callee) && context.locals.has(callee)
      ? 'wrap'
      : 'unknown';
  }

  if (Node.isCallExpression(expression)) {
    const callee = expression.getExpression();
    // bindCallback(fn)(...args): the inner call builds the function, this one the stream.
    if (
      Node.isCallExpression(callee) &&
      Node.isIdentifier(callee.getExpression()) &&
      ['bindCallback', 'bindNodeCallback'].includes(
        callee.getExpression().getText(),
      ) &&
      context.locals.has(callee.getExpression().getText())
    ) {
      return 'stream';
    }
    if (Node.isIdentifier(callee)) {
      const name = callee.getText();
      if (name === 'from' || name === 'scheduled') return 'stream';
      if (STREAM_CREATORS.has(name) && context.locals.has(name))
        return 'stream';
      return 'unknown';
    }
    if (Node.isPropertyAccessExpression(callee)) {
      const member = callee.getName();
      if (member === 'pipe') {
        return classify(callee.getExpression(), context, depth + 1) ===
          'unknown'
          ? 'unknown'
          : 'stream';
      }
      if (member === 'asObservable') return 'wrap';
      // ajax.getJSON(...), ajax.post(...): the stream-shaped HTTP calls.
      const receiver = callee.getExpression();
      if (
        Node.isIdentifier(receiver) &&
        receiver.getText() === 'ajax' &&
        context.locals.has('ajax')
      ) {
        return 'stream';
      }
    }
    return 'unknown';
  }

  if (Node.isIdentifier(expression)) {
    const identifierName = expression.getText();
    if (
      (identifierName === 'EMPTY' || identifierName === 'NEVER') &&
      context.locals.has(identifierName)
    ) {
      return 'stream';
    }
    return classifyDeclarations(expression, context, depth);
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return classifyDeclarations(expression.getNameNode(), context, depth);
  }
  return 'unknown';
}

const STREAM_TYPE_NAMES =
  /^(Observable|Subject|BehaviorSubject|ReplaySubject)\b/;

function classifyDeclarations(
  node: Node,
  context: FileContext,
  depth: number,
): Classification {
  const symbol = node.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    // The `shared` parameter of a connect/publish/multicast selector IS a craft
    // stream (it is what the migrated `connect(selector)` hands over).
    if (Node.isParameterDeclaration(declaration)) {
      const fn = declaration.getParent();
      const call = fn?.getParent();
      if (
        (Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) &&
        Node.isCallExpression(call) &&
        fn.getParameters()[0] === declaration
      ) {
        const callee = call.getExpression().getText();
        if (
          (callee === 'connect' || PUBLISH_FAMILY.has(callee)) &&
          context.locals.has(callee)
        ) {
          return 'stream';
        }
      }
    }
    if (
      Node.isVariableDeclaration(declaration) ||
      Node.isPropertyDeclaration(declaration) ||
      Node.isParameterDeclaration(declaration) ||
      Node.isPropertySignature(declaration)
    ) {
      const typeNode = declaration.getTypeNode();
      if (typeNode && STREAM_TYPE_NAMES.test(typeNode.getText())) return 'wrap';
      if (
        !Node.isPropertySignature(declaration) &&
        !Node.isParameterDeclaration(declaration)
      ) {
        const initializer = declaration.getInitializer();
        if (initializer) {
          const kind = classify(initializer, context, depth + 1);
          if (kind !== 'unknown') return kind;
        }
      }
    }
  }
  return 'unknown';
}

// --- edits ---------------------------------------------------------------------

function collectEdits(
  context: FileContext,
  block: (
    code: StreamMigrationDiagnosticCode,
    message: string,
    symbol?: string,
  ) => void,
): void {
  const { sourceFile, locals, edits } = context;
  const replace = (node: Node, text: string) =>
    edits.push({ start: node.getStart(), end: node.getEnd(), text });
  const insertBefore = (node: Node, text: string) =>
    edits.push({ start: node.getStart(), end: node.getStart(), text });
  const insertAfter = (node: Node, text: string) =>
    edits.push({ start: node.getEnd(), end: node.getEnd(), text });

  /** Makes `argument` a craft stream, or reports why it cannot be. */
  const asStream = (argument: Node, owner: string): void => {
    const kind = classify(argument, context);
    if (kind === 'wrap') {
      insertBefore(argument, `${WRAP}(`);
      insertAfter(argument, ')');
      context.needsStream.add(WRAP);
    } else if (kind === 'unknown') {
      wrapUnrecognised(argument, owner);
    }
  };

  /**
   * A value whose type the codemod cannot establish is wrapped in `from(...)`:
   * it decides at run time (a craft stream, an Observable/Subject, a Promise or
   * an iterable all work), so the result is correct either way — and a review
   * notice says where to drop the wrapper.
   */
  const wrapUnrecognised = (argument: Node, owner: string): void => {
    insertBefore(argument, 'from(');
    insertAfter(argument, ')');
    context.needsStream.add('from');
    if (!noticed.has('from-wrap')) {
      noticed.add('from-wrap');
      notice(
        owner,
        'A value whose type could not be recognised was wrapped in from(...): it accepts a craft stream, an rxjs Observable/Subject, a Promise or an iterable. Drop the wrapper where the value is already a craft stream.',
      );
    }
  };

  const notice = (symbol: string, message: string) =>
    context.notices.push({
      code: 'RXJS_SEMANTICS_CHANGED',
      filePath: sourceFile.getFilePath(),
      symbol,
      message,
      manual: false,
    });

  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  const noticed = new Set<string>();
  let droppedSchedulers = 0;
  /** `publish()` calls folded into a `connectable(...)` rewrite. */
  const removedCalls = new Set<Node>();
  /**
   * Publish-family calls whose replacement text was rebuilt from their
   * arguments: edits nested inside them would overlap that replacement.
   */
  const rebuiltCalls = new Set<Node>();
  /** Source ranges whose text was replaced wholesale by a rewrite. */
  const rebuiltRanges: Array<[number, number]> = [];

  for (const call of calls) {
    if (removedCalls.has(call)) continue;
    const callee = call.getExpression();
    const allArgs = call.getArguments();
    let args = allArgs;

    // x.pipe(...)
    if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === 'pipe'
    ) {
      const kind = classify(callee.getExpression(), context);
      if (kind === 'wrap') {
        insertBefore(callee.getExpression(), `${WRAP}(`);
        insertAfter(callee.getExpression(), ')');
        context.needsStream.add(WRAP);
      } else if (kind === 'unknown') {
        wrapUnrecognised(callee.getExpression(), 'pipe');
      }

      // The publish family makes the pipe's result connectable, but `.pipe(...)`
      // types it as a plain stream (no `connect`). Paired with `refCount()` it
      // is simply `share()`; a trailing `publish()` becomes `connectable(...)`;
      // anything else needs a hand-written `connectable(source, { connector })`.
      allArgs.forEach((argument, position) => {
        if (!Node.isCallExpression(argument)) return;
        const operatorName = argument.getExpression().getText();
        if (!PUBLISH_FAMILY.has(operatorName) || !locals.has(operatorName))
          return;
        const following = allArgs[position + 1];
        if (
          following &&
          Node.isCallExpression(following) &&
          following.getExpression().getText() === 'refCount' &&
          locals.has('refCount')
        ) {
          return;
        }
        const isLast = position === allArgs.length - 1;
        const isSchedulerArgument = (candidate: Node) =>
          Node.isIdentifier(candidate) &&
          DROPPABLE_SCHEDULERS.has(candidate.getText()) &&
          locals.has(candidate.getText());
        // Scheduler arguments vanish with the text around the connector's
        // arguments; they only need counting (and a notice).
        const schedulerArguments = argument
          .getArguments()
          .filter(isSchedulerArgument);
        droppedSchedulers += schedulerArguments.length;
        for (const scheduler of schedulerArguments) {
          const schedulerName = scheduler.getText();
          if (noticed.has(schedulerName)) continue;
          noticed.add(schedulerName);
          notice(
            schedulerName,
            `${schedulerName} arguments were dropped: craft has one scheduler, the temporal runtime.`,
          );
        }
        const operatorArgs = argument
          .getArguments()
          .filter((candidate) => !isSchedulerArgument(candidate));
        // Selector forms — publish(sel), publishReplay(n, w, sel),
        // multicast(subject, sel) — do not make the pipe connectable: they share
        // the source with the selector, which is `connect(sel, { connector })`.
        const isFunctionLike = (candidate: Node) =>
          Node.isArrowFunction(candidate) ||
          Node.isFunctionExpression(candidate);
        const selectorIndex =
          operatorName === 'publish'
            ? operatorArgs.length === 1 && isFunctionLike(operatorArgs[0])
              ? 0
              : -1
            : operatorName === 'publishReplay'
              ? operatorArgs.findIndex(isFunctionLike)
              : operatorName === 'multicast'
                ? operatorArgs.length === 2 && isFunctionLike(operatorArgs[1])
                  ? 1
                  : -1
                : -1;
        if (selectorIndex >= 0) {
          const selector = operatorArgs[selectorIndex];
          const leading = operatorArgs.slice(0, selectorIndex);
          let connector: string | undefined;
          if (operatorName === 'publish') {
            connector = '';
          } else if (operatorName === 'publishReplay') {
            connector = connectorTextFor('publishReplay', leading, context);
          } else {
            // multicast(subjectOrFactory, selector)
            connector = connectorTextFor('multicast', leading, context);
          }
          if (connector === undefined) {
            block(
              'RXJS_CALL_FORM_UNSUPPORTED',
              `${operatorName}(..., selector) is only migrated with a subject constructed in place.`,
              operatorName,
            );
            return;
          }
          // connect(selector, { connector }): the selector stays where it is, so
          // rewrites inside it stay valid; only the arguments before it go.
          edits.push({
            start: argument.getStart(),
            end: selector.getStart(),
            text: 'connect(',
          });
          edits.push({
            start: selector.getEnd(),
            end: argument.getEnd(),
            text: connector ? `${connector})` : ')',
          });
          rebuiltRanges.push([argument.getStart(), selector.getStart()]);
          context.needsStream.add('connect');
          removedCalls.add(argument);
          return;
        }

        const connectorArgument = operatorArgs[0];
        const supported =
          operatorName === 'publish'
            ? operatorArgs.length === 0
            : operatorName === 'publishReplay'
              ? operatorArgs.length <= 2
              : operatorArgs.length === 1;
        if (!supported) {
          block(
            'RXJS_CALL_FORM_UNSUPPORTED',
            `${operatorName}(...) with a selector or extra arguments is not migrated automatically.`,
            operatorName,
          );
          return;
        }

        if (!isLast) {
          // x.pipe(a, publishX(arg), b)  ->  connectable(x.pipe(a), { connector }).pipe(b)
          // Nothing could ever connect it in rxjs either (no refCount, and
          // `.pipe` hides the connectable), so the translation is faithful.
          const connector = connectorTextFor(
            operatorName,
            operatorArgs,
            context,
          );
          if (connector === undefined) {
            block(
              'RXJS_CALL_FORM_UNSUPPORTED',
              `${operatorName}(...) in the middle of a pipe is only migrated with a subject constructed in place or a plain argument.`,
              operatorName,
            );
            return;
          }
          const midReceiver = callee.getExpression();
          const midOnlyBefore = position === 0;
          edits.push({
            start: call.getStart(),
            end: call.getStart(),
            text: 'connectable(',
          });
          edits.push({
            start: midOnlyBefore
              ? midReceiver.getEnd()
              : allArgs[position - 1].getEnd(),
            end: allArgs[position + 1].getStart(),
            text: `${midOnlyBefore ? '' : ')'}${connector}).pipe(`,
          });
          context.needsStream.add('connectable');
          removedCalls.add(argument);
          rebuiltCalls.add(argument);
          return;
        }

        // x.pipe(a, b, publishX(arg))  ->  connectable(x.pipe(a, b), { connector })
        // The connector's argument stays where it is, so rewrites inside it
        // stay valid: only the text AROUND it is replaced.
        const receiver = callee.getExpression();
        const only = allArgs.length === 1;
        const gapStart = only
          ? receiver.getEnd()
          : allArgs[position - 1].getEnd();
        const opening = only ? ', { connector: ' : '), { connector: ';
        edits.push({
          start: call.getStart(),
          end: call.getStart(),
          text: 'connectable(',
        });
        if (operatorName === 'publish') {
          // The default connector (a plain subject) is the right one.
          edits.push({
            start: gapStart,
            end: call.getEnd(),
            text: only ? ')' : '))',
          });
        } else if (!connectorArgument) {
          // publishReplay(): unbounded replay.
          edits.push({
            start: gapStart,
            end: call.getEnd(),
            text: `${opening}() => replaySubject(Infinity) })`,
          });
          context.needsCore.add('replaySubject');
        } else {
          const isFactory =
            Node.isArrowFunction(connectorArgument) ||
            Node.isFunctionExpression(connectorArgument);
          const [head, tail] =
            operatorName === 'publishReplay'
              ? (['() => replaySubject(', ')'] as const)
              : operatorName === 'publishBehavior'
                ? (['() => behaviorSubject(', ')'] as const)
                : isFactory
                  ? (['', ''] as const)
                  : (['() => ', ''] as const);
          edits.push({
            start: gapStart,
            end: connectorArgument.getStart(),
            text: `${opening}${head}`,
          });
          const windowArgument = operatorArgs[1];
          if (operatorName === 'publishReplay' && windowArgument) {
            // publishReplay(count, windowTime) -> replaySubject(count, { windowMs })
            edits.push({
              start: connectorArgument.getEnd(),
              end: windowArgument.getStart(),
              text: ', { windowMs: ',
            });
            edits.push({
              start: windowArgument.getEnd(),
              end: call.getEnd(),
              text: ' }) })',
            });
          } else {
            edits.push({
              start: connectorArgument.getEnd(),
              end: call.getEnd(),
              text: `${tail} })`,
            });
          }
          if (operatorName === 'publishReplay') {
            context.needsCore.add('replaySubject');
          } else if (operatorName === 'publishBehavior') {
            context.needsCore.add('behaviorSubject');
          }
        }
        context.needsStream.add('connectable');
        removedCalls.add(argument);
      });
      continue;
    }

    // x.subscribe(next, error?, complete?)  ->  x.subscribe({ next, error, complete })
    if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === 'subscribe' &&
      args.length > 0 &&
      !Node.isObjectLiteralExpression(args[0])
    ) {
      const names = ['next', 'error', 'complete'];
      if (args.length > 3) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'subscribe(...) with more than three arguments.',
          'subscribe',
        );
        continue;
      }
      insertBefore(args[0], '{ next: ');
      for (let index = 1; index < args.length; index += 1) {
        edits.push({
          start: args[index - 1].getEnd(),
          end: args[index].getStart(),
          text: `, ${names[index]}: `,
        });
      }
      insertAfter(args[args.length - 1], ' }');
      continue;
    }

    // subject.asObservable() / behavior.getValue()
    if (Node.isPropertyAccessExpression(callee)) {
      const member = callee.getName();
      if (member === 'asObservable' && args.length === 0) {
        replace(callee.getNameNode(), 'asSubscribable');
        continue;
      }
      if (member === 'getValue' && args.length === 0) {
        edits.push({
          start: callee.getNameNode().getStart(),
          end: call.getEnd(),
          text: 'value',
        });
        continue;
      }
    }

    if (!Node.isIdentifier(callee) || !locals.has(callee.getText())) continue;
    const name = callee.getText();

    // A scheduler argument selects a scheduler craft does not have (there is
    // only the temporal runtime): drop it and judge the call without it.
    if ([...DROPPABLE_SCHEDULERS].some((scheduler) => locals.has(scheduler))) {
      const isScheduler = (argument: Node) =>
        Node.isIdentifier(argument) &&
        DROPPABLE_SCHEDULERS.has(argument.getText()) &&
        locals.has(argument.getText());
      allArgs.forEach((argument, position) => {
        if (!isScheduler(argument)) return;
        droppedSchedulers += 1;
        if (position > 0) {
          edits.push({
            start: allArgs[position - 1].getEnd(),
            end: argument.getEnd(),
            text: '',
          });
        } else if (allArgs.length > 1) {
          edits.push({
            start: argument.getStart(),
            end: allArgs[1].getStart(),
            text: '',
          });
        } else {
          edits.push({
            start: argument.getStart(),
            end: argument.getEnd(),
            text: '',
          });
        }
      });
      if (allArgs.some(isScheduler)) {
        args = allArgs.filter((argument) => !isScheduler(argument));
        for (const argument of allArgs.filter(isScheduler)) {
          const scheduler = argument.getText();
          if (noticed.has(scheduler)) continue;
          noticed.add(scheduler);
          notice(
            scheduler,
            scheduler === 'asyncScheduler'
              ? 'asyncScheduler arguments were dropped: craft timers go through the temporal runtime (virtual in tests).'
              : `${scheduler} arguments were dropped: craft has one scheduler, the temporal runtime, so the timing is now that clock's — this is a change of timing for ${scheduler}.`,
          );
        }
      }
    }

    if (RENAMED_STREAM.has(name)) {
      const target = RENAMED_STREAM.get(name) as string;
      if (name === 'debounceTime' && args.length !== 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'debounceTime(...) with a scheduler.',
          name,
        );
        continue;
      }
      if (
        name === 'throttleTime' &&
        !(
          args.length === 1 ||
          (args.length === 2 && Node.isObjectLiteralExpression(args[1]))
        )
      ) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'throttleTime(...) with a scheduler: only throttleTime(ms) and throttleTime(ms, { leading, trailing }) migrate.',
          name,
        );
        continue;
      }
      replace(callee, target);
      context.needsStream.add(target);
      continue;
    }

    if (name === 'from') {
      if (args.length !== 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'from(...) with a scheduler.',
          name,
        );
        continue;
      }
      const kind = classify(args[0], context);
      if (kind === 'wrap') {
        replace(callee, WRAP);
        context.needsStream.add(WRAP);
      } else if (Node.isArrayLiteralExpression(args[0])) {
        replace(callee, 'of');
        const array = args[0];
        // from([a, b]) -> of(a, b)
        edits.push({
          start: array.getStart(),
          end: array.getStart() + 1,
          text: '',
        });
        edits.push({
          start: array.getEnd() - 1,
          end: array.getEnd(),
          text: '',
        });
        context.needsStream.add('of');
      } else {
        // `from` decides at run time: a stream, a Subscribable, a Promise or an
        // iterable all work, so the call keeps its name.
        context.needsStream.add('from');
      }
      continue;
    }

    if (name === 'scheduled') {
      if (args.length !== 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'scheduled(...) migrates only as scheduled(input, scheduler).',
          name,
        );
        continue;
      }
      // scheduled(input, scheduler) -> from(input): the scheduler argument is
      // already dropped above.
      replace(callee, 'from');
      context.needsStream.add('from');
      continue;
    }

    if (name === 'generate') {
      if (args.length === 1 && Node.isObjectLiteralExpression(args[0])) {
        context.needsStream.add(name);
        continue;
      }
      if (args.length < 3 || args.length > 4) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'generate(...) migrates only as generate({ ... }) or generate(initial, condition, iterate, resultSelector?).',
          name,
        );
        continue;
      }
      // generate(initial, condition, iterate, selector?) -> generate({ initialState, ... })
      const keys = ['condition', 'iterate', 'resultSelector'];
      insertBefore(args[0], '{ initialState: ');
      for (let index = 1; index < args.length; index += 1) {
        edits.push({
          start: args[index - 1].getEnd(),
          end: args[index].getStart(),
          text: `, ${keys[index - 1]}: `,
        });
      }
      insertAfter(args[args.length - 1], ' }');
      context.needsStream.add(name);
      continue;
    }

    if (name === 'bindCallback' || name === 'bindNodeCallback') {
      if (args.length !== 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          `${name}(fn, resultSelector) is not migrated automatically: map the result in a pipe.`,
          name,
        );
        continue;
      }
      context.needsStream.add(name);
      continue;
    }

    if (name === 'repeat') {
      if (args.length === 0) {
        context.needsStream.add('repeat');
      } else if (
        args.length === 1 &&
        !Node.isObjectLiteralExpression(args[0])
      ) {
        // rxjs `repeat(count)` counts TOTAL subscriptions; craft's `times` counts EXTRA runs.
        insertBefore(args[0], '{ times: ');
        insertAfter(args[0], ' - 1 }');
        context.needsStream.add('repeat');
      } else {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'repeat({ count, delay }) is not migrated automatically.',
          name,
        );
      }
      continue;
    }

    if (name === 'shareReplay') {
      if (args.length === 1 && Node.isObjectLiteralExpression(args[0])) {
        const object = args[0];
        const size = object.getProperty('bufferSize');
        const refCount = object.getProperty('refCount');
        const text = (property: Node | undefined, fallback: string) =>
          property && Node.isPropertyAssignment(property)
            ? (property.getInitializer()?.getText() ?? fallback)
            : fallback;
        const unsupported = object
          .getProperties()
          .some(
            (property) =>
              !Node.isPropertyAssignment(property) ||
              !['bufferSize', 'refCount'].includes(property.getName()),
          );
        if (unsupported) {
          block(
            'RXJS_CALL_FORM_UNSUPPORTED',
            'shareReplay({ ... }) with options other than bufferSize/refCount.',
            name,
          );
          continue;
        }
        replace(
          object,
          `${text(size, '1')}, { resetOnRefCountZero: ${text(refCount, 'false')} }`,
        );
      } else if (args.length > 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'shareReplay(bufferSize, windowTime, scheduler).',
          name,
        );
        continue;
      }
      context.needsStream.add('shareReplay');
      continue;
    }

    if (name === 'combineLatest') {
      if (
        args.length !== 1 ||
        !(
          Node.isArrayLiteralExpression(args[0]) ||
          Node.isObjectLiteralExpression(args[0])
        )
      ) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'combineLatest(...) migrates only with one array or object literal argument.',
          name,
        );
        continue;
      }
      const container = args[0];
      const members = Node.isArrayLiteralExpression(container)
        ? container.getElements()
        : container
            .getProperties()
            .map((property) =>
              Node.isPropertyAssignment(property)
                ? property.getInitializer()
                : undefined,
            );
      if (members.some((member) => !member)) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'combineLatest({ ... }) with shorthand or spread members.',
          name,
        );
        continue;
      }
      for (const member of members) asStream(member as Expression, name);
      context.needsStream.add(name);
      continue;
    }

    if (
      name === 'merge' ||
      name === 'zip' ||
      name === 'race' ||
      name === 'concat' ||
      name === 'concatWith' ||
      name === 'mergeWith' ||
      name === 'combineLatestWith' ||
      name === 'zipWith' ||
      name === 'raceWith'
    ) {
      for (const argument of args) asStream(argument, name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'forkJoin') {
      const container = args[0];
      if (
        args.length !== 1 ||
        !(
          Node.isArrayLiteralExpression(container) ||
          Node.isObjectLiteralExpression(container)
        )
      ) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'forkJoin(...) migrates only with one array or object literal argument.',
          name,
        );
        continue;
      }
      const members = Node.isArrayLiteralExpression(container)
        ? container.getElements()
        : container
            .getProperties()
            .map((property) =>
              Node.isPropertyAssignment(property)
                ? property.getInitializer()
                : undefined,
            );
      if (members.some((member) => !member)) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'forkJoin({ ... }) with shorthand or spread members.',
          name,
        );
        continue;
      }
      for (const member of members) asStream(member as Expression, name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'iif') {
      if (args.length < 2 || args.length > 3) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'iif(...) migrates only with a condition and one or two streams.',
          name,
        );
        continue;
      }
      for (const argument of args.slice(1)) asStream(argument, name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'partition') {
      if (args.length !== 2) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'partition(...) with a thisArg, or the operator form.',
          name,
        );
        continue;
      }
      asStream(args[0], name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'withLatestFrom') {
      if (args.length !== 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'withLatestFrom(...) with several sources.',
          name,
        );
        continue;
      }
      asStream(args[0], name);
      context.needsStream.add(name);
      continue;
    }

    if (
      name === 'buffer' ||
      name === 'sample' ||
      name === 'window' ||
      name === 'connectable'
    ) {
      if (args.length === 1) asStream(args[0], name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'catchError') {
      const handler = args[0];
      const body =
        args.length === 1 &&
        (Node.isArrowFunction(handler) || Node.isFunctionExpression(handler))
          ? handler.getBody()
          : undefined;
      if (!body || Node.isBlock(body)) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'catchError migrates only with an arrow handler whose body is one expression (the fallback stream).',
          name,
        );
        continue;
      }
      asStream(body, name);
      replace(callee, 'orElse');
      context.needsStream.add('orElse');
      if (!noticed.has('catchError')) {
        noticed.add('catchError');
        notice(
          'catchError',
          'catchError became orElse: it continues with the fallback on a TYPED exception of a craft stream; defects (`error`) are not caught. Prefer `catchTag` / `catchTag.exhaustive` so the handler is typed per exception.',
        );
      }
      continue;
    }

    if (name === 'bufferWhen') {
      const handler = args[0];
      const body =
        args.length === 1 &&
        (Node.isArrowFunction(handler) || Node.isFunctionExpression(handler))
          ? handler.getBody()
          : undefined;
      if (!body || Node.isBlock(body)) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'bufferWhen migrates only with an arrow whose body is one expression (the closing stream).',
          name,
        );
        continue;
      }
      asStream(body, name);
      context.needsStream.add(name);
      continue;
    }

    if (name === 'first' || name === 'last' || name === 'distinct') {
      if (args.length > 1) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          `${name}(...) with a default value or flush stream is not migrated automatically (use defaultIfEmpty).`,
          name,
        );
        continue;
      }
      context.needsStream.add(name);
      continue;
    }

    if (name === 'reduce') {
      if (args.length !== 2) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          'reduce(reducer) without a seed is not migrated automatically.',
          name,
        );
        continue;
      }
      context.needsStream.add(name);
      continue;
    }

    if (name === 'mergeMap' || name === 'mergeAll') {
      // rxjs: `mergeMap(project, concurrent)` / `mergeAll(concurrent)`; craft
      // takes an options object.
      const concurrencyArgument = name === 'mergeMap' ? args[1] : args[0];
      const maximum = name === 'mergeMap' ? 2 : 1;
      if (args.length > maximum) {
        block(
          'RXJS_CALL_FORM_UNSUPPORTED',
          `${name}(...) with a result selector.`,
          name,
        );
        continue;
      }
      if (
        concurrencyArgument &&
        !Node.isObjectLiteralExpression(concurrencyArgument)
      ) {
        insertBefore(concurrencyArgument, '{ concurrency: ');
        insertAfter(concurrencyArgument, ' }');
      }
      context.needsStream.add(name);
      continue;
    }

    if (name === 'firstValueFrom' || name === 'lastValueFrom') {
      context.needsCore.add(name);
      continue;
    }

    if (name === 'retry' && !noticed.has('retry')) {
      noticed.add('retry');
      notice(
        'retry',
        'retry now re-runs the stream on typed exceptions (the `while` filter takes exception tags); defects are never retried.',
      );
    }
    if (name === 'timeout' && !noticed.has('timeout')) {
      noticed.add('timeout');
      notice(
        'timeout',
        'timeout now raises a typed `StreamTimeout` exception (catch it with catchTag) instead of an rxjs TimeoutError defect.',
      );
    }
    if (
      (name === 'materialize' || name === 'dematerialize') &&
      !noticed.has('materialize')
    ) {
      noticed.add('materialize');
      notice(
        'materialize',
        'materialize emits `{ kind: "N" | "E" | "C" }` notifications like rxjs, plus `{ kind: "X", exception }` for a typed exception; `"E"` carries a defect. A typed exception no longer ends the stream — it becomes an `"X"` value.',
      );
    }
    if (
      (name === 'observeOn' || name === 'subscribeOn') &&
      !noticed.has('observeOn')
    ) {
      noticed.add('observeOn');
      notice(
        name,
        `${name} now hops onto the temporal runtime (default: the next turn of the clock, virtual in tests); its scheduler argument is gone.`,
      );
    }
    if (name === 'zip' && !noticed.has('zip')) {
      noticed.add('zip');
      notice(
        'zip',
        'zip buffers the faster inputs without bound — inherent to zip.',
      );
    }

    if (SAME_NAME_STREAM.has(name)) {
      context.needsStream.add(name);
    }
  }

  // new Subject() / new BehaviorSubject(x) / new ReplaySubject(n)
  for (const expression of sourceFile.getDescendantsOfKind(
    SyntaxKind.NewExpression,
  )) {
    const callee = expression.getExpression();
    const factory = SUBJECT_FACTORIES.get(callee.getText());
    if (!factory || !locals.has(callee.getText())) continue;
    // Already rebuilt as text by a mid-pipe publish-family rewrite.
    if (
      expression
        .getAncestors()
        .some((ancestor) => rebuiltCalls.has(ancestor)) ||
      rebuiltRanges.some(
        ([from, to]) =>
          expression.getStart() >= from && expression.getStart() < to,
      )
    ) {
      continue;
    }
    edits.push({
      start: expression.getStart(),
      end: callee.getEnd(),
      text: factory,
    });
    context.needsCore.add(factory);
  }

  // EMPTY  ->  empty()
  for (const identifier of sourceFile.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    const text = identifier.getText();
    if ((text !== 'EMPTY' && text !== 'NEVER') || !locals.has(text)) continue;
    if (Node.isImportSpecifier(identifier.getParent())) continue;
    const replacement = text === 'EMPTY' ? 'empty' : 'never';
    replace(identifier, `${replacement}()`);
    context.needsStream.add(replacement);
  }

  // isObservable -> isObservableLike, Observer -> StreamObserver, … (core).
  for (const identifier of sourceFile.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    const text = identifier.getText();
    const renamed = CORE_RENAMES.get(text);
    if (!renamed || !locals.has(text)) continue;
    const parent = identifier.getParent();
    if (Node.isImportSpecifier(parent)) continue;
    if (
      Node.isPropertyAccessExpression(parent) &&
      parent.getNameNode() === identifier
    ) {
      continue;
    }
    if (renamed !== text) replace(identifier, renamed);
    context.needsCore.add(renamed);
  }

  // `ajax`, `AjaxError`, `AjaxResponse`… move over unchanged: import whatever
  // the file actually references (as a call, a receiver, a type or `instanceof`).
  for (const passthrough of PASSTHROUGH_NAMES) {
    if (!locals.has(passthrough)) continue;
    const referenced = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some(
        (identifier) =>
          identifier.getText() === passthrough &&
          !Node.isImportSpecifier(identifier.getParent()),
      );
    if (referenced) context.needsStream.add(passthrough);
  }
  if (locals.has('ajax') && context.needsStream.has('ajax')) {
    notice(
      'ajax',
      'ajax now goes through fetch: `AjaxResponse` keeps `status`, `response`, `responseType`, `responseHeaders` and `request`, but not `xhr` or progress events; an HTTP error status is still an `AjaxError` defect. Application HTTP belongs to `query` / `mutation` / server functions.',
    );
  }

  // Every use of a dropped scheduler must have been a call argument.
  const schedulerUses = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(
      (identifier) =>
        DROPPABLE_SCHEDULERS.has(identifier.getText()) &&
        locals.has(identifier.getText()) &&
        !Node.isImportSpecifier(identifier.getParent()),
    );
  if (schedulerUses.length !== droppedSchedulers) {
    block(
      'RXJS_CALL_FORM_UNSUPPORTED',
      `${schedulerUses[0]?.getText() ?? 'A scheduler'} is used somewhere other than as a scheduler argument of a migrated call.`,
      schedulerUses[0]?.getText(),
    );
  }

  // Type references.
  for (const reference of sourceFile.getDescendantsOfKind(
    SyntaxKind.TypeReference,
  )) {
    const typeName = reference.getTypeName().getText();
    if (!locals.has(typeName)) continue;
    const identifier = reference.getTypeName();
    if (typeName === 'Observable') {
      const owner = reference.getParent();
      const declaration =
        owner &&
        (Node.isVariableDeclaration(owner) || Node.isPropertyDeclaration(owner))
          ? owner
          : undefined;
      const annotated = declaration?.getTypeNode() === reference;
      const initializer = declaration?.getInitializer();
      if (declaration && annotated && initializer) {
        if (classify(initializer, context) === 'stream') {
          // The annotation would pin `Y = never` and hide the dependencies and
          // exceptions the pipeline accumulates: let inference carry them.
          const typeNode = reference;
          const anchor = Node.isPropertyDeclaration(declaration)
            ? (declaration.getQuestionTokenNode() ??
              declaration.getExclamationTokenNode() ??
              declaration.getNameNode())
            : (declaration.getExclamationTokenNode() ??
              declaration.getNameNode());
          edits.push({
            start: anchor.getEnd(),
            end: typeNode.getEnd(),
            text: '',
          });
          continue;
        }
      }
      replace(identifier, 'Subscribable');
      context.needsCore.add('Subscribable');
    } else if (RENAMED_TYPES.has(typeName)) {
      const renamed = RENAMED_TYPES.get(typeName) as string;
      replace(identifier, renamed);
      context.needsStream.add(renamed);
    } else if (typeName === 'Subscription') {
      replace(identifier, 'Unsubscribable');
      context.needsCore.add('Unsubscribable');
    } else if (typeName === 'ReplaySubject') {
      replace(identifier, 'Subject');
      context.needsCore.add('Subject');
    } else if (typeName === 'Subject' || typeName === 'BehaviorSubject') {
      context.needsCore.add(typeName);
    }
  }
}

/** `new Subject<T>(args)` as its core factory call, `subject<T>(args)`. */
function subjectConstruction(
  expression: Node,
  context: FileContext,
): string | undefined {
  if (!Node.isNewExpression(expression)) return undefined;
  const constructorName = expression.getExpression().getText();
  const factory = SUBJECT_FACTORIES.get(constructorName);
  if (!factory || !context.locals.has(constructorName)) return undefined;
  context.needsCore.add(factory);
  const typeArguments = expression
    .getTypeArguments()
    .map((typeArgument) => typeArgument.getText());
  const generics = typeArguments.length ? `<${typeArguments.join(', ')}>` : '';
  const argumentsText = expression
    .getArguments()
    .map((argument) => argument.getText())
    .join(', ');
  return `${factory}${generics}(${argumentsText})`;
}

/**
 * The `, { connector: ... }` option of the `connectable(...)` that replaces a
 * publish-family operator, built from the operator's arguments' TEXT — used
 * where the arguments cannot stay in place. `undefined` when an argument is not
 * something the text can be rebuilt from.
 */
function connectorTextFor(
  operatorName: string,
  operatorArgs: readonly Node[],
  context: FileContext,
): string | undefined {
  if (operatorName === 'publish') return '';
  const connector = (body: string) => `, { connector: () => ${body} }`;

  if (operatorName === 'publishReplay') {
    context.needsCore.add('replaySubject');
    if (operatorArgs.length === 0) return connector('replaySubject(Infinity)');
    if (operatorArgs.length === 1) {
      return connector(`replaySubject(${operatorArgs[0].getText()})`);
    }
    return connector(
      `replaySubject(${operatorArgs[0].getText()}, { windowMs: ${operatorArgs[1].getText()} })`,
    );
  }

  if (operatorName === 'publishBehavior') {
    context.needsCore.add('behaviorSubject');
    return connector(`behaviorSubject(${operatorArgs[0].getText()})`);
  }

  // multicast(subject) or multicast(() => subject)
  const argument = operatorArgs[0];
  const direct = subjectConstruction(argument, context);
  if (direct) return connector(direct);
  if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument)) {
    const body = argument.getBody();
    const built = Node.isBlock(body)
      ? undefined
      : subjectConstruction(body, context);
    if (built) return connector(built);
  }
  return undefined;
}

function applyEdits(context: FileContext): void {
  const { sourceFile, edits } = context;
  const original = sourceFile.getFullText();

  // Right to left, so earlier offsets stay valid. At one offset the edit that
  // covers the longest range goes first (a replacement before an insertion at
  // its start), and insertions then land in front of its text; two insertions
  // at one offset keep their order, the later one ending up outermost.
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let text = original;
  for (const edit of ordered) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  sourceFile.replaceWithText(text);

  // Imports. The new ones take the place of the first rxjs import; nothing
  // else in the import block is reordered or reprinted, so the diff of a
  // migrated file only shows what the migration changed.
  const declarations = sourceFile.getImportDeclarations();
  const rxjsDeclarations = rxjsImports(sourceFile);
  const anchor = Math.max(
    0,
    declarations.findIndex((declaration) =>
      rxjsDeclarations.includes(declaration),
    ),
  );
  for (const declaration of rxjsDeclarations) declaration.remove();
  let position = anchor;
  position += addNamedImports(
    sourceFile,
    '@craft-ts/stream',
    context.needsStream,
    position,
  );
  addNamedImports(sourceFile, '@craft-ts/core', context.needsCore, position);
}

/**
 * Adds `names` to the module's value import — reusing one that is already
 * there — or inserts a new declaration at `position`. Returns how many
 * declarations it inserted.
 */
function addNamedImports(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  names: ReadonlySet<string>,
  position: number,
): number {
  if (names.size === 0) return 0;
  const declaration = sourceFile
    .getImportDeclarations()
    .find(
      (candidate) =>
        candidate.getModuleSpecifierValue() === moduleSpecifier &&
        !candidate.isTypeOnly() &&
        !candidate.getNamespaceImport(),
    );
  if (!declaration) {
    sourceFile.insertImportDeclaration(position, {
      moduleSpecifier,
      namedImports: [...names].sort(),
    });
    return 1;
  }
  const existing = new Set(
    declaration.getNamedImports().map((item) => item.getName()),
  );
  declaration.addNamedImports(
    [...names].filter((name) => !existing.has(name)).sort(),
  );
  return 0;
}

// --- plumbing --------------------------------------------------------------

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

async function runEslint(files: readonly string[], rootDir: string) {
  try {
    await execFileAsync('npx', ['eslint', '--fix', ...files], { cwd: rootDir });
  } catch {
    // Lint findings are not migration failures.
  }
}

function logSummary(
  result: MigrateStreamsResult,
  log: (message: string) => void,
  wrote: boolean,
): void {
  const manual = result.diagnostics.filter((item) => item.manual).length;
  log(
    `${wrote ? 'Migrated' : 'Would migrate'} ${result.changedFiles.length} file(s); ${manual} blocking diagnostic(s), ${result.diagnostics.length - manual} review notice(s); ${result.remainingRxjsImports} file(s) still import rxjs.`,
  );
  for (const diagnostic of result.diagnostics) {
    log(
      `[${diagnostic.code}${diagnostic.manual ? '' : ' · review'}] ${diagnostic.filePath}: ${diagnostic.message}`,
    );
  }
}
