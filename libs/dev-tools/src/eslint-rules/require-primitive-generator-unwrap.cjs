const DEFAULT_PRIMITIVES = [
  'state',
  'query',
  'mutation',
  'asyncProcess',
  'queryParam',
];

const FACTORY_HOST_CALLEES = new Set([
  'craftComponent',
  'craftService',
  'toCraftService',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craft primitive invocations (which return a generator) to be consumed with `yield*` inside a generator factory or `craftUse(...)` elsewhere.',
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
      requireUnwrap:
        "'{{name}}(...)' returns a primitive generator that must be consumed: use `yield* {{name}}(...)` inside a generator factory, or `craftUse({{name}}(...))` elsewhere.",
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
          !primitives.has(node.callee.name) ||
          // Creation calls always take a config; destructured readers such as
          // `({ state }) => state().page` are argument-less.
          node.arguments.length === 0
        ) {
          return;
        }

        if (!resolvesToImport(node.callee, sourceCode, context)) {
          return;
        }

        if (
          isConsumed(node) ||
          isDirectFactoryReturn(node) ||
          isTrackedTypeOnlyPosition(node)
        ) {
          return;
        }

        const primitiveName = node.callee.name;

        context.report({
          node,
          messageId: 'requireUnwrap',
          data: { name: primitiveName },
          fix(fixer) {
            const text = sourceCode.getText(node);

            if (isInsideGeneratorFunction(node)) {
              const wrapped = needsYieldParens(node)
                ? `(yield* ${text})`
                : `yield* ${text}`;
              return [fixer.replaceText(node, wrapped)];
            }

            const fixes = [fixer.replaceText(node, `craftUse(${text})`)];
            const importFix = createCraftUseImportFix(fixer, sourceCode);
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

function resolvesToImport(identifier, sourceCode, context) {
  const scope = sourceCode.getScope
    ? sourceCode.getScope(identifier)
    : context.getScope();
  let current = scope;
  while (current) {
    const variable = current.variables.find(
      (candidate) => candidate.name === identifier.name,
    );
    if (variable) {
      if (variable.defs.length === 0) {
        return false;
      }
      return variable.defs.every((def) => def.type === 'ImportBinding');
    }
    current = current.upper;
  }
  // Unresolved (globals) — not an import of the primitive.
  return false;
}

function isConsumed(node) {
  const parent = skipParens(node.parent);
  if (!parent) {
    return false;
  }
  if (parent.type === 'YieldExpression') {
    return true;
  }
  return (
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'craftUse' &&
    skipParensDown(parent.arguments[0]) === node
  );
}

function isDirectFactoryReturn(node) {
  const arrow = skipParens(node.parent);
  if (!arrow || arrow.type !== 'ArrowFunctionExpression') {
    return false;
  }
  if (skipParensDown(arrow.body) !== node) {
    return false;
  }
  return isFactoryHostArrow(arrow);
}

function isFactoryHostArrow(arrow) {
  const parent = arrow.parent;
  if (
    parent &&
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    FACTORY_HOST_CALLEES.has(parent.callee.name)
  ) {
    if (parent.callee.name === 'craftComponent') {
      return parent.arguments[2] === arrow;
    }
    return parent.arguments.includes(arrow);
  }
  return (
    parent &&
    parent.type === 'Property' &&
    parent.key &&
    ((parent.key.type === 'Identifier' && parent.key.name === 'queryParams') ||
      (parent.key.type === 'Literal' && parent.key.value === 'queryParams')) &&
    parent.value === arrow
  );
}

// `mockHttpRequestForRoute` / type-only fixtures sometimes reference a
// primitive purely for inference through `typeof`; those never run.
function isTrackedTypeOnlyPosition(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'TSTypeQuery' ||
      current.type === 'TSTypeReference' ||
      current.type === 'TSTypeAnnotation'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideGeneratorFunction(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'ArrowFunctionExpression') {
      return false;
    }
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current.generator === true;
    }
    current = current.parent;
  }
  return false;
}

function needsYieldParens(node) {
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  return (
    parent.type === 'SpreadElement' ||
    parent.type === 'MemberExpression' ||
    parent.type === 'BinaryExpression' ||
    parent.type === 'ConditionalExpression' ||
    parent.type === 'TemplateLiteral' ||
    (parent.type === 'CallExpression' && parent.callee === node)
  );
}

function skipParens(node) {
  let current = node;
  while (current && current.type === 'ParenthesizedExpression') {
    current = current.parent;
  }
  return current;
}

function skipParensDown(node) {
  let current = node;
  while (current && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return current;
}

function createCraftUseImportFix(fixer, sourceCode) {
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
          specifier.imported.name === 'craftUse',
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
      "import { craftUse } from '@craft-ng/core';\n",
    );
  }

  const namedSpecifiers = craftImport.specifiers.filter(
    (specifier) => specifier.type === 'ImportSpecifier',
  );

  if (namedSpecifiers.length === 0) {
    return undefined;
  }

  const lastSpecifier = namedSpecifiers[namedSpecifiers.length - 1];
  return fixer.insertTextAfter(lastSpecifier, ', craftUse');
}
