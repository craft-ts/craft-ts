'use strict';

const {
  parseHyperscriptCall,
  staticPropString,
} = require('./hyperscript-walk.cjs');
const {
  isLabelableCall,
  labelFor,
  firstLabelableDescendant,
} = require('./labelable-elements.cjs');

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every label to be associated with a labelable element (button, input other than type=hidden, meter, output, progress, select, textarea) via htmlFor or wrapping.',
    },
    schema: [],
    messages: {
      unassociated:
        'label must be associated with a labelable element: wrap a button, input (not type=hidden), meter, output, progress, select, or textarea, or set htmlFor to its id. An element with only a role (e.g. div role=switch) is not labelable; use the native element instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const labels = [];
    /** Static ids of labelable elements in this file. */
    const controlIds = new Set();
    /** Static ids of non-labelable elements (e.g. hidden input, div role=switch). */
    const otherIds = new Set();

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call) return;
        if (call.tag === 'label') labels.push(call);
        const id = staticPropString(call.props, 'id');
        if (id) (isLabelableCall(call) ? controlIds : otherIds).add(id);
      },
      'Program:exit'() {
        for (const label of labels) {
          if (firstLabelableDescendant(label.children, sourceCode)) continue;
          const htmlFor = labelFor(label);
          if (htmlFor.present) {
            const target = htmlFor.value;
            // A dynamic htmlFor, or an id this file does not declare statically
            // (spread props, another component), gets the benefit of the
            // doubt. Only an id proven to belong to a non-labelable element
            // in this file is reported.
            if (
              target === undefined ||
              controlIds.has(target) ||
              !otherIds.has(target)
            ) {
              continue;
            }
          }
          context.report({ node: label.node, messageId: 'unassociated' });
        }
      },
    };
  },
};
