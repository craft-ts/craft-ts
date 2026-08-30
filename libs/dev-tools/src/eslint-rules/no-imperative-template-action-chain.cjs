const CORE_PACKAGE = '@craft-ts/core';

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
        'Keep Craft template event handlers declarative by emitting one source event instead of chaining imperative actions.',
    },
    schema: [],
    messages: {
      chain:
        'Template event handlers must not chain imperative Craft actions ({{actions}}). Emit one source$ event and let query, mutation, and state react through on$.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const componentNames = new Set(['craftComponent']);

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
          node.arguments.length < 4
        ) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walkTemplate(template, (node) => {
        if (
          node.type !== 'Property' ||
          node.computed ||
          !isEventProperty(node)
        ) {
          return;
        }

        const callback = node.value;
        if (!isFunction(callback)) return;

        const actions = [];
        walk(callback.body, (child) => {
          if (child.type !== 'CallExpression') return;
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
