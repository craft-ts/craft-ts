const CORE_PACKAGE = '@craft-ts/core';
const REACTIVE_VALUE_BRAND = 'RAW_REACTIVE_VALUE';
const READ_ONLY_FIELD_ACCESSORS = new Set(['file', 'filePath', 'line']);

const MEMBER_ACTIONS = new Map([
  ['call', 'query.call'],
  ['mutate', 'mutation.mutate'],
  ['method', 'asyncProcess.method'],
  ['set', 'state.set'],
  ['update', 'state.update'],
  ['patch', 'state.patch'],
  ['reset', 'state.reset'],
  ['restore', 'state.restore'],
  ['unset', 'state.unset'],
  ['emit', 'source$.emit'],
  ['next', 'source$.next'],
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep Craft template event handlers declarative by emitting one source event instead of chaining imperative actions. Reading a reactive value with yield* is not an action.',
    },
    schema: [],
    messages: {
      chain:
        'Template event handlers must not chain imperative Craft actions ({{actions}}). Emit one source$ event and let query, mutation, and state react through on$. Reading a reactive value with yield* is allowed.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const componentNames = new Set(['craftComponent']);
    // Type information tells a reactive read from an action: both are
    // `yield* View.member()`. Without it the rule only knows the generic
    // action names, as it always did.
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== CORE_PACKAGE) return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getIdentifierName(specifier.imported) === 'craftComponent'
          ) {
            componentNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !componentNames.has(node.callee.name) ||
          node.arguments.length < 3
        ) {
          return;
        }

        inspectTemplate(node.arguments[2]);
      },
    };

    function inspectTemplate(template) {
      walkTemplate(template, (node) => {
        if (node.type !== 'Property' || node.computed) return;

        const callback = node.value;
        if (!isFunction(callback)) return;
        // A component prop such as `trigger: function* () {}` runs like an
        // event handler: it is a generator the component calls on a gesture.
        if (!isEventProperty(node) && !callback.generator) return;

        const actions = [];
        const delegated = new Set();
        walk(callback.body, (child) => {
          if (child.type === 'YieldExpression' && child.delegate) {
            const call = skipParens(child.argument);
            if (call?.type !== 'CallExpression') return;
            delegated.add(call);
            if (isReactiveRead(call)) return;
            const action = getAction(call) ?? getDelegatedAction(call);
            if (action) actions.push({ node: call, action });
            return;
          }

          if (child.type !== 'CallExpression' || delegated.has(child)) return;
          const action = getAction(child);
          if (action) actions.push({ node: child, action });
        });

        if (actions.length < 2) return;

        context.report({
          node: actions[1].node,
          messageId: 'chain',
          data: { actions: actions.map(({ action }) => action).join(', ') },
        });
      });
    }

    // `yield* View.lastActionLabel.recordConfirm()`: a service method whose
    // name says what it does, not `set`. Only counted once the type shows it is
    // not a reactive reader.
    function getDelegatedAction(node) {
      if (!checker || !nodeMap) return undefined;
      if (node.callee.type !== 'MemberExpression') return undefined;
      const member = getPropertyName(
        node.callee.property,
        node.callee.computed,
      );
      if (!member || READ_ONLY_FIELD_ACCESSORS.has(member)) return undefined;
      return sourceCode.getText(node.callee).split('.').slice(-2).join('.');
    }

    function isReactiveRead(node) {
      if (!checker || !nodeMap) return false;
      const calleeNode = nodeMap.get(node.callee);
      const callNode = nodeMap.get(node);
      return (
        (Boolean(calleeNode) &&
          hasBrand(checker.getTypeAtLocation(calleeNode))) ||
        (Boolean(callNode) && hasBrand(checker.getTypeAtLocation(callNode)))
      );
    }

    function hasBrand(type) {
      if (type.isUnion?.() || type.isIntersection?.()) {
        return type.types.some(hasBrand);
      }
      return checker
        .getPropertiesOfType(type)
        .some((property) => {
          const name = String(property.escapedName);
          return (
            name.includes(REACTIVE_VALUE_BRAND) ||
            name === '__craftDeepYieldable'
          );
        });
    }

    function getAction(node) {
      if (node.callee.type === 'MemberExpression') {
        const property = getPropertyName(
          node.callee.property,
          node.callee.computed,
        );
        return property ? MEMBER_ACTIONS.get(property) : undefined;
      }

      if (
        node.callee.type === 'Identifier' &&
        /^(?:set|update|reset|restore|unset|patch)[A-Z_]/.test(node.callee.name)
      ) {
        return node.callee.name;
      }

      return undefined;
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
  },
};

const DOM_EVENT_NAMES = new Set([
  'abort',
  'animationcancel',
  'animationend',
  'animationiteration',
  'animationstart',
  'auxclick',
  'beforeinput',
  'beforematch',
  'beforetoggle',
  'blur',
  'canplay',
  'canplaythrough',
  'change',
  'click',
  'close',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'copy',
  'cuechange',
  'cut',
  'dblclick',
  'drag',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'dragstart',
  'drop',
  'error',
  'focus',
  'formdata',
  'fullscreenchange',
  'fullscreenerror',
  'input',
  'invalid',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'paste',
  'pause',
  'play',
  'playing',
  'pointercancel',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'reset',
  'resize',
  'scroll',
  'submit',
  'toggle',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'transitioncancel',
  'transitionend',
  'transitionrun',
  'transitionstart',
  'wheel',
]);

function isEventProperty(node) {
  const propertyName = getPropertyName(node.key, false);
  return Boolean(
    propertyName &&
      (DOM_EVENT_NAMES.has(propertyName) || /^on[A-Z]/.test(propertyName)),
  );
}

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}

function skipParens(node) {
  let current = node;
  while (current?.type === 'TSNonNullExpression') current = current.expression;
  return current;
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

function getPropertyName(node, computed) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (computed && node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
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
