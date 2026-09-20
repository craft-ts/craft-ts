const { templateRegions } = require('./craft-template-region.cjs');

const TEMPLATE_HOSTS = new Set(['craftComponent', 'craftDirective']);

/**
 * The component's own scope is where it declares what it renders from: the
 * service it takes, the primitives it owns, its inputs, the helpers it builds
 * from them. What it may not hold there is a **value** — a literal, or nothing
 * at all — because the body runs again on every render and that value is lost.
 */
const STATE_SHAPED_INITIALIZERS = new Set([
  'Literal',
  'TemplateLiteral',
  'ArrayExpression',
  'ObjectExpression',
  'UnaryExpression',
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
        'Forbid let/const/var declarations in what a Craft component or directive renders; declare state with a primitive, or in the service the component takes.',
    },
    schema: [],
    messages: {
      useState:
        "Do not declare '{{name}}' with {{kind}} in a Craft template. Move it to the component's service as state() or craftComputed().",
      useStatePattern:
        "Do not declare {{kind}} bindings in a Craft template. Move them to the component's service as state() or craftComputed().",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isTemplateHostCall(node) || node.arguments.length < 3) {
          return;
        }

        const template = resolveTemplateFunction(
          templateArgument(node.arguments[2]),
        );
        if (!template) return;

        inspectTemplate(template);
      },
    };

    /** A directive declares its template inside its transforms object. */
    function templateArgument(argument) {
      if (argument?.type !== 'ObjectExpression') return argument;
      const property = argument.properties.find(
        (candidate) =>
          candidate.type === 'Property' &&
          !candidate.computed &&
          candidate.key.type === 'Identifier' &&
          candidate.key.name === 'template',
      );
      return property?.value ?? null;
    }

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
      const componentScope = new Set(
        template.body?.type === 'BlockStatement' ? template.body.body : [],
      );
      // Below the component's own scope, only what it renders is a template: a
      // local inside a primitive's insertion is a declaration, not a binding.
      const roots = [...componentScope, ...templateRegions(template)];

      const visit = (node) => {
        if (node !== template && isTemplateHostCall(node)) {
          return 'skip';
        }

        if (node.type !== 'VariableDeclaration') return;
        // What a component declares in its own scope is checked here and not
        // walked into: the callbacks a primitive takes are declaration code.
        if (componentScope.has(node)) {
          if (isComponentDeclaration(node)) return 'skip';
          reportDeclaration(node);
          return 'skip';
        }

        reportDeclaration(node);
        return undefined;
      };

      for (const root of roots) walk(root, visit);
    }

    function reportDeclaration(node) {
      const named = node.declarations.map(declaratorName).filter(Boolean);

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
    }

    /** Anything but a value the next render would rebuild from nothing. */
    function isComponentDeclaration(node) {
      return node.declarations.every((declarator) => {
        const init = declarator.init;
        return Boolean(init) && !STATE_SHAPED_INITIALIZERS.has(init.type);
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
  },
};
