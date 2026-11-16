import ts from 'typescript';
import MagicString from 'magic-string';

export interface ComponentCompilation {
  component: string;
  status: 'compiled' | 'fallback';
  reason?: string;
  nodes?: number;
  bindings?: number;
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
  options: { lists?: boolean; dom?: 'create' | 'clone' } = {},
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
  const compiledDefinitions = new Map<string, ts.VariableDeclaration>();
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
    if (ts.isBlock(fn.body)) {
      const statements = fn.body.statements;
      if (
        statements.length !== 1 ||
        !ts.isReturnStatement(statements[0]) ||
        !statements[0].expression
      )
        throw new Error(
          'template setup statements require the generic renderer',
        );
      root = (statements[0] as ts.ReturnStatement).expression as ts.Expression;
    } else root = fn.body;
    const renderer = fresh('renderer'),
      nodes = fresh('nodes');
    const creation: string[] = [`const ${nodes}: Node[] = [];`];
    const elements: { slot: number; path: number[]; name?: string }[] = [];
    const bindings: {
      slot: number;
      key?: string;
      path: number[];
      indirect?: boolean;
      input?: string;
    }[] = [];
    const readers: string[] = [];
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
      if (!indirect && !ts.isArrowFunction(n) && !ts.isFunctionExpression(n))
        fail('binding requires a function literal or direct input');
      if (
        !indirect &&
        (n as ts.ArrowFunction).modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
        )
      )
        fail('async binding');
      readers.push(indirect ? `() => (${text(n)})` : text(n));
      bindings.push({
        slot,
        path,
        ...(key ? { key } : {}),
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
      const slot = count++;
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
    if (rootCount !== 1 || elements[0]?.slot !== 0 || elements[0].path.length)
      fail('requires one native element root');
    const parameters = fn.parameters.map(text).join(', ');
    components.push({
      component: (call.arguments[0] as ts.StringLiteral).text,
      status: 'compiled',
      nodes: count,
      bindings: bindings.length,
    });
    const locator =
      options.dom === 'clone'
        ? `locate: (${locateRoot}: Node) => {const ${nodes}: Node[] = []; ${locations.join('\n')} return ${nodes};},`
        : '';
    return `{ version: 1, ${locator} create: (${renderer}: any) => { ${creation.join('\n')} return ${nodes}; }, bind: (${parameters}) => [${readers.join(',\n')}], elements: ${q(elements)}, bindings: ${q(bindings)} }`;
  }
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
          compiledDefinitions.set(n.parent.name.text, n.parent);
        }
        output.prependLeft(n.getStart(ast), `${attach}(`);
        output.appendLeft(n.end, `, ${plan})`);
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
        const declaration =
          ts.isCallExpression(body) &&
          ts.isIdentifier(body.expression) &&
          compiledDefinitions.get(body.expression.text);
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
          // Restrict to module constants, and refuse any lexical shadow of the
          // component or forNode import along the callback's scope chain.
          const name = (declaration.name as ts.Identifier).text;
          const visible =
            ts.isVariableStatement(declaration.parent.parent) &&
            ts.isSourceFile(declaration.parent.parent.parent) &&
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
  if (components.some((c) => c.status === 'compiled')) {
    const first = ast.statements.find(
      (s) => !(ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)),
    );
    output.prependLeft(
      first?.getStart(ast) ?? source.length,
      `import { ɵwithCompiledTemplate as ${attach}${optimizedLists ? `, ɵwithCompiledItem as ${attachItem}` : ''} } from '@craft-ts/component/compiler-runtime';\n`,
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
