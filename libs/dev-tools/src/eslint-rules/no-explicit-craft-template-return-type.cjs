module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow explicit return annotations in Craft component templates so concrete node and dependency types remain inferred.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      explicit:
        'Do not annotate a Craft template callback return type explicitly. Let Craft infer the concrete node children so dependency and type-safe DI inference remain intact and runtime errors are avoided.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }

        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isNestedCraftComponent(node)) {
          return 'skip';
        }

        // Event callbacks are action boundaries. Their return value is not a
        // rendered node, so an explicit action return contract does not widen
        // the template's node/dependency type.
        if (isEventProperty(node)) {
          return 'skip';
        }

        if (!isFunction(node) || !node.returnType) {
          return;
        }

        context.report({
          node: node.returnType,
          messageId: 'explicit',
          fix(fixer) {
            return fixer.remove(node.returnType);
          },
        });
      });
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

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}

function isEventProperty(node) {
  if (node.type !== 'Property' || node.computed) return false;

  const propertyName =
    node.key.type === 'Identifier'
      ? node.key.name
      : node.key.type === 'Literal' && typeof node.key.value === 'string'
        ? node.key.value
        : undefined;

  return Boolean(
    propertyName &&
      (DOM_EVENT_NAMES.has(propertyName) || /^on[A-Z]/.test(propertyName)),
  );
}

const DOM_EVENT_NAMES = new Set([
  'abort',
  'animationcancel',
  'animationend',
  'animationiteration',
  'animationstart',
  'blur',
  'change',
  'click',
  'close',
  'compositionend',
  'compositionstart',
  'compositionupdate',
  'contextmenu',
  'copy',
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
  'keydown',
  'keypress',
  'keyup',
  'load',
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
