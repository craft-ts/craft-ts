'use strict';

const { walk } = require('./hyperscript-walk.cjs');

function isCallNamed(node, name) {
  return (
    !!node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === name
  );
}

function isInside(node, ancestorName, stopName) {
  let current = node.parent;
  while (current) {
    if (isCallNamed(current, ancestorName)) return true;
    if (isCallNamed(current, stopName)) return false;
    current = current.parent;
  }
  return false;
}

function collectCalls(node, sourceCode, name) {
  const found = [];
  walk(node, sourceCode, (candidate) => {
    if (isCallNamed(candidate, name)) found.push(candidate);
  });
  return found;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Layouts that call heading() must wrap CraftRouterOutlet in headingSection(); shells must not put heading() above the outlet.',
    },
    schema: [],
    messages: {
      wrapOutlet:
        'A component that calls heading() and CraftRouterOutlet() must wrap the outlet in headingSection(...) so child routes inherit h2+. Shells must not put heading() above the outlet.',
      layoutHeading:
        'A layout that wraps CraftRouterOutlet() in headingSection(...) must also call heading() for the layout title.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (!isCallNamed(node, 'craftComponent')) return;
        const template = node.arguments[3];
        if (!template) return;
        const outlets = collectCalls(template, sourceCode, 'CraftRouterOutlet');
        if (outlets.length === 0) return;
        const headings = collectCalls(template, sourceCode, 'heading');
        const wrapped = outlets.every((outlet) =>
          isInside(outlet, 'headingSection', 'craftComponent'),
        );
        if (headings.length > 0 && !wrapped) {
          context.report({ node: outlets[0], messageId: 'wrapOutlet' });
          return;
        }
        if (wrapped && headings.length === 0) {
          context.report({ node: outlets[0], messageId: 'layoutHeading' });
        }
      },
    };
  },
};
