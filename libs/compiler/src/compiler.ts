import ts from 'typescript';
import MagicString from 'magic-string';

export interface ComponentCompilation {
  component: string;
  status: 'compiled' | 'fallback';
  reason?: string;
  nodes?: number;
  bindings?: number;
  events?: number;
  holes?: number;
}
export interface CompilationResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
  components: ComponentCompilation[];
  optimizedLists: number;
}

// Deliberately excludes native elements with special mounting semantics:
// dialog, select, form controls, SVG, raw HTML and structural nodes.
const tags = new Set([
  'div',
  'span',
  'p',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  'strong',
  'em',
  'small',
  'b',
  'i',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'button',
  'label',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
// The renderer's event names (EVENT_NAMES in the interpreter).
const events = new Set([
  'abort',
  'blur',
  'change',
  'click',
  'contextmenu',
  'dblclick',
  'error',
  'focus',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'paste',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerup',
  'reset',
  'scroll',
  'submit',
  'touchend',
  'touchmove',
  'touchstart',
]);
const eventName = (key: string): string | undefined =>
  events.has(key)
    ? key
    : /^on[A-Z]/.test(key) && events.has(key[2].toLowerCase() + key.slice(3))
      ? key[2].toLowerCase() + key.slice(3)
      : undefined;
const q = JSON.stringify;
const unwrap = (n: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(n) ||
  ts.isAsExpression(n) ||
  ts.isNonNullExpression(n) ||
  ts.isSatisfiesExpression(n)
    ? unwrap(n.expression)
    : n;
const fail = (message: string): never => {
  throw new Error(message);
};

/** Pure module transform: no project type checking, module evaluation or application imports. */
export function compileModule(
  source: string,
  filename = 'component.ts',
  options: {
    lists?: boolean;
    dom?: 'create' | 'clone';
    lean?: boolean;
    lower?: boolean;
  } = {},
): CompilationResult {
  const ast = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const output = new MagicString(source);
  const components: ComponentCompilation[] = [];
  const helpers = new Map<string, string>();
  const helperDeclarations = new Map<string, ts.Identifier>();
  let componentHelper: string | undefined;
  let forHelper: string | undefined;
  let componentImport: ts.Identifier | undefined;
  let forImport: ts.Identifier | undefined;
  const attachedNames = new Set<string>();
  const compiledDefinitions = new Map<ts.Symbol, ts.VariableDeclaration>();
  let optimizedLists = 0;
  for (const statement of ast.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@craft-ts/component' ||
      statement.importClause?.isTypeOnly
    )
      continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const item of named.elements) {
      if (item.isTypeOnly) continue;
      const name = (item.propertyName ?? item.name).text;
      if (name === 'craftComponent') {
        componentHelper = item.name.text;
        componentImport = item.name;
      }
      if (name === 'forNode') {
        forHelper = item.name.text;
        forImport = item.name;
      }
      if (tags.has(name)) {
        helpers.set(item.name.text, name);
        helperDeclarations.set(item.name.text, item.name);
      }
    }
  }
  // Bind symbols in this single virtual module. No module resolution, lib
  // loading, filesystem access or project type checking is performed. This
  // handles var hoisting, catch/loop bindings and nested lexical shadows.
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === filename ? ast : undefined),
    getDefaultLibFileName: () => '',
    writeFile: () => {
      throw new Error('The compiler does not emit through its virtual host.');
    },
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    fileExists: (name) => name === filename,
    readFile: (name) => (name === filename ? source : undefined),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const checker = ts
    .createProgram(
      [filename],
      {
        noLib: true,
        noResolve: true,
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
      },
      host,
    )
    .getTypeChecker();
  const sameBinding = (reference: ts.Node, declaration: ts.Node | undefined) =>
    !!declaration &&
    checker.getSymbolAtLocation(reference) !== undefined &&
    checker.getSymbolAtLocation(reference) ===
      checker.getSymbolAtLocation(declaration);
  for (const statement of ast.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@craft-ts/component/compiler-runtime'
    ) {
      const named = statement.importClause?.namedBindings;
      if (named && ts.isNamedImports(named))
        for (const item of named.elements) {
          if ((item.propertyName ?? item.name).text === 'ɵwithCompiledTemplate')
            attachedNames.add(item.name.text);
        }
    }
  }
  let serial = 0;
  const fresh = (prefix: string) => {
    let name: string;
    do {
      name = `__craft_${prefix}_${serial++}`;
    } while (source.includes(name));
    return name;
  };
  const attach = fresh('compiled');
  const attachItem = fresh('item');
  const text = (node: ts.Node) => source.slice(node.getStart(ast), node.end);
  // Code copied into a plan is read from the transformed module once every
  // pass is done: a list callback inside it keeps its own compilation.
  const ranges: [number, number][] = [];
  const code = (node: ts.Node) =>
    `\uE000${ranges.push([node.getStart(ast), node.end]) - 1}\uE000`;
  const resolveCode = (plan: string) =>
    plan.replace(/\uE000(\d+)\uE000/g, (_, index: string) =>
      output.slice(...ranges[Number(index)]),
    );
  const lowerRead = fresh('y');
  const lowerService = fresh('ys');
  let servicesLowered = 0;
  let lowered = 0;
  /**
   * A binding generator as a plain function: each `yield* x` of its own body
   * becomes `ɵy(x)`, which hands a settled read back at once and drives
   * anything else like the generator did. Undefined when the shape is not
   * one where both behave the same: a bare `yield`, a `yield*` under `try`
   * (a driver error is not thrown into the generator), or a parameter list.
   */
  function lower(
    fn: ts.FunctionExpression,
    inputName: string | undefined,
  ): string | undefined {
    if (!fn.asteriskToken || fn.parameters.length || fn.name) return undefined;
    const yields: ts.YieldExpression[] = [];
    let refused = false;
    const visit = (n: ts.Node, underTry: boolean): void => {
      if (refused) return;
      if (ts.isFunctionLike(n) && n !== fn) return;
      if (ts.isYieldExpression(n)) {
        if (!n.asteriskToken || !n.expression || underTry) {
          refused = true;
          return;
        }
        yields.push(n);
      }
      ts.forEachChild(n, (child) =>
        visit(child, underTry || ts.isTryStatement(n)),
      );
    };
    visit(fn.body, false);
    if (refused || !yields.length) return undefined;
    const emit = (start: number, end: number): string => {
      let out = '';
      let cursor = start;
      for (const y of yields) {
        const from = y.getStart(ast);
        if (from < cursor || y.end > end) continue;
        out += source.slice(cursor, from);
        const operand = unwrap(y.expression!);
        if (
          ts.isCallExpression(operand) &&
          !operand.arguments.length &&
          !operand.questionDotToken &&
          ts.isPropertyAccessExpression(operand.expression) &&
          !operand.expression.questionDotToken &&
          ts.isIdentifier(operand.expression.expression) &&
          operand.expression.expression.text !== inputName &&
          ts.isIdentifier(operand.expression.name)
        ) {
          // `yield* Service.member()`: read the member, or call it as before.
          servicesLowered++;
          out += `(${lowerService}(${operand.expression.expression.text}, ${q(operand.expression.name.text)}))`;
        } else
          out += `(${lowerRead}(${emit(y.expression!.getStart(ast), y.expression!.end)}))`;
        cursor = y.end;
      }
      return out + source.slice(cursor, end);
    };
    lowered++;
    return `function () ${emit(fn.body.getStart(ast), fn.body.end)}`;
  }
  function compile(call: ts.CallExpression): string {
    if (call.arguments.length !== 3 || !ts.isStringLiteral(call.arguments[0]))
      fail('requires the three-argument component declaration');
    const meta = unwrap(call.arguments[1]);
    if (!ts.isObjectLiteralExpression(meta) || meta.properties.length)
      fail('component metadata requires the generic renderer');
    const template = unwrap(call.arguments[2]);
    if (
      (!ts.isArrowFunction(template) && !ts.isFunctionExpression(template)) ||
      template.asteriskToken ||
      template.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    )
      fail('requires a synchronous direct template');
    const fn = template as ts.ArrowFunction | ts.FunctionExpression;
    if (fn.typeParameters?.length)
      fail('generic template functions require the generic renderer');
    if (
      fn.parameters.length > 1 ||
      fn.parameters.some(
        (p) =>
          !ts.isIdentifier(p.name) ||
          p.name.text === 'this' ||
          p.initializer ||
          p.dotDotDotToken,
      )
    )
      fail('requires one simple input parameter');
    const input = fn.parameters[0] && text(fn.parameters[0].name);
    if (!sameBinding(call.expression, componentImport))
      fail('a Craft import is shadowed');
    if (ts.isFunctionExpression(fn) && fn.name)
      fail('named template functions require the generic renderer');
    function checkContext(n: ts.Node): void {
      if (
        n.kind === ts.SyntaxKind.ThisKeyword ||
        n.kind === ts.SyntaxKind.SuperKeyword ||
        ts.isMetaProperty(n) ||
        (ts.isIdentifier(n) && (n.text === 'arguments' || n.text === 'eval'))
      )
        fail('reflective or receiver-dependent template');
      ts.forEachChild(n, checkContext);
    }
    checkContext(fn);
    let root: ts.Expression;
    // Light instances run the template's setup once, where the generic
    // renderer runs the template once: only declarations precede the return.
    const setup: string[] = [];
    if (ts.isBlock(fn.body)) {
      const statements = fn.body.statements;
      const last = statements[statements.length - 1];
      if (
        !last ||
        !ts.isReturnStatement(last) ||
        !last.expression ||
        (statements.length > 1 &&
          (!options.lean ||
            statements
              .slice(0, -1)
              .some((statement) => !ts.isVariableStatement(statement))))
      )
        throw new Error(
          'template setup statements require the generic renderer',
        );
      for (const statement of statements.slice(0, -1))
        setup.push(code(statement));
      root = last.expression;
    } else root = fn.body;
    const renderer = fresh('renderer'),
      nodes = fresh('nodes');
    const creation: string[] = [`const ${nodes}: Node[] = [];`];
    const elements: { slot: number; path: number[]; name?: string }[] = [];
    const bindings: {
      slot: number;
      key?: string;
      lowered?: boolean;
      path: number[];
      indirect?: boolean;
      input?: string;
    }[] = [];
    const readers: string[] = [];
    const eventReaders: string[] = [];
    const eventPlans: {
      slot: number;
      event: string;
      tag: string;
      name?: string;
    }[] = [];
    const holeReaders: string[] = [];
    const holePlans: { parent: number; before: number; path: number[] }[] = [];
    // Children of each element in order: a slot, or a hole by its index.
    const childOrder = new Map<
      number,
      ({ slot: number } | { hole: number })[]
    >();
    const ordered = (parent: number) => {
      let list = childOrder.get(parent);
      if (!list) childOrder.set(parent, (list = []));
      return list;
    };
    const locateRoot = fresh('root');
    const locations: string[] = [];
    const lastChild = new Map<number, number>();
    let count = 0;
    function literal(n: ts.Expression): string | undefined {
      n = unwrap(n);
      if (ts.isStringLiteralLike(n)) return n.text;
      if (ts.isNumericLiteral(n)) return String(Number(n.text));
      if (
        ts.isPrefixUnaryExpression(n) &&
        n.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(n.operand)
      )
        return String(-Number(n.operand.text));
      return undefined;
    }
    function binding(
      n: ts.Expression,
      slot: number,
      path: number[],
      key?: string,
    ) {
      n = unwrap(n);
      const indirect =
        ts.isPropertyAccessExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === input;
      if (
        options.lean &&
        key !== undefined &&
        !ts.isArrowFunction(n) &&
        !ts.isFunctionExpression(n)
      ) {
        // Evaluated once, where the generic template evaluates it once:
        // a reader, or the value itself.
        readers.push(`(${code(n)})`);
        bindings.push({ slot, path, key });
        return;
      }
      if (!indirect && !ts.isArrowFunction(n) && !ts.isFunctionExpression(n))
        fail('binding requires a function literal or direct input');
      if (
        !indirect &&
        (n as ts.ArrowFunction).modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
        )
      )
        fail('async binding');
      const plain =
        options.lean && options.lower !== false && ts.isFunctionExpression(n)
          ? lower(n, input)
          : undefined;
      readers.push(
        indirect ? `() => (${code(n)})` : plain !== undefined ? plain : code(n),
      );
      bindings.push({
        slot,
        path,
        ...(key ? { key } : {}),
        ...(plain !== undefined ? { lowered: true } : {}),
        ...(indirect
          ? {
              indirect: true,
              input: (n as ts.PropertyAccessExpression).name.text,
            }
          : {}),
      });
    }
    function tree(
      expression: ts.Expression,
      parent: number | undefined,
      path: number[],
    ): number {
      const n = unwrap(expression);
      if (
        n.kind === ts.SyntaxKind.NullKeyword ||
        n.kind === ts.SyntaxKind.FalseKeyword
      )
        return 0;
      if (ts.isArrayLiteralExpression(n)) {
        let children = 0;
        for (const child of n.elements)
          children += tree(child, parent, [
            ...path.slice(0, -1),
            path[path.length - 1] + children,
          ]);
        return children;
      }
      const isTag =
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        helpers.has(n.expression.text) &&
        sameBinding(n.expression, helperDeclarations.get(n.expression.text));
      const isText =
        literal(n) !== undefined ||
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        (ts.isPropertyAccessExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === input);
      if (!isTag && !isText && parent !== undefined && options.lean) {
        // Anything else is rendered by the generic renderer at its place.
        holeReaders.push(`(${code(n)})`);
        holePlans.push({ parent, before: -1, path });
        ordered(parent).push({ hole: holePlans.length - 1 });
        return 1;
      }
      const slot = count++;
      if (parent !== undefined) ordered(parent).push({ slot });
      const previous = parent === undefined ? undefined : lastChild.get(parent);
      locations.push(
        `${nodes}[${slot}] = ${parent === undefined ? locateRoot : previous === undefined ? `${nodes}[${parent}].firstChild!` : `${nodes}[${previous}].nextSibling!`};`,
      );
      if (parent !== undefined) lastChild.set(parent, slot);
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        helpers.has(n.expression.text) &&
        sameBinding(n.expression, helperDeclarations.get(n.expression.text))
      ) {
        const tag =
          helpers.get(n.expression.text) ?? fail('unknown DOM helper');
        const args = [...n.arguments];
        let name: string | undefined;
        if (
          args.length >= 2 &&
          ts.isStringLiteral(args[0]) &&
          (ts.isObjectLiteralExpression(unwrap(args[1])) ||
            args[1].kind === ts.SyntaxKind.NullKeyword)
        )
          name = (args.shift() as ts.StringLiteral).text;
        let props: ts.ObjectLiteralExpression | undefined;
        if (args[0] && ts.isObjectLiteralExpression(unwrap(args[0]))) {
          props = unwrap(args[0]) as ts.ObjectLiteralExpression;
          args.shift();
        } else if (
          args.length === 2 &&
          args[0].kind === ts.SyntaxKind.NullKeyword
        )
          args.shift();
        if (args.length > 1) fail('unsupported tag helper overload');
        creation.push(
          `${nodes}[${slot}] = ${renderer}.createElement(${q(tag)});`,
        );
        elements.push({ slot, path, ...(name !== undefined ? { name } : {}) });
        const propertyKeys = new Set<string>();
        for (const prop of props?.properties ?? []) {
          const propName =
            prop.name &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
              ? prop.name.text
              : undefined;
          const event =
            propName !== undefined ? eventName(propName) : undefined;
          if (options.lean && event !== undefined) {
            if (propertyKeys.has(propName!)) fail('duplicate DOM properties');
            propertyKeys.add(propName!);
            if (ts.isMethodDeclaration(prop)) {
              if (prop.typeParameters?.length || prop.modifiers?.length)
                fail('unsupported event method');
              eventReaders.push(
                `function${prop.asteriskToken ? '*' : ''} (${prop.parameters.map(code).join(', ')}) ${code(prop.body ?? fail('event method without body'))}`,
              );
            } else if (ts.isPropertyAssignment(prop))
              eventReaders.push(`(${code(prop.initializer)})`);
            else if (ts.isShorthandPropertyAssignment(prop))
              eventReaders.push(`(${prop.name.text})`);
            else fail('unsupported event property');
            eventPlans.push({
              slot,
              event,
              tag,
              ...(name !== undefined ? { name } : {}),
            });
            continue;
          }
          if (
            !ts.isPropertyAssignment(prop) ||
            (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name))
          ) {
            throw new Error(
              'spread, computed or method properties require the generic renderer',
            );
          }
          const key = prop.name.text;
          if (propertyKeys.has(key)) fail('duplicate DOM properties');
          propertyKeys.add(key);
          if (
            !(
              ['id', 'title', 'role', 'class', 'type'].includes(key) ||
              key.startsWith('data-') ||
              key.startsWith('aria-')
            ) ||
            key.startsWith('data-craft-')
          )
            fail(`unsupported DOM property: ${key}`);
          const value = unwrap(prop.initializer),
            constant = literal(value);
          if (
            key === 'class' &&
            (constant !== undefined ||
              [
                ts.SyntaxKind.NullKeyword,
                ts.SyntaxKind.FalseKeyword,
                ts.SyntaxKind.TrueKeyword,
              ].includes(value.kind))
          ) {
            const classValue =
              constant ??
              (value.kind === ts.SyntaxKind.NullKeyword
                ? ''
                : value.kind === ts.SyntaxKind.TrueKeyword
                  ? 'true'
                  : 'false');
            if (classValue)
              creation.push(
                `${renderer}.setAttribute(${nodes}[${slot}] as Element, 'class', ${q(classValue)});`,
              );
          } else if (constant !== undefined)
            creation.push(
              `${renderer}.setAttribute(${nodes}[${slot}] as Element, ${q(key)}, ${q(constant)});`,
            );
          else if (
            [
              ts.SyntaxKind.NullKeyword,
              ts.SyntaxKind.FalseKeyword,
              ts.SyntaxKind.TrueKeyword,
            ].includes(value.kind)
          ) {
            if (
              key.startsWith('aria-') &&
              value.kind !== ts.SyntaxKind.NullKeyword
            )
              creation.push(
                `${renderer}.setAttribute(${nodes}[${slot}] as Element, ${q(key)}, ${q(value.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false')});`,
              );
            else if (value.kind === ts.SyntaxKind.TrueKeyword)
              creation.push(
                `${renderer}.setAttribute(${nodes}[${slot}] as Element, ${q(key)}, '');`,
              );
          } else binding(value, slot, path, key);
        }
        if (name !== undefined)
          creation.push(
            `${renderer}.setAttribute(${nodes}[${slot}] as Element, 'data-craft-name', ${q(name)});`,
          );
        if (parent !== undefined)
          creation.push(
            `${renderer}.appendChild(${nodes}[${parent}], ${nodes}[${slot}]);`,
          );
        if (
          args[0] &&
          !props &&
          n.arguments.length === 1 &&
          !ts.isCallExpression(unwrap(args[0])) &&
          !ts.isArrayLiteralExpression(unwrap(args[0])) &&
          !ts.isArrowFunction(unwrap(args[0])) &&
          !ts.isFunctionExpression(unwrap(args[0])) &&
          literal(args[0]) === undefined &&
          !(
            ts.isPropertyAccessExpression(unwrap(args[0])) &&
            ts.isIdentifier(
              (unwrap(args[0]) as ts.PropertyAccessExpression).expression,
            ) &&
            (
              (unwrap(args[0]) as ts.PropertyAccessExpression)
                .expression as ts.Identifier
            ).text === input
          )
        )
          // `div(value)`: the helper decides at runtime whether it is props.
          fail('ambiguous single tag argument');
        if (args[0]) tree(args[0], slot, [...path, 0]);
        return 1;
      }
      if (parent === undefined) fail('requires one native element root');
      const constant = literal(n);
      creation.push(
        `${nodes}[${slot}] = ${renderer}.createText(${q(constant ?? '')});`,
      );
      creation.push(
        `${renderer}.appendChild(${nodes}[${parent}], ${nodes}[${slot}]);`,
      );
      if (constant === undefined) binding(n, slot, path);
      return 1;
    }
    const rootCount = tree(root, undefined, []);
    for (const [, list] of childOrder)
      for (let index = 0; index < list.length; index++) {
        const entry = list[index];
        if (!('hole' in entry)) continue;
        const next = list.slice(index + 1).find((item) => 'slot' in item);
        holePlans[entry.hole].before = next && 'slot' in next ? next.slot : -1;
      }
    if (rootCount !== 1 || elements[0]?.slot !== 0 || elements[0].path.length)
      fail('requires one native element root');
    const parameters = fn.parameters.map(text).join(', ');
    components.push({
      component: (call.arguments[0] as ts.StringLiteral).text,
      status: 'compiled',
      nodes: count,
      bindings: bindings.length,
      ...(eventPlans.length ? { events: eventPlans.length } : {}),
      ...(holePlans.length ? { holes: holePlans.length } : {}),
    });
    const locator =
      options.dom === 'clone'
        ? `locate: (${locateRoot}: Node) => {const ${nodes}: Node[] = []; ${locations.join('\n')} return ${nodes};},`
        : '';
    const all = [...readers, ...eventReaders, ...holeReaders].join(',\n');
    const bind = setup.length
      ? `(${parameters}) => { ${setup.join('\n')} return [${all}]; }`
      : `(${parameters}) => [${all}]`;
    return `{ version: 1, ${options.lean ? 'lean: true, ' : ''}${locator} create: (${renderer}: any) => { ${creation.join('\n')} return ${nodes}; }, bind: ${bind}, elements: ${q(elements)}, bindings: ${q(bindings)}${eventPlans.length ? `, events: ${q(eventPlans)}` : ''}${holePlans.length ? `, holes: ${q(holePlans)}` : ''} }`;
  }
  const pendingPlans: { call: ts.CallExpression; plan: string }[] = [];
  function walk(n: ts.Node): void {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === componentHelper
    ) {
      if (
        ts.isCallExpression(n.parent) &&
        ts.isIdentifier(n.parent.expression) &&
        attachedNames.has(n.parent.expression.text) &&
        n.parent.arguments[0] === n
      )
        return;
      try {
        const plan = compile(n);
        if (
          ts.isVariableDeclaration(n.parent) &&
          n.parent.initializer === n &&
          ts.isIdentifier(n.parent.name) &&
          ts.isVariableDeclarationList(n.parent.parent) &&
          n.parent.parent.flags & ts.NodeFlags.Const
        ) {
          const symbol = checker.getSymbolAtLocation(n.parent.name);
          if (symbol) compiledDefinitions.set(symbol, n.parent);
        }
        pendingPlans.push({ call: n, plan });
      } catch (error) {
        components.push({
          component:
            n.arguments[0] && ts.isStringLiteral(n.arguments[0])
              ? n.arguments[0].text
              : '<dynamic>',
          status: 'fallback',
          reason: (error as Error).message,
        });
      }
      // A nested component declaration has an independent scope, visited separately.
    }
    ts.forEachChild(n, walk);
  }
  walk(ast);
  // A proven one-component item factory has no reactive work of its own.
  // The source/list and the child's bindings keep their independent effects.
  function compileItems(n: ts.Node): void {
    if (
      options.lists !== false &&
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === forHelper &&
      n.arguments.length === 3
    ) {
      const callback = unwrap(n.arguments[2]);
      if (
        ts.isArrowFunction(callback) &&
        callback.parameters.length >= 1 &&
        callback.parameters.length <= 2 &&
        callback.parameters.every(
          (p) => ts.isIdentifier(p.name) && !p.initializer && !p.dotDotDotToken,
        ) &&
        !callback.modifiers?.length &&
        !ts.isBlock(callback.body)
      ) {
        const body = unwrap(callback.body);
        let declaration: ts.VariableDeclaration | undefined;
        if (ts.isCallExpression(body) && ts.isIdentifier(body.expression)) {
          const symbol = checker.getSymbolAtLocation(body.expression);
          if (symbol) declaration = compiledDefinitions.get(symbol);
        }
        if (
          declaration &&
          ts.isCallExpression(body) &&
          body.arguments.length === 1 &&
          ts.isObjectLiteralExpression(body.arguments[0])
        ) {
          const params = new Set(
            callback.parameters.map((p) => (p.name as ts.Identifier).text),
          );
          const safe = body.arguments[0].properties.every((p) =>
            ts.isShorthandPropertyAssignment(p)
              ? params.has(p.name.text)
              : ts.isPropertyAssignment(p) &&
                (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
                ts.isIdentifier(p.initializer) &&
                params.has(p.initializer.text),
          );
          // Read metadata only after the constant's initialization. A hoisted
          // function can be called earlier than its source position suggests.
          const statement = declaration.parent.parent;
          function initializedBeforeCall(): boolean {
            if (!ts.isVariableStatement(statement)) return false;
            const container = statement.parent;
            if (!ts.isSourceFile(container) && !ts.isBlock(container))
              return false;
            let cursor: ts.Node = n;
            while (cursor.parent && cursor.parent !== container) {
              if (ts.isFunctionDeclaration(cursor)) return false;
              cursor = cursor.parent;
            }
            return (
              !ts.isFunctionDeclaration(cursor) &&
              cursor.parent === container &&
              cursor.getStart(ast) >= statement.end
            );
          }
          const name = (declaration.name as ts.Identifier).text;
          const visible =
            initializedBeforeCall() &&
            sameBinding(body.expression, declaration.name) &&
            sameBinding(n.expression, forImport);
          if (safe && visible) {
            output.prependLeft(callback.getStart(ast), `${attachItem}(`);
            output.appendLeft(callback.end, `, ${name})`);
            optimizedLists++;
          }
        }
      }
    }
    ts.forEachChild(n, compileItems);
  }
  compileItems(ast);
  // Plans copy code from the module as transformed by the list pass.
  const resolvedPlans = pendingPlans.map(({ call, plan }) => ({
    call,
    plan: resolveCode(plan),
  }));
  for (const { call, plan } of resolvedPlans) {
    output.prependLeft(call.getStart(ast), `${attach}(`);
    output.appendLeft(call.end, `, ${plan})`);
  }
  if (components.some((c) => c.status === 'compiled')) {
    const first = ast.statements.find(
      (s) => !(ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)),
    );
    output.prependLeft(
      first?.getStart(ast) ?? source.length,
      `import { ɵwithCompiledTemplate as ${attach}${optimizedLists ? `, ɵwithCompiledItem as ${attachItem}` : ''}${lowered ? `, ɵy as ${lowerRead}` : ''}${servicesLowered ? `, ɵys as ${lowerService}` : ''} } from '@craft-ts/component/compiler-runtime';\n`,
    );
  }
  return {
    code: output.toString(),
    map: output.generateMap({
      source: filename,
      includeContent: true,
      hires: true,
    }),
    components,
    optimizedLists,
  };
}
