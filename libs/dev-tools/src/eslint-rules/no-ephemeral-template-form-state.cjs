const INPUT_EVENTS = new Set(['input', 'change', 'keyup']);
const CONSUMER_EVENTS = new Set(['click', 'submit', 'keydown']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require form values shared by template event handlers to use Craft state.',
    },
    schema: [],
    messages: {
      useState:
        "Template form value '{{name}}' is written by an input handler and read by another event handler. Store it with state() so it survives template re-evaluation.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      if (!isFunctionNode(template)) return;

      const declarations = collectLocalDeclarations(template);
      if (declarations.size === 0) return;

      const handlers = collectEventHandlers(template);
      const inputHandlers = handlers.filter((handler) =>
        INPUT_EVENTS.has(handler.name),
      );
      const consumerHandlers = handlers.filter((handler) =>
        CONSUMER_EVENTS.has(handler.name),
      );

      for (const [name, declaration] of declarations) {
        const writer = inputHandlers.find((handler) =>
          handlerWrites(handler, name),
        );
        if (!writer) continue;

        const consumer = consumerHandlers.find(
          (handler) =>
            handler !== writer && handlerReads(handler, name),
        );
        if (!consumer) continue;

        context.report({
          node: declaration,
          messageId: 'useState',
          data: { name },
        });
      }
    }

    function collectLocalDeclarations(template) {
      const declarations = new Map();

      walkFunctionBody(template.body, (node) => {
        if (node.type !== 'VariableDeclaration') return;
        if (node.kind !== 'let' && node.kind !== 'var') return;

        for (const declarator of node.declarations) {
          if (declarator.id.type === 'Identifier') {
            declarations.set(declarator.id.name, declarator.id);
          }
        }
      });

      return declarations;
    }

    function collectEventHandlers(template) {
      const handlers = [];

      walkFunctionBody(template.body, (node) => {
        if (isNestedCraftComponent(node)) return 'skip';

        if (node.type !== 'Property' || node.computed) return;

        const name = getStaticPropertyName(node);
        if (!name || !isFunctionNode(node.value)) return;

        if (INPUT_EVENTS.has(name) || CONSUMER_EVENTS.has(name)) {
          handlers.push({ name, functionNode: node.value });
          return 'skip';
        }
      });

      return handlers;
    }

    function handlerWrites(handler, name) {
      let writes = false;
      const bindings = collectFunctionBindings(handler.functionNode);

      walkFunctionBody(handler.functionNode.body, (node) => {
        if (node.type === 'AssignmentExpression') {
          if (
            node.left.type === 'Identifier' &&
            node.left.name === name &&
            containsValueRead(node.right) &&
            !bindings.has(name)
          ) {
            writes = true;
          }
          return;
        }

        if (
          node.type === 'UpdateExpression' &&
          node.argument.type === 'Identifier' &&
          node.argument.name === name &&
          !bindings.has(name)
        ) {
          writes = true;
        }
      });

      return writes;
    }

    function containsValueRead(node) {
      let found = false;
      walk(node, (child) => {
        if (
          child.type === 'MemberExpression' &&
          !child.computed &&
          child.property.type === 'Identifier' &&
          child.property.name === 'value'
        ) {
          found = true;
        }
      });
      return found;
    }

    function handlerReads(handler, name) {
      let reads = false;
      const bindings = collectFunctionBindings(handler.functionNode);

      walkFunctionBody(handler.functionNode.body, (node) => {
        if (node.type !== 'Identifier' || node.name !== name) return;
        if (bindings.has(name) || isNonReferenceIdentifier(node)) return;
        if (isWriteTarget(node)) return;
        reads = true;
      });

      return reads;
    }

    function collectFunctionBindings(functionNode) {
      const bindings = new Set();
      for (const parameter of functionNode.params) {
        collectPatternNames(parameter, bindings);
      }

      walkFunctionBody(functionNode.body, (node) => {
        if (node.type === 'VariableDeclarator') {
          collectPatternNames(node.id, bindings);
        }
        if (node.type === 'FunctionDeclaration' && node.id) {
          bindings.add(node.id.name);
        }
      });

      return bindings;
    }

    function collectPatternNames(node, names) {
      if (!node) return;
      if (node.type === 'Identifier') {
        names.add(node.name);
        return;
      }
      if (node.type === 'AssignmentPattern') {
        collectPatternNames(node.left, names);
        return;
      }
      if (node.type === 'RestElement') {
        collectPatternNames(node.argument, names);
        return;
      }
      if (node.type === 'ArrayPattern') {
        node.elements.forEach((element) => collectPatternNames(element, names));
        return;
      }
      if (node.type === 'ObjectPattern') {
        node.properties.forEach((property) => {
          if (property.type === 'RestElement') {
            collectPatternNames(property.argument, names);
          } else {
            collectPatternNames(property.value, names);
          }
        });
      }
    }

    function isWriteTarget(node) {
      const parent = node.parent;
      return (
        (parent?.type === 'AssignmentExpression' && parent.left === node) ||
        (parent?.type === 'UpdateExpression' && parent.argument === node)
      );
    }

    function isNonReferenceIdentifier(node) {
      const parent = node.parent;
      return Boolean(
        (parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed) ||
          (parent?.type === 'Property' &&
            parent.key === node &&
            !parent.computed &&
            parent.value !== node) ||
          (parent?.type === 'MethodDefinition' && parent.key === node),
      );
    }

    function getStaticPropertyName(property) {
      if (property.key.type === 'Identifier') return property.key.name;
      if (
        (property.key.type === 'Literal' ||
          property.key.type === 'StringLiteral') &&
        typeof property.key.value === 'string'
      ) {
        return property.key.value;
      }
      return undefined;
    }

    function walkFunctionBody(node, visit) {
      walk(node, (child) => {
        if (child !== node && isFunctionNode(child)) return 'skip';
        return visit(child);
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((item) => walk(item, visit));
        } else {
          walk(child, visit);
        }
      }
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }

    function isNestedCraftComponent(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'craftComponent'
      );
    }
  },
};
