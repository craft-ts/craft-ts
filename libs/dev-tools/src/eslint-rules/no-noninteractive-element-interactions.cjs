'use strict';

const { NONINTERACTIVE_TAGS, INTERACTIVE_ROLES } = require('./html-helpers.cjs');
const { parseHyperscriptCall, hasProp, staticPropString, property } = require('./hyperscript-walk.cjs');

const INTERACTION_PROPS = new Set([
  'click',
  'onClick',
  'keydown',
  'onKeydown',
  'keyup',
  'onKeyup',
  'keypress',
  'onKeypress',
]);

function hasInteraction(props) {
  if (!props || props.type !== 'ObjectExpression') return false;
  return props.properties.some((entry) => {
    if (entry.type !== 'Property' || entry.computed) return false;
    const name =
      entry.key.type === 'Identifier'
        ? entry.key.name
        : entry.key.type === 'Literal'
          ? String(entry.key.value)
          : '';
    return INTERACTION_PROPS.has(name);
  });
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid click/keydown on non-interactive elements unless they have an interactive role and tabIndex.',
    },
    schema: [],
    messages: {
      noninteractive:
        'Do not add {{handler}} to <{{tag}}>. Use a button/a, or add an interactive role plus tabIndex.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !NONINTERACTIVE_TAGS.has(call.tag)) return;
        if (!hasInteraction(call.props)) return;
        const role = staticPropString(call.props, 'role');
        const hasTabIndex = hasProp(call.props, 'tabIndex') || hasProp(call.props, 'tabindex');
        if (role && INTERACTIVE_ROLES.has(role) && hasTabIndex) return;
        const handler = property(call.props, 'click')
          ? 'click'
          : property(call.props, 'keydown')
            ? 'keydown'
            : 'keyboard/pointer handlers';
        context.report({
          node,
          messageId: 'noninteractive',
          data: { tag: call.tag, handler },
        });
      },
    };
  },
};
