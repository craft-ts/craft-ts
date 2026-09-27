const {
  enclosingFunction,
  isCraftPrivateCall,
  isNamedPrimitiveCall,
  primitiveName,
  serviceFactoryOf,
  unwrap,
} = require('./craft-service-exposure-utils.cjs');

/**
 * A `craftService` exposes the named primitives its factory yields; it never
 * returns. The autofix removes a `return { x, y }` whose every property is a
 * shorthand of a binding `const x = yield* <primitive named 'x'>`, and wraps
 * the named primitives that were not returned in `craftPrivate(...)` so they
 * stay internal. Any other `return` is reported without a fix: renaming a key
 * or flattening a member (`{ add: list.add }`) changes the service's API, so
 * `craftExpose(...)` or the consumers have to be written by hand.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid `return` in a craftService factory: the service exposes the named primitives it yields.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noReturn:
        'A craftService cannot return: its API is the named primitives it yields. Remove the return (wrap what must stay internal in craftPrivate(...), expose other values with craftExpose(name, value)).',
      notGenerator:
        'A craftService factory must be a generator (function* () { ... }): its API is the named primitives it yields.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        const factory = serviceFactoryOf(node);
        if (!factory) return;

        if (
          factory.type === 'ArrowFunctionExpression' ||
          (factory.type === 'FunctionExpression' && !factory.generator)
        ) {
          context.report({ node: factory, messageId: 'notGenerator' });
          return;
        }
        if (factory.type !== 'FunctionExpression') return;

        const returns = ownReturns(factory).filter(
          (statement) => statement.argument,
        );
        if (returns.length === 0) return;

        const fix =
          returns.length === 1
            ? createFix(factory, returns[0], sourceCode)
            : undefined;
        for (const statement of returns) {
          context.report({
            node: statement,
            messageId: 'noReturn',
            fix: statement === returns[0] ? fix : undefined,
          });
        }
      },
    };
  },
};

function ownReturns(fn) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ReturnStatement' && enclosingFunction(node) === fn) {
      found.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(fn.body);
  return found;
}

/** Top-level `const x = yield* <named primitive>` / `yield* <named primitive>`. */
function topLevelNamedYields(body) {
  const result = [];
  for (const statement of body.body) {
    const candidates =
      statement.type === 'VariableDeclaration'
        ? statement.declarations.map((declarator) => ({
            expression: declarator.init,
            binding: declarator.id.type === 'Identifier' ? declarator.id.name : undefined,
          }))
        : statement.type === 'ExpressionStatement'
          ? [{ expression: statement.expression, binding: undefined }]
          : [];
    for (const { expression, binding } of candidates) {
      const yielded = unwrap(expression);
      if (yielded?.type !== 'YieldExpression' || !yielded.delegate) continue;
      if (isCraftPrivateCall(yielded.argument)) continue;
      if (!isNamedPrimitiveCall(yielded.argument)) continue;
      result.push({
        binding,
        call: unwrap(yielded.argument),
        argument: yielded.argument,
      });
    }
  }
  return result;
}

function createFix(factory, returnStatement, sourceCode) {
  const body = factory.body;
  if (body.body[body.body.length - 1] !== returnStatement) return undefined;
  const object = unwrap(returnStatement.argument);
  if (object?.type !== 'ObjectExpression') return undefined;

  const yields = topLevelNamedYields(body);
  const returned = new Set();
  for (const property of object.properties) {
    if (
      property.type !== 'Property' ||
      !property.shorthand ||
      property.key.type !== 'Identifier'
    ) {
      return undefined;
    }
    const key = property.key.name;
    const yielded = yields.find((candidate) => candidate.binding === key);
    if (!yielded || primitiveName(yielded.call) !== key) return undefined;
    returned.add(yielded);
  }

  return (fixer) => {
    const fixes = [removeStatementLine(fixer, returnStatement, sourceCode)];
    const hidden = yields.filter((yielded) => !returned.has(yielded));
    for (const yielded of hidden) {
      fixes.push(fixer.insertTextBefore(yielded.argument, 'craftPrivate('));
      fixes.push(fixer.insertTextAfter(yielded.argument, ')'));
    }
    if (hidden.length > 0) {
      const importFix = createCraftPrivateImportFix(fixer, sourceCode);
      if (importFix) fixes.push(importFix);
    }
    return fixes;
  };
}

function removeStatementLine(fixer, statement, sourceCode) {
  const text = sourceCode.getText();
  const [start, end] = statement.range;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const aloneOnLine =
    text.slice(lineStart, start).trim() === '' &&
    text.slice(end, lineEnd === -1 ? text.length : lineEnd).trim() === '';
  return aloneOnLine && lineEnd !== -1
    ? fixer.removeRange([lineStart, lineEnd + 1])
    : fixer.remove(statement);
}

function createCraftPrivateImportFix(fixer, sourceCode) {
  const program = sourceCode.ast;
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const imported = statement.specifiers.some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'craftPrivate',
    );
    if (imported) return undefined;
  }
  const coreImport = program.body.find(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.source.value === '@craft-ts/core' &&
      statement.importKind !== 'type' &&
      statement.specifiers.some((s) => s.type === 'ImportSpecifier'),
  );
  if (coreImport) {
    const specifiers = coreImport.specifiers.filter(
      (specifier) => specifier.type === 'ImportSpecifier',
    );
    return fixer.insertTextAfter(
      specifiers[specifiers.length - 1],
      ', craftPrivate',
    );
  }
  return fixer.insertTextBefore(
    program.body[0] ?? program,
    "import { craftPrivate } from '@craft-ts/core';\n",
  );
}
