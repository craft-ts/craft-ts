const CRAFT_COMPONENT = 'craftComponent';
const FOR_NODE = 'forNode';

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer deep-yieldable forNode items when a template reads several item properties.',
    },
    schema: [],
    messages: {
      preferDeep:
        "The `{{item}}` item is read repeatedly with `yield*` to access properties. Expose `{{source}}` as a named deep-yieldable collection (for example `insertDeepYieldable('products')` => `catalog.deepYieldableProducts`), or use `insertDeepYieldableValue()` for `query.value`, then bind properties directly as `{{item}}.property`.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isNamedCall(node, CRAFT_COMPONENT) || node.arguments.length < 4) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isNamedCall(node, CRAFT_COMPONENT)) {
          return 'skip';
        }

        if (!isNamedCall(node, FOR_NODE)) return;

        inspectForNode(node);
        return 'skip';
      });
    }

    function inspectForNode(node) {
      const source = node.arguments[0];
      const itemTemplate = unwrap(node.arguments[2]);
      if (!source || !isFunctionNode(itemTemplate)) return;

      const itemParameter = itemTemplate.params[0];
      if (!itemParameter || itemParameter.type !== 'Identifier') return;
      const itemVariable = findVariable(itemParameter);

      const reads = new Map();
      walk(itemTemplate.body, (candidate) => {
        if (isNamedCall(candidate, CRAFT_COMPONENT)) return 'skip';
        if (isNamedCall(candidate, FOR_NODE)) {
          inspectForNode(candidate);
          return 'skip';
        }
        const read = getRepeatedPropertyRead(
          candidate,
          itemParameter.name,
          itemVariable,
        );
        if (!read) return;

        const current = reads.get(itemParameter.name) ?? [];
        current.push(read);
        reads.set(itemParameter.name, current);
      });

      const repeatedRead = reads.get(itemParameter.name);
      if (!repeatedRead || repeatedRead.length < 2) return;

      context.report({
        node: repeatedRead[1],
        messageId: 'preferDeep',
        data: {
          item: itemParameter.name,
          source: sourceCode.getText(source),
        },
      });
    }

    function getRepeatedPropertyRead(node, itemName, itemVariable) {
      if (
        node.type !== 'MemberExpression' ||
        node.computed ||
        !node.object
      ) {
        return undefined;
      }

      const delegated = unwrap(node.object);
      if (
        delegated.type !== 'YieldExpression' ||
        !delegated.delegate ||
        delegated.argument.type !== 'CallExpression'
      ) {
        return undefined;
      }

      const call = delegated.argument;
      return call.callee.type === 'Identifier' &&
        call.callee.name === itemName &&
        call.arguments.length === 0 &&
        (!itemVariable || findVariable(call.callee) === itemVariable)
        ? node
        : undefined;
    }

    function findVariable(identifier) {
      let scope = sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) return variable;
        scope = scope.upper;
      }
      return undefined;
    }

    function isNamedCall(node, name) {
      return (
        node?.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === name
      );
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }

    function unwrap(node) {
      let current = node;
      while (
        current &&
        ['ChainExpression', 'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression'].includes(
          current.type,
        )
      ) {
        current = current.expression;
      }
      return current;
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
  },
};
