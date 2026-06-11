const DEFAULT_PRIMITIVES = [
  'mutation',
  'query',
  'asyncProcess',
  'state',
  'craftMethod',
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require primitives that carry dependencies to be yielded with `yield* track(...)` inside a craftService so their dependencies are detected.',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          primitives: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      requireTrack:
        "'{{name}}(...)' uses dependencies (it yields) and must be yielded with `yield* track({{name}}(...))` so the enclosing craftService tracks them.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const primitives = new Set(options.primitives ?? DEFAULT_PRIMITIVES);
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !primitives.has(node.callee.name)
        ) {
          return;
        }

        if (!isInsideCraftService(node)) {
          return;
        }

        // `yield* track(...)` is only legal when the directly enclosing factory
        // is a generator. Non-generator factories (e.g. `(inputs) => {...}`)
        // cannot yield, so the rule does not apply there.
        if (!isInsideGeneratorFactory(node)) {
          return;
        }

        // "Has dependencies" heuristic: the primitive config yields something.
        if (!argumentsContainYield(node)) {
          return;
        }

        if (isAlreadyTracked(node)) {
          return;
        }

        const primitiveName = node.callee.name;

        context.report({
          node,
          messageId: 'requireTrack',
          data: { name: primitiveName },
          fix(fixer) {
            const fixes = [
              fixer.replaceText(
                node,
                `yield* track(${sourceCode.getText(node)})`,
              ),
            ];

            const importFix = createTrackImportFix(fixer, sourceCode);
            if (importFix) {
              fixes.push(importFix);
            }

            return fixes;
          },
        });
      },
    };
  },
};

function isInsideCraftService(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'craftService'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideGeneratorFactory(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return current.generator === true;
    }
    current = current.parent;
  }
  return false;
}

function isAlreadyTracked(node) {
  // Being the argument of a `track(...)` call is enough to consider the
  // primitive handled — this keeps the autofix idempotent regardless of how the
  // surrounding `yield*` is shaped.
  const parent = node.parent;
  return (
    parent &&
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'track' &&
    parent.arguments[0] === node
  );
}

function argumentsContainYield(callNode) {
  for (const argument of callNode.arguments) {
    if (containsYield(argument)) {
      return true;
    }
  }
  return false;
}

function containsYield(node) {
  if (!node || typeof node.type !== 'string') {
    return false;
  }

  if (node.type === 'YieldExpression') {
    return true;
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent') {
      continue;
    }

    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string' && containsYield(item)) {
          return true;
        }
      }
    } else if (value && typeof value.type === 'string') {
      if (containsYield(value)) {
        return true;
      }
    }
  }

  return false;
}

function createTrackImportFix(fixer, sourceCode) {
  const program = sourceCode.ast;
  let craftImport;

  for (const statement of program.body) {
    if (
      statement.type === 'ImportDeclaration' &&
      statement.source.value === '@craft-ng/core'
    ) {
      const alreadyImported = statement.specifiers.some(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === 'track',
      );
      if (alreadyImported) {
        return undefined;
      }
      craftImport = statement;
      break;
    }
  }

  if (!craftImport) {
    return fixer.insertTextBefore(
      program.body[0] ?? program,
      "import { track } from '@craft-ng/core';\n",
    );
  }

  const namedSpecifiers = craftImport.specifiers.filter(
    (specifier) => specifier.type === 'ImportSpecifier',
  );

  if (namedSpecifiers.length === 0) {
    return undefined;
  }

  const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
  return fixer.insertTextAfter(lastSpecifier, ', track');
}
