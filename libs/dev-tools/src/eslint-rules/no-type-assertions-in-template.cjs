module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid TypeScript type assertions while constructing a Craft component template.',
    },
    schema: [],
    messages: {
      forbidden:
        'Do not use type assertions in a Craft template. Fix the type in the component logic or expose a correctly typed derived value.',
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

        if (isTemplatePipe(node)) {
          return 'skip';
        }

        if (
          node.type === 'TSAsExpression' ||
          node.type === 'TSTypeAssertion'
        ) {
          context.report({ node, messageId: 'forbidden' });
          return 'skip';
        }
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      // DOM event and output callbacks are executable action boundaries. Type
      // assertions used to narrow an external event payload are not template
      // render logic, so keep them outside this restriction.
      if (isEventProperty(node)) return;

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
  'durationchange',
  'emptied',
  'ended',
  'error',
  'focus',
  'formdata',
  'fullscreenchange',
  'fullscreenerror',
  'gotpointercapture',
  'input',
  'invalid',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'loadeddata',
  'loadedmetadata',
  'loadstart',
  'lostpointercapture',
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
  'progress',
  'ratechange',
  'reset',
  'resize',
  'scroll',
  'scrollend',
  'securitypolicyviolation',
  'seeked',
  'seeking',
  'select',
  'selectionchange',
  'selectstart',
  'slotchange',
  'stalled',
  'submit',
  'suspend',
  'timeupdate',
  'toggle',
  'touchcancel',
  'touchend',
  'touchmove',
  'touchstart',
  'transitioncancel',
  'transitionend',
  'transitionrun',
  'transitionstart',
  'volumechange',
  'waiting',
  'wheel',
]);

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

function isNestedCraftComponent(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'craftComponent'
  );
}

function isTemplatePipe(node) {
  if (node.type !== 'CallExpression') return false;

  if (node.callee.type === 'Identifier') {
    return node.callee.name === 'pipe';
  }

  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'pipe'
  );
}
