'use strict';

const { parseHyperscriptCall, hasAccessibleName, staticPropString } = require('./hyperscript-walk.cjs');

const NAMED_CONTROLS = new Set(['button', 'a', 'textarea', 'select', 'svg']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an accessible name on buttons, links, labelled form controls, and interactive SVG.',
    },
    schema: [],
    messages: {
      missingName:
        '<{{tag}}> must have an accessible name (text children, aria-label, aria-labelledby, or a <label>).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag) return;
        if (call.tag === 'input') {
          const type = staticPropString(call.props, 'type') ?? 'text';
          if (type === 'hidden') return;
          if (hasAccessibleName(call)) return;
          // An input may be named by a sibling label[htmlFor] — checked by label-has-associated-control.
          // Still require a name on the control itself when it is a button-like type.
          if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') {
            context.report({ node, messageId: 'missingName', data: { tag: `input[type=${type}]` } });
          }
          return;
        }
        if (!NAMED_CONTROLS.has(call.tag)) return;
        if (call.tag === 'svg') {
          const role = staticPropString(call.props, 'role');
          const hasHandler =
            call.props &&
            call.props.properties.some(
              (entry) =>
                entry.type === 'Property' &&
                ((entry.key.type === 'Identifier' &&
                  (entry.key.name === 'click' || entry.key.name === 'onClick')) ||
                  (entry.key.type === 'Literal' &&
                    (entry.key.value === 'click' || entry.key.value === 'onClick'))),
            );
          if (role !== 'button' && role !== 'img' && !hasHandler) return;
        }
        if (hasAccessibleName(call)) return;
        context.report({ node, messageId: 'missingName', data: { tag: call.tag } });
      },
    };
  },
};
