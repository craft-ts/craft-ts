'use strict';

const {
  parseHyperscriptCall,
  hasAccessibleName,
  staticPropString,
} = require('./hyperscript-walk.cjs');
const {
  isLabelableCall,
  labelFor,
  firstLabelableDescendant,
  wrappingLabel,
  labelProvidesName,
} = require('./labelable-elements.cjs');

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
        '<{{tag}}> must have an accessible name (text children, aria-label, aria-labelledby, or a <label> with text that wraps it or whose htmlFor matches its id).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    /** Nameless controls, resolved against the file's labels at Program:exit. */
    const candidates = [];
    /** Static `for`/`htmlFor` id → labels pointing at it. */
    const labelsByFor = new Map();

    /**
     * Whether a label provides the control's name: the label wrapping it
     * (when the control is its first labelable descendant and the label has
     * no static `for` naming another id than the control's static id), or a
     * label whose static `for` matches the control's id in the same file.
     */
    function namedByLabel(call) {
      if (!isLabelableCall(call)) return false;
      const id = staticPropString(call.props, 'id');
      const wrapping = wrappingLabel(call.node);
      if (wrapping) {
        const htmlFor = labelFor(wrapping);
        const forAllowsWrapping =
          !htmlFor.present ||
          htmlFor.value === undefined ||
          // Without a static id the control's id is unknown: benefit of the doubt.
          id === undefined ||
          htmlFor.value === id;
        if (
          forAllowsWrapping &&
          firstLabelableDescendant(wrapping.children, sourceCode)?.node ===
            call.node &&
          labelProvidesName(wrapping, call.node)
        ) {
          return true;
        }
      }
      if (!id) return false;
      return (labelsByFor.get(id) ?? []).some((label) =>
        labelProvidesName(label, call.node),
      );
    }

    function report(call, tag) {
      candidates.push({ call, tag });
    }

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag) return;
        if (call.tag === 'label') {
          const htmlFor = labelFor(call).value;
          if (htmlFor) {
            const labels = labelsByFor.get(htmlFor) ?? [];
            labels.push(call);
            labelsByFor.set(htmlFor, labels);
          }
          return;
        }
        if (call.tag === 'input') {
          const type = staticPropString(call.props, 'type') ?? 'text';
          if (type === 'hidden') return;
          if (hasAccessibleName(call)) return;
          // An input may be named by a sibling label[htmlFor] — checked by label-has-associated-control.
          // Still require a name on the control itself when it is a button-like type.
          if (
            type === 'button' ||
            type === 'submit' ||
            type === 'reset' ||
            type === 'image'
          ) {
            report(call, `input[type=${type}]`);
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
                  (entry.key.name === 'click' ||
                    entry.key.name === 'onClick')) ||
                  (entry.key.type === 'Literal' &&
                    (entry.key.value === 'click' ||
                      entry.key.value === 'onClick'))),
            );
          if (role !== 'button' && role !== 'img' && !hasHandler) return;
        }
        if (hasAccessibleName(call)) return;
        report(call, call.tag);
      },
      'Program:exit'() {
        for (const { call, tag } of candidates) {
          if (namedByLabel(call)) continue;
          context.report({
            node: call.node,
            messageId: 'missingName',
            data: { tag },
          });
        }
      },
    };
  },
};
