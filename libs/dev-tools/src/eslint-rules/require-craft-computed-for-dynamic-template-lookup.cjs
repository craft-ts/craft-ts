const TEMPLATE_HOSTS = new Set(['craftComponent', 'craftDirective']);

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

function isStaticProperty(node) {
  return (
    node?.type === 'Literal' ||
    (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require dynamic object and array lookups in Craft templates to be exposed through craftComputed().',
    },
    schema: [],
    messages: {
      moveToComputed:
        'Do not perform a dynamic object or array lookup in a Craft template. Move the lookup to a named craftComputed() in the component logic factory, then bind the computed value directly.',
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
        if (template) inspectTemplate(template);
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
            if (
              definition.type === 'FunctionName' &&
              isFunctionNode(definition.node)
            ) {
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
      const parameterNames = bindingNames(template.params?.[0]);

      walk(template, (node) => {
        if (node !== template && isTemplateHostCall(node)) {
          return 'skip';
        }

        if (
          node.type !== 'MemberExpression' ||
          !node.computed ||
          isStaticProperty(node.property) ||
          !containsNamedTemplateParameter(node, parameterNames)
        ) {
          return;
        }

        context.report({ node, messageId: 'moveToComputed' });
      });
    }

    function bindingNames(pattern, names = new Set()) {
      if (!pattern) return names;
      if (pattern.type === 'Identifier') {
        names.add(pattern.name);
        return names;
      }
      if (pattern.type === 'AssignmentPattern') {
        return bindingNames(pattern.left, names);
      }
      if (pattern.type === 'RestElement') {
        return bindingNames(pattern.argument, names);
      }
      if (pattern.type === 'ArrayPattern') {
        for (const element of pattern.elements) bindingNames(element, names);
        return names;
      }
      if (pattern.type === 'ObjectPattern') {
        for (const property of pattern.properties) {
          if (property.type === 'RestElement') {
            bindingNames(property.argument, names);
          } else {
            bindingNames(property.value, names);
          }
        }
      }
      return names;
    }

    function containsNamedTemplateParameter(node, parameterNames) {
      let found = false;
      walk(node, (candidate) => {
        if (
          candidate !== node &&
          candidate.type === 'Identifier' &&
          parameterNames.has(candidate.name)
        ) {
          found = true;
          return 'skip';
        }
      });
      return found;
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) walk(item, visit);
        } else {
          walk(child, visit);
        }
      }
    }
  },
};
