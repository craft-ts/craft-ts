const INPUT_CONTROLS = new Set(['input', 'textarea']);
const ACTION_METHODS = new Set(['mutate', 'method']);
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a Craft form submission boundary when a button action consumes an input value.',
    },
    schema: [],
    messages: {
      requireForm:
        'This button action consumes the value of an input. Use a Craft form with state(..., insertForm(...)), connect mutations with insertFormSubmit(...), and submit through form(...); do not call mutate(...) or method(...) directly from the button.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const componentNames = new Set(['craftComponent']);
    const buttonNames = new Set(['button']);
    const inputControlNames = new Set(INPUT_CONTROLS);

    return {
      ImportDeclaration(node) {
        const packageName = node.source.value;
        if (
          packageName !== '@craft-ts/component' &&
          packageName !== '@craft-ts/core'
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const importedName = getIdentifierName(specifier.imported);
          if (!importedName) continue;

          if (packageName === '@craft-ts/component') {
            if (importedName === 'craftComponent') {
              componentNames.add(specifier.local.name);
            }
            if (importedName === 'button') buttonNames.add(specifier.local.name);
            if (INPUT_CONTROLS.has(importedName)) {
              inputControlNames.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !componentNames.has(node.callee.name) ||
          node.arguments.length < 4
        ) {
          return;
        }

        const template = resolveTemplate(node.arguments[3]);
        if (!template) return;

        for (const input of findInputControls(template, inputControlNames)) {
          const inputValues = collectValueIdentifiers(input);
          if (inputValues.size === 0) continue;

          const action = findConsumingAction(
            template,
            input,
            inputValues,
            buttonNames,
          );
          if (!action) continue;

          context.report({ node: action, messageId: 'requireForm' });
          break;
        }
      },
    };

    function resolveTemplate(node) {
      if (isFunction(node)) return node;
      if (node?.type !== 'Identifier') return null;

      let scope = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.variables.find(
          (candidate) => candidate.name === node.name,
        );
        if (variable) {
          for (const definition of variable.defs) {
            if (
              (definition.type === 'Variable' &&
                isFunction(definition.node.init)) ||
              (definition.type === 'FunctionName' &&
                isFunction(definition.node))
            ) {
              return definition.type === 'Variable'
                ? definition.node.init
                : definition.node;
            }
          }
          return null;
        }
        scope = scope.upper;
      }

      return null;
    }

    function findInputControls(template, inputControlNames) {
      const controls = [];
      walkTemplate(template, (node) => {
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          inputControlNames.has(node.callee.name)
        ) {
          controls.push(node);
        }
      });
      return controls;
    }

    function collectValueIdentifiers(control) {
      const identifiers = new Set();
      const options = control.arguments.find(
        (argument) => argument.type === 'ObjectExpression',
      );
      if (!options) return identifiers;

      for (const property of options.properties) {
        if (property.type !== 'Property' || property.computed) continue;
        const name = getPropertyName(property.key);
        if (name !== 'value') continue;
        collectReadIdentifiers(property.value, identifiers);
      }

      return identifiers;
    }

    function findConsumingAction(template, control, inputValues, buttonNames) {
      let found;

      walkTemplate(template, (node) => {
        if (found || node === control || node.type !== 'Property') return;
        if (node.computed || !isButtonClickProperty(node, buttonNames)) return;
        if (!isFunction(node.value)) return;

        const action = findActionCall(node.value.body, inputValues);
        if (action) found = action;
      });

      return found;
    }

    function findActionCall(node, inputValues) {
      let found;
      const localBindings = collectLocalBindings(node);

      walk(node, (candidate) => {
        if (found || candidate.type !== 'CallExpression') return;
        if (!isActionCall(candidate)) return;

        if (
          candidate.arguments.some((argument) =>
            dependsOnInput(argument, inputValues, localBindings),
          )
        ) {
          found = candidate;
        }
      });

      return found;
    }

    function collectLocalBindings(node) {
      const bindings = new Map();

      walk(node, (candidate) => {
        if (candidate.type === 'VariableDeclarator') {
          if (candidate.id.type === 'Identifier' && candidate.init) {
            bindings.set(candidate.id.name, candidate.init);
          }
          return;
        }

        if (
          candidate.type === 'AssignmentExpression' &&
          candidate.left.type === 'Identifier'
        ) {
          bindings.set(candidate.left.name, candidate.right);
        }
      });

      return bindings;
    }

    function isActionCall(node) {
      if (node.callee.type === 'MemberExpression') {
        const name = getPropertyName(node.callee.property, node.callee.computed);
        return ACTION_METHODS.has(name);
      }

      return node.callee.type === 'Identifier';
    }

    function dependsOnInput(node, inputValues, localBindings, seen = new Set()) {
      if (!node || typeof node.type !== 'string') return false;

      if (node.type === 'Identifier') {
        if (inputValues.has(node.name)) return true;
        const binding = localBindings.get(node.name);
        if (!binding || seen.has(node.name)) return false;

        const nextSeen = new Set(seen);
        nextSeen.add(node.name);
        return dependsOnInput(binding, inputValues, localBindings, nextSeen);
      }

      if (node.type === 'Property') {
        return (
          (node.computed && dependsOnInput(node.key, inputValues, localBindings, seen)) ||
          dependsOnInput(node.value, inputValues, localBindings, seen)
        );
      }

      if (
        node.type === 'MemberExpression' &&
        dependsOnInput(node.object, inputValues, localBindings, seen)
      ) {
        return true;
      }

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        if (key === 'id' && node.type === 'VariableDeclarator') continue;
        if (key === 'property' && node.type === 'MemberExpression' && !node.computed) {
          continue;
        }

        const child = node[key];
        if (Array.isArray(child)) {
          if (
            child.some((item) =>
              dependsOnInput(item, inputValues, localBindings, seen),
            )
          ) {
            return true;
          }
        } else if (dependsOnInput(child, inputValues, localBindings, seen)) {
          return true;
        }
      }

      return false;
    }

    function walkTemplate(node, visitor) {
      if (!node || typeof node.type !== 'string') return;
      if (isNestedCraftComponent(node)) return;
      visitor(node);

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) walkTemplate(item, visitor);
        } else {
          walkTemplate(child, visitor);
        }
      }
    }

    function walk(node, visitor) {
      if (!node || typeof node.type !== 'string') return;
      visitor(node);

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          for (const item of child) walk(item, visitor);
        } else {
          walk(child, visitor);
        }
      }
    }
  },
};

