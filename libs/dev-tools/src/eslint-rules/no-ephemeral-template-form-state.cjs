const TEMPLATE_HOSTS = new Set(['craftComponent', 'craftDirective']);
const DOM_EVENT_NAMES = new Set([
  'change',
  'click',
  'input',
  'keydown',
  'keyup',
  'paste',
  'submit',
]);

function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function isTemplateHostCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    TEMPLATE_HOSTS.has(node.callee.name)
  );
}

function declaratorName(declarator) {
  return declarator.id.type === 'Identifier' ? declarator.id.name : undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid let/const/var declarations in Craft component and directive templates; declare state in the logic factory.',
    },
    schema: [],
    messages: {
      useState:
        "Do not declare '{{name}}' with {{kind}} in a Craft template. Move it to the logic factory as state() or craftComputed().",
      useStatePattern:
        'Do not declare {{kind}} bindings in a Craft template. Move them to the logic factory as state() or craftComputed().',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isTemplateHostCall(node) || node.arguments.length < 4) {
          return;
        }

        const template = resolveTemplateFunction(node.arguments[3]);
        if (!template) return;

        inspectTemplate(template);
      },
    };

    function resolveTemplateFunction(node) {
      if (isFunctionNode(node)) return node;
      if (node?.type !== 'Identifier') return null;

      let scope = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.variables.find(
          (candidate) => candidate.name === node.name,
        );
        if (variable) {
          for (const definition of variable.defs) {
            if (definition.type === 'ImportBinding') return null;
            if (definition.type === 'FunctionName' && isFunctionNode(definition.node)) {
              return definition.node;
            }
            if (
              definition.type === 'Variable' &&
              isFunctionNode(definition.node.init)
            ) {
              return definition.node.init;
            }
          }
          return null;
        }
        scope = scope.upper;
      }

      return null;
    }

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isTemplateHostCall(node)) {
          return 'skip';
        }

        if (node.type !== 'VariableDeclaration') return;

        // Reading a value yielded by a reactive item is a snapshot alias, not
        // local form state or a derivation. Keep declarations of derived
        // values and mutable bindings out of the template, but allow this
        // ordinary way to name the current item before rendering its fields.
        if (
          node.kind === 'const' &&
          !isInsideEventHandler(node) &&
          node.declarations.every(
            (declarator) => declarator.init?.type === 'YieldExpression',
          )
        ) {
          return;
        }

        const named = node.declarations
          .map(declaratorName)
          .filter(Boolean);

        if (named.length === 0) {
          context.report({
            node,
            messageId: 'useStatePattern',
            data: { kind: node.kind },
          });
          return;
        }

        for (const name of named) {
          context.report({
            node,
            messageId: 'useState',
            data: { name, kind: node.kind },
          });
        }
      });
    }

    function isInsideEventHandler(node) {
      let current = node.parent;
      while (current) {
        if (
          (current.type === 'Property' || current.type === 'MethodDefinition') &&
          current.key?.type === 'Identifier' &&
          DOM_EVENT_NAMES.has(current.key.name)
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
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
