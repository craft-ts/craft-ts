'use strict';

const { parseHyperscriptCall, hasProp, staticPropString, walk } = require('./hyperscript-walk.cjs');

function isControlTag(tag) {
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function controlId(call) {
  return staticPropString(call.props, 'id');
}

function wrapsControl(children, sourceCode) {
  let found = false;
  if (!children) return found;
  walk(children, sourceCode, (candidate) => {
    const call = parseHyperscriptCall(candidate);
    if (call && isControlTag(call.tag)) {
      found = true;
      return 'skip';
    }
  });
  return found;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require every label to be associated with a form control via htmlFor or wrapping.',
    },
    schema: [],
    messages: {
      unassociated:
        'label must be associated with a control: wrap the control or set htmlFor to match the control id.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const labels = [];
    const controlIds = new Set();

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        if (call.tag === 'label') labels.push(call);
        if (isControlTag(call.tag)) {
          const id = controlId(call);
          if (id) controlIds.add(id);
        }
      },
      'Program:exit'() {
        for (const label of labels) {
          if (wrapsControl(label.children, sourceCode)) continue;
          const htmlFor = staticPropString(label.props, 'htmlFor') ?? staticPropString(label.props, 'for');
          if (htmlFor && controlIds.has(htmlFor)) continue;
          if (hasProp(label.props, 'htmlFor') || hasProp(label.props, 'for')) {
            // Dynamic htmlFor — give the author the benefit of the doubt.
            continue;
          }
          context.report({ node: label.node, messageId: 'unassociated' });
        }
      },
    };
  },
};
