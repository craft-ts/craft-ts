const CORE_PACKAGE = '@craft-ts/core';
const EFFECT_PACKAGE = '@craft-ts/effect';

const TRIGGER_PRIMITIVES = new Set([
  'asyncProcess',
  'asyncProcessEffect',
  'mutation',
  'mutationEffect',
  'query',
  'queryEffect',
]);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        "Disallow a state() primitive whose only purpose is to feed params into a query/mutation/asyncProcess trigger; use the primitive's own `method` option instead.",
    },
    schema: [],
    messages: {
      preferMethod:
        "'{{name}}' is only used to feed 'params' into {{primitive}}(...); it is never read for anything else. Drop the state() and trigger {{primitive}} directly with its own `method` option instead.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const stateLocalNames = new Set();
    const primitiveLocalNames = new Map();
    const declarators = [];

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        if (
          node.source.value !== CORE_PACKAGE &&
          node.source.value !== EFFECT_PACKAGE
        ) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind === 'type'
          ) {
            continue;
          }

          const importedName = getIdentifierName(specifier.imported);
          if (!importedName) continue;

          if (importedName === 'state') {
            stateLocalNames.add(specifier.local.name);
          }
          if (TRIGGER_PRIMITIVES.has(importedName)) {
            primitiveLocalNames.set(specifier.local.name, importedName);
          }
        }
      },

      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !node.init) return;
        if (!isStateCreation(node.init, stateLocalNames)) return;

        declarators.push(node);
      },

      'Program:exit'() {
        for (const declarator of declarators) {
          const [variable] = sourceCode.getDeclaredVariables(declarator);
          if (!variable) continue;

          let paramsUsage = null;
          let hasOtherRead = false;

          for (const reference of variable.references) {
            const identifier = reference.identifier;
            if (identifier === declarator.id) continue;

            const usage = classifyReference(identifier, primitiveLocalNames);

            if (usage.kind === 'params') {
              if (!paramsUsage) paramsUsage = usage;
              continue;
            }
            if (usage.kind === 'trigger-call' || usage.kind === 'exposure') {
              continue;
            }

            hasOtherRead = true;
          }

          if (paramsUsage && !hasOtherRead) {
            context.report({
              node: paramsUsage.reportNode,
              messageId: 'preferMethod',
              data: { name: variable.name, primitive: paramsUsage.primitive },
            });
          }
        }
      },
    };
  },
};

function isStateCreation(node, stateLocalNames) {
  let current = node;
  while (current) {
    if (current.type === 'YieldExpression') {
      current = current.argument;
      continue;
    }
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression'
    ) {
      current = current.expression;
      continue;
    }
    if (current.type !== 'CallExpression') return false;

    return (
      current.callee.type === 'Identifier' &&
      stateLocalNames.has(current.callee.name)
    );
  }
  return false;
}

// Classifies one scope-accurate reference to a `state()` binding:
// - 'params': it is (directly, or via a zero-arg wrapper) the `params` value
//   of a tracked query/mutation/asyncProcess trigger primitive.
// - 'trigger-call': it is the receiver of a custom action, e.g. `request.run(x)`
//   — this is exactly how the trigger fires today and is not a "read".
// - 'exposure': it is only handed back through `return { request, ... }` (or an
//   arrow's implicit object return) so a caller/template can reach the trigger
//   call above — not itself a read of the state's value.
// - 'read': anything else (the state's value is consumed for real, e.g.
//   displayed in a template) — this disqualifies the rule.
function classifyReference(identifier, primitiveLocalNames) {
  const parent = identifier.parent;

  if (isTriggerCallTarget(identifier, parent)) {
    return { kind: 'trigger-call' };
  }

  const directParams = getParamsPropertyInfo(identifier, primitiveLocalNames);
  if (directParams) return { kind: 'params', ...directParams };

  if (
    parent.type === 'CallExpression' &&
    parent.callee === identifier &&
    parent.arguments.length === 0
  ) {
    const arrow = findEnclosingTrivialArrow(parent);
    if (arrow) {
      const wrappedParams = getParamsPropertyInfo(arrow, primitiveLocalNames);
      if (wrappedParams) return { kind: 'params', ...wrappedParams };
    }
  }

  if (isReturnedExposure(identifier, parent)) {
    return { kind: 'exposure' };
  }

  return { kind: 'read' };
}

function isTriggerCallTarget(node, parent) {
  return (
    parent &&
    parent.type === 'MemberExpression' &&
    parent.object === node &&
    parent.parent &&
    parent.parent.type === 'CallExpression' &&
    parent.parent.callee === parent
  );
}

// If `valueNode` (an Identifier or the ArrowFunctionExpression wrapping a
// zero-arg read) is exactly the `params:` value of a tracked trigger
// primitive's config object, returns { primitive, reportNode }.
function getParamsPropertyInfo(valueNode, primitiveLocalNames) {
  const property = valueNode.parent;
  if (
    !property ||
    property.type !== 'Property' ||
    property.value !== valueNode ||
    property.computed ||
    getPropertyName(property.key) !== 'params'
  ) {
    return undefined;
  }

  const objectExpression = property.parent;
  if (!objectExpression || objectExpression.type !== 'ObjectExpression') {
    return undefined;
  }

  const call = objectExpression.parent;
  if (
    !call ||
    call.type !== 'CallExpression' ||
    call.callee.type !== 'Identifier' ||
    !call.arguments.includes(objectExpression)
  ) {
    return undefined;
  }

  const primitive = primitiveLocalNames.get(call.callee.name);
  if (!primitive) return undefined;

  return { primitive, reportNode: property };
}

// Matches `params: () => request()` (or the equivalent `{ return request(); }`
// block body) — returns the ArrowFunctionExpression so the caller can check
// whether *it* is the `params:` value.
function findEnclosingTrivialArrow(callNode) {
  const parent = callNode.parent;
  if (parent.type === 'ArrowFunctionExpression' && parent.body === callNode) {
    return parent;
  }

  if (parent.type === 'ReturnStatement' && parent.argument === callNode) {
    const block = parent.parent;
    if (
      block &&
      block.type === 'BlockStatement' &&
      block.parent &&
      block.parent.type === 'ArrowFunctionExpression' &&
      block.parent.body === block
    ) {
      return block.parent;
    }
  }

  return undefined;
}

// Being handed back through `return { request, ... }` (or an arrow's implicit
// object return) just exposes the trigger to the template/caller — it is not
// itself a read of the state's value, so it must not disqualify the rule.
function isReturnedExposure(node, property) {
  if (!property || property.type !== 'Property') return false;
  const isValuePosition =
    property.value === node || (property.shorthand && property.key === node);
  if (!isValuePosition) return false;

  const objectExpression = property.parent;
  if (!objectExpression || objectExpression.type !== 'ObjectExpression') {
    return false;
  }

  const container = objectExpression.parent;
  if (!container) return false;

  if (container.type === 'ReturnStatement') {
    return container.argument === objectExpression;
  }
  if (container.type === 'ArrowFunctionExpression') {
    return container.body === objectExpression;
  }

  return false;
}

function getPropertyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}
