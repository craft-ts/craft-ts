'use strict';

/**
 * Label association shared by `label-has-associated-control` and
 * `control-has-accessible-name`.
 *
 * Labelable elements follow the HTML Standard
 * (https://html.spec.whatwg.org/multipage/forms.html#category-label):
 * button, input (unless type=hidden), meter, output, progress, select,
 * textarea, and form-associated custom elements.
 *
 * A custom element is form-associated only when its class declares
 * `static formAssociated = true`, which a per-file lint rule cannot see from a
 * `customElement('x-tag', …)` call; custom elements are therefore never
 * treated as labelable here.
 */

const {
  hasDynamicAccessibleName,
  hasProp,
  parseHyperscriptCall,
  staticPropString,
  staticTextContent,
  walk,
} = require('./hyperscript-walk.cjs');

const LABELABLE_TAGS = new Set([
  'button',
  'input',
  'meter',
  'output',
  'progress',
  'select',
  'textarea',
]);

/** Whether a parsed hyperscript call renders a labelable element. */
function isLabelableCall(call) {
  if (!call || call.via === 'customElement' || !call.tag) return false;
  if (!LABELABLE_TAGS.has(call.tag)) return false;
  if (call.tag === 'input') {
    const type = staticPropString(call.props, 'type');
    // A dynamic type gets the benefit of the doubt.
    return type === undefined || type.toLowerCase() !== 'hidden';
  }
  return true;
}

/**
 * The label's `for` attribute (`htmlFor` or `for`): `{ present, value }`,
 * where `value` is the static id or `undefined` when it is dynamic.
 */
function labelFor(labelCall) {
  const present =
    hasProp(labelCall.props, 'htmlFor') || hasProp(labelCall.props, 'for');
  const value =
    staticPropString(labelCall.props, 'htmlFor') ??
    staticPropString(labelCall.props, 'for');
  return { present, value };
}

/**
 * The first labelable descendant of a label's children in source order —
 * the control a label without a `for` attribute labels.
 */
function firstLabelableDescendant(children, sourceCode) {
  let found;
  if (!children) return found;
  walk(children, sourceCode, (candidate) => {
    if (found) return 'skip';
    const call = parseHyperscriptCall(candidate);
    if (call && isLabelableCall(call)) {
      found = call;
      return 'skip';
    }
  });
  return found;
}

function contains(outer, inner) {
  return (
    !!outer &&
    !!inner &&
    outer.range[0] <= inner.range[0] &&
    inner.range[1] <= outer.range[1]
  );
}

/** The nearest `label` call whose children contain `node`, if any. */
function wrappingLabel(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== 'CallExpression') continue;
    const call = parseHyperscriptCall(current);
    if (call && call.tag === 'label') {
      return contains(call.children, node) ? call : undefined;
    }
  }
  return undefined;
}

/**
 * Whether the label's content provides an accessible name, ignoring the
 * labelled control's own subtree. Text follows the same notion as
 * `hasAccessibleName`: static text, i18n `t(...)`/`translate(...)` calls, or a
 * dynamic child.
 */
function labelProvidesName(labelCall, controlNode) {
  const text = staticTextContent(labelCall.children, controlNode).trim();
  if (text.length > 0) return true;
  return hasDynamicAccessibleName(labelCall.children, controlNode);
}

module.exports = {
  LABELABLE_TAGS,
  isLabelableCall,
  labelFor,
  firstLabelableDescendant,
  wrappingLabel,
  labelProvidesName,
};
