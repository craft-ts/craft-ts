const CORE_PACKAGE = '@craft-ts/core';

const IMPERATIVE_ACTIONS = new Map([
  ['call', 'query.call'],
  ['mutate', 'mutation.mutate'],
  ['method', 'asyncProcess.method'],
  ['set', 'state.set'],
  ['update', 'state.update'],
  ['reset', 'state.reset'],
  ['restore', 'state.restore'],
  ['unset', 'state.unset'],
  ['emit', 'source$.emit'],
  ['setItem', 'storage.setItem'],
  ['removeItem', 'storage.removeItem'],
  ['clear', 'storage.clear'],
  ['reload', 'resource.reload'],
  ['assign', 'BrowserLocation.assign'],
  ['replace', 'BrowserLocation.replace'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow composing multiple imperative actions in craftMethod and direct writes to multiple states in exposed craftService methods.',
    },
    schema: [],
    messages: {
      multiple:
        'craftMethod composes multiple imperative actions ({{actions}}). Emit a source$ event and let the affected query react with insertReactOnMutation(...).',
      multipleStateWrites:
        'craftExpose method writes to multiple states ({{states}}) imperatively. Emit one source$ event and let each state react with on$().',
      repeatedStateWrite:
        "craftExpose method writes to state '{{state}}' more than once. Emit one source$ event and let the state react with on$().",
    },
  },

  create(context) {
    const craftMethodNames = new Set(['craftMethod']);
    const craftServiceNames = new Set(['craftService']);
    const craftExposeNames = new Set(['craftExpose']);
    const craftMethodCalls = [];
    const craftExposeCalls = [];
    const functions = new Map();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const importedName = getIdentifierName(specifier.imported);
            if (importedName === 'craftMethod') {
              craftMethodNames.add(specifier.local.name);
            }
            if (importedName === 'craftService') {
              craftServiceNames.add(specifier.local.name);
            }
            if (importedName === 'craftExpose') {
              craftExposeNames.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (isCraftMethodCall(node, craftMethodNames)) {
          craftMethodCalls.push(node);
          return;
        }
        if (
          node.callee.type === 'Identifier' &&
          craftExposeNames.has(node.callee.name) &&
          node.arguments[1]?.type === 'Identifier'
        ) {
          craftExposeCalls.push(node.arguments[1]);
        }
      },

      FunctionDeclaration(node) {
        if (node.id) functions.set(node.id.name, node);
      },

      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && isFunction(node.init)) {
          functions.set(node.id.name, node.init);
        }
      },

      'Program:exit'() {
        for (const node of craftMethodCalls) {
          if (isInsideCraftService(node, craftServiceNames)) continue;

          const callback = [...node.arguments].reverse().find(isFunction);
          if (!callback) continue;

          const actions = [];
          walk(callback.body, (child) => {
            if (child.type !== 'CallExpression') return;

            const action = getImperativeAction(child);
            if (action) actions.push({ node: child, action });
          });

          if (actions.length < 2) continue;

          context.report({
            node: actions[1].node,
            messageId: 'multiple',
            data: {
              actions: actions.map(({ action }) => action).join(', '),
            },
          });
        }

        // A craftService can expose methods that coordinate several states.
        // Keep browser/protocol orchestration valid, while requiring state
        // changes to be expressed as one source event and per-state reactions.
        const inspectedFunctions = new Set();
        for (const identifier of craftExposeCalls) {
          const callback = functions.get(identifier.name);
          if (!callback || !isInsideCraftService(identifier, craftServiceNames))
            continue;
          if (inspectedFunctions.has(callback)) continue;
          inspectedFunctions.add(callback);

          const writesByBlock = new Map();
          walkExposedMethod(callback.body, (child) => {
            if (child.type !== 'CallExpression') return;
            const write = getStateWrite(child, context.sourceCode);
            if (!write) return;

            const state = resolveStateBinding(write.node, context.sourceCode);
            const block = nearestBlock(child, callback.body);
            const writes = writesByBlock.get(block) ?? [];
            writes.push({
              node: child,
              ...write,
              branch: exclusiveBranch(child, block),
            });
            writesByBlock.set(block, writes);
          });
          for (const writes of writesByBlock.values()) {
            const writesByState = new Map();
            for (const write of writes) {
              const sites = writesByState.get(write.state) ?? [];
              sites.push(write);
              writesByState.set(write.state, sites);
            }
            if (writesByState.size > 1) {
              const secondState = writes.find(
                ({ state }) => state !== writes[0].state,
              );
              context.report({
                node: secondState.node,
                messageId: 'multipleStateWrites',
                data: { states: [...writesByState.keys()].join(', ') },
              });
            }
            const writesByBranchAndState = new Map();
            for (const write of writes) {
              const statesByBranch = writesByBranchAndState.get(write.branch) ?? new Map();
              const sites = statesByBranch.get(write.state) ?? [];
              sites.push(write);
              statesByBranch.set(write.state, sites);
              writesByBranchAndState.set(write.branch, statesByBranch);
            }
            for (const statesByBranch of writesByBranchAndState.values()) {
              for (const [state, sites] of statesByBranch) {
                for (const repeated of sites.slice(1)) {
                context.report({
                  node: repeated.node,
                  messageId: 'repeatedStateWrite',
                  data: { state },
                });
                }
              }
            }
          }
        }
      },
    };
  },
};