function collectReadIdentifiers(node, identifiers) {
  walkPlain(node, (candidate) => {
    if (candidate.type !== 'Identifier') return;
    const parent = candidate.parent;
    if (!parent) return;
    if (
      parent.type === 'MemberExpression' &&
      parent.property === candidate &&
      !parent.computed
    ) {
      return;
    }
    if (
      (parent.type === 'VariableDeclarator' && parent.id === candidate) ||
      (parent.type === 'Property' && parent.key === candidate && !parent.computed) ||
      (parent.type === 'FunctionDeclaration' && parent.id === candidate) ||
      (parent.type === 'FunctionExpression' && parent.id === candidate) ||
      (parent.type === 'ArrowFunctionExpression' && parent.id === candidate)
    ) {
      return;
    }
    identifiers.add(candidate.name);
  });
}

function walkPlain(node, visitor) {
  if (!node || typeof node.type !== 'string') return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) walkPlain(child, visitor);
    } else {
      walkPlain(value, visitor);
    }
  }
}

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionDeclaration')
  );
}

function isButtonClickProperty(node, buttonNames) {
  const name = getPropertyName(node.key);
  if (name !== 'click' && name !== 'onClick') return false;

  const options = node.parent;
  const buttonCall = options?.parent;
  return Boolean(
    options?.type === 'ObjectExpression' &&
      buttonCall?.type === 'CallExpression' &&
      buttonCall.callee.type === 'Identifier' &&
      buttonNames.has(buttonCall.callee.name),
  );
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(node, computed = false) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (computed && node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}
