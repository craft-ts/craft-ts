const {
  calleeName,
  serviceFactoryOf,
  unwrap,
} = require('./craft-service-exposure-utils.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require mutable state changed by craftExpose callbacks to be declared with a Craft state primitive and insertion.',
    },
    schema: [],
    messages: {
      useState:
        "'{{name}}' is mutable service state captured by a craftExpose callback. Declare it with state(...) and expose changes through the state's insertion so the state remains declarative and reactive.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (calleeName(node) !== 'craftService') return;
        const factory = serviceFactoryOf(node);
        if (!isFunctionNode(factory)) return;

        const serviceBindings = collectServiceBindings(factory);
        const exposedCallbacks = collectExposedCallbacks(factory);

        for (const declarator of serviceBindings) {
          const variables = sourceCode.getDeclaredVariables(declarator);
          for (const variable of variables) {
            for (const reference of variable.references) {
              const identifier = reference.identifier;
              if (
                !exposedCallbacks.some((callback) =>
                  isDescendantOf(identifier, callback),
                ) ||
                !isMutationReference(identifier, reference)
              ) {
                continue;
              }

              context.report({
                node: identifier,
                messageId: 'useState',
                data: { name: variable.name },
              });
            }
          }
        }
      },
    };
  },
};

function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function collectServiceBindings(factory) {
  const bindings = [];
  visit(factory.body, (node) => {
    if (node.type !== 'VariableDeclarator') return;
    if (enclosingFunction(node) !== factory) return;
    if (node.id.type === 'Identifier') bindings.push(node);
  });
  return bindings;
}

function collectExposedCallbacks(factory) {
  const callbacks = [];
  visit(factory.body, (node) => {
    if (
      node.type !== 'CallExpression' ||
      calleeName(node) !== 'craftExpose' ||
      !isDescendantOf(node, factory)
    ) {
      return;
    }
    const callback = unwrap(node.arguments[1]);
    if (isFunctionNode(callback)) callbacks.push(callback);
  });
  return callbacks;
}

function visit(node, callback) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string')
    return;
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, callback);
    } else if (
      value &&
      typeof value === 'object' &&
      typeof value.type === 'string'
    ) {
      visit(value, callback);
    }
  }
}

function enclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (isFunctionNode(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isMutationReference(identifier, reference) {
  if (reference.isWrite()) return true;

  let target = identifier;
  let parent = target.parent;
  while (parent?.type === 'MemberExpression' && parent.object === target) {
    target = parent;
    parent = parent.parent;
  }

  return (
    (parent?.type === 'AssignmentExpression' && parent.left === target) ||
    (parent?.type === 'UpdateExpression' && parent.argument === target) ||
    (parent?.type === 'UnaryExpression' &&
      parent.operator === 'delete' &&
      parent.argument === target)
  );
}