function isCraftMethodCall(node, names) {
  return node.callee.type === 'Identifier' && names.has(node.callee.name);
}

function isInsideCraftService(node, names) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      names.has(current.callee.name)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function getImperativeAction(node) {
  if (node.callee.type !== 'MemberExpression') return undefined;

  const property = node.callee.computed
    ? node.callee.property.type === 'Literal'
      ? String(node.callee.property.value)
      : undefined
    : node.callee.property.type === 'Identifier'
      ? node.callee.property.name
      : undefined;

  return property ? IMPERATIVE_ACTIONS.get(property) : undefined;
}

function getStateWrite(node, sourceCode) {
  if (node.callee.type !== 'MemberExpression') return undefined;
  const method = node.callee.computed
    ? node.callee.property.type === 'Literal'
      ? String(node.callee.property.value)
      : undefined
    : node.callee.property.type === 'Identifier'
      ? node.callee.property.name
      : undefined;
  if (method !== 'set' && method !== 'update') return undefined;

  // A state action is invoked directly on its reader (`status.set(...)`).
  // Chained receivers such as `url.searchParams.set(...)` and mutating
  // collections (`frameConnections.set(...)`) are ordinary object updates.
  // Treating their root identifier as a state caused false positives in
  // exposed methods that also update a Craft state.
  const object = node.callee.object;
  if (object?.type !== 'Identifier' || isCollectionBinding(object, sourceCode))
    return undefined;
  return { state: object.name, node: object };
}

function isCollectionBinding(identifier, sourceCode) {
  if (/(?:timers|connections|launches|maps?|sets|queues|caches|indexes)$/i.test(identifier.name))
    return true;
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    const definition = variable?.defs?.[0]?.node;
    if (definition?.type === 'VariableDeclarator') {
      const initializer = definition.init;
      if (
        initializer?.type === 'NewExpression' &&
        initializer.callee.type === 'Identifier' &&
        ['Map', 'Set', 'URL', 'URLSearchParams'].includes(initializer.callee.name)
      ) return true;
      break;
    }
    scope = scope.upper;
  }
  return false;
}

function resolveStateBinding(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return identifier.name;
}

function walkExposedMethod(node, visitor, isRoot = true) {
  if (!node || typeof node !== 'object') return;
  if (!isRoot && isFunctionNode(node)) return;
  if (node.type) visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') {
          walkExposedMethod(child, visitor, false);
        }
      }
    } else if (value && typeof value.type === 'string') {
      walkExposedMethod(value, visitor, false);
    }
  }
}

function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

function nearestBlock(node, stopAt) {
  let current = node.parent;
  while (current && current !== stopAt && current.type !== 'BlockStatement') {
    current = current.parent;
  }
  return current?.type === 'BlockStatement' ? current : stopAt;
}

function exclusiveBranch(node, block) {
  let branch = node;
  let parent = branch.parent;
  while (parent && parent !== block) {
    if (parent.type === 'IfStatement') {
      // The nearest if identifies this write's arm. In an `else if` chain the
      // alternate's nested IfStatement is a distinct, mutually exclusive arm.
      return parent;
    }
    branch = parent;
    parent = branch.parent;
  }
  return block;
}

function isFunction(node) {
  return (
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
}

function getIdentifierName(node) {
  return node.type === 'Identifier' ? node.name : undefined;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') walk(child, visitor);
      }
    } else if (value && typeof value.type === 'string') {
      walk(value, visitor);
    }
  }
}
