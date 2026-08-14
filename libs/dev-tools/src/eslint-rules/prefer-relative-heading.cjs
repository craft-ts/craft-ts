'use strict';

const { HEADING_HELPERS } = require('./html-helpers.cjs');
const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'In Craft templates, use heading() instead of absolute h1–h6 so outline level comes from composition.',
    },
    schema: [],
    fixable: 'code',
    messages: {
      absolute:
        'Use heading(...) instead of {{callee}}(...). Absolute heading levels break when the component is composed under a different parent.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename() ?? '';
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(filename)) return {};
    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag) return;
        if (HEADING_HELPERS.has(call.tag) || (call.via === 'h' && HEADING_HELPERS.has(call.tag))) {
          context.report({
            node,
            messageId: 'absolute',
            data: { callee: call.via === 'helper' ? call.tag : `h('${call.tag}')` },
            fix(fixer) {
              if (call.via === 'helper' && node.callee.type === 'Identifier') {
                return fixer.replaceText(node.callee, 'heading');
              }
              return null;
            },
          });
        }
      },
    };
  },
};
