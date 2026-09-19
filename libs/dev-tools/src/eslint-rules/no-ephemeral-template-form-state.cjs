const TEMPLATE_HOSTS = new Set(['craftComponent', 'craftDirective']);

/**
 * The component's own scope is where it declares what it renders from: the
 * service it takes, the primitives it owns, its inputs. Those declarations are
 * the API, not ephemeral render state.
 */
const CRAFT_DECLARATION_CALLEES = new Set([
  'state',
  'query',
  'mutation',
  'source',
  'source$',
  'asyncProcess',
  'craftComputed',
  'craftMethod',
  'craftStateMachine',
  'craftUse',
  'computedEffect',
  'methodEffect',
  'mutationEffect',
  'queryEffect',
  'stateEffect',
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
      const parameterNames = new Set(
        template.params
          .filter((parameter) => parameter.type === 'Identifier')
          .map((parameter) => parameter.name),
      );

      walk(template, (node) => {
        if (node !== template && isTemplateHostCall(node)) {
          return 'skip';
        }

        if (node.type !== 'VariableDeclaration') return;
        if (
          componentScope.has(node) &&
          isComponentDeclaration(node, parameterNames)
        ) {
          return;
        }

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
      });
    }

    /** `const … = yield* Service()`, a craft primitive, or the inputs object. */
    function isComponentDeclaration(node, parameterNames) {
      return node.declarations.every((declarator) => {
        const init = declarator.init;
        if (!init) return false;
        if (init.type === 'YieldExpression') return true;
        if (init.type === 'Identifier') return parameterNames.has(init.name);
        return (
          init.type === 'CallExpression' &&
          init.callee.type === 'Identifier' &&
          CRAFT_DECLARATION_CALLEES.has(init.callee.name)
        );
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
